// Component evaluation: each judgment on its own (intent, emotion, risk categories, the reply
// checker). The end-to-end evaluation of the whole pipeline is eval/e2e.mts.
//
//   npx tsx eval/run.mts          rule engine (no key needed)
//   npx tsx eval/run.mts --llm    also the configured model (needs LLM_API_KEY, costs tokens)
//
// Writes eval/results.json, which the 评测 page and the deck builder read.
//
// Sets (see eval/PROVENANCE.md)
//   tuning      dev + round-1 holdout, author-written — the rules were tuned on these; reported, not evidence
//   validation  150 + 60, two independent model annotators — never read while tuning, but the router was
//               changed once from one of its aggregate figures, so it is a validation set, not a test set
//   final       120 + 40, a fresh annotator, frozen by hash (eval/final/FROZEN.json) — the headline numbers
// Every method is scored on the same items. Main results use the whole set; the items both annotators
// agree on are reported as an additional analysis.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DEV, TEST as HOLDOUT1, REPLIES_DEV, REPLIES_TEST as REPLIES_HOLDOUT1, type EvalItem, type ReplyItem } from "./dataset"
import { EMOTIONS, EMOTION_ORDER, INTENTS } from "../src/lib/constants"
import { analyzeIntent, detectRisk, emotionVector, summarizeEmotion } from "../src/lib/engine/heuristics"
import { checkCompliance } from "../src/lib/engine/audit"
import { AUDIT_PROMPT, CONSTITUTION, FULL_PROMPT, LITE_PROMPT, PERCEIVE_PROMPT } from "../src/lib/engine/prompts"
import { routeTurn, ROUTE_ORDER, type Route } from "../src/lib/engine/router"
import { estTokens, fullTranscript, fullUser, liteUser, profile } from "../src/lib/engine/context"
import { buildFactPack } from "../src/lib/engine/facts"
import { retrieve } from "../src/lib/engine/retrieval"
import { SCENARIOS } from "../src/lib/scenarios"
import { KNOWLEDGE_MAP } from "../src/lib/data"
import { detectAlerts, ALERT_TYPES, type AlertType } from "../src/lib/alerts"
import { ALL_CUSTOMERS, CONTACTS, ORDERS, TICKETS, DEMO_NOW } from "../src/lib/dataset"
import type { AnalyzeInput } from "../src/lib/engine/pipeline"
import type { EmotionKey, IntentKey, Message, RiskCategory, RiskLevel } from "../src/lib/types"

const here = path.dirname(fileURLToPath(import.meta.url))
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const readJSON = <T,>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : null)

/** Wilson score interval (95%) for a proportion, in percent. */
function wilson(k: number, n: number): [number, number] | null {
  if (!n) return null
  const z = 1.96
  const p = k / n
  const den = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / den
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [round(Math.max(0, c - h) * 100), round(Math.min(1, c + h) * 100)]
}

/* ───────────────────────── predictions and scoring ───────────────────────── */

interface Pred {
  intent: IntentKey
  intent2?: IntentKey
  emotion: EmotionKey
  risks: RiskCategory[]
  route?: Route
  tokens?: number
  ms?: number
  failed?: boolean
}

const polarity = (e: EmotionKey) => (EMOTIONS[e].valence < 0 ? "neg" : e === "calm" ? "neu" : "pos")
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
const RISKS: RiskCategory[] = ["safety", "pr", "legal", "churn", "minor", "fraud", "privacy"]
/** the categories where a miss does the most harm */
const SEVERE: RiskCategory[] = ["safety", "minor", "legal", "pr"]

function ruleEngine(text: string): Pred {
  const intent = analyzeIntent(text)
  const emo = summarizeEmotion(emotionVector(text))
  const signals = detectRisk(text, { valence: emo.valence, batchCodes: [] })
  const risks = [...new Set(signals.filter((s) => s.level >= 2).map((s) => s.category))]
  const route = routeTurn({ text, intent, emotion: emo, signalLevel: Math.max(0, ...signals.map((s) => s.level)) as RiskLevel, priorLevel: 0, hasImage: false }).route
  return { intent: intent.primary, intent2: intent.secondary, emotion: emo.dominant, risks, route }
}

function score(items: EvalItem[], preds: Pred[]) {
  let intent = 0, emotion = 0, pol = 0, tp = 0, fp = 0, fn = 0, anyAlert = 0, trueHit = 0, risky = 0, cleanFalse = 0, clean = 0
  const cat = Object.fromEntries(RISKS.map((c) => [c, { gold: 0, hit: 0, predicted: 0, correct: 0 }])) as Record<RiskCategory, { gold: number; hit: number; predicted: number; correct: number }>
  items.forEach((it, k) => {
    const p = preds[k]
    if (it.intents.includes(p.intent)) intent++
    if (it.emotions.includes(p.emotion)) emotion++
    if (it.emotions.map(polarity).includes(polarity(p.emotion))) pol++
    const gold = new Set(it.risks)
    const got = new Set(p.risks)
    for (const r of got) {
      if (gold.has(r)) tp++
      else fp++
      if (cat[r]) {
        cat[r].predicted++
        if (gold.has(r)) cat[r].correct++
      }
    }
    for (const r of gold) {
      if (!got.has(r)) fn++
      if (cat[r]) {
        cat[r].gold++
        if (got.has(r)) cat[r].hit++
      }
    }
    if (gold.size) {
      risky++
      if (got.size) anyAlert++
      if ([...got].some((r) => gold.has(r))) trueHit++
    } else {
      clean++
      if (got.size) cleanFalse++
    }
  })
  const n = items.length
  const precision = pct(tp, tp + fp)
  const recall = pct(tp, tp + fn)
  const severeGold = SEVERE.reduce((a, c) => a + cat[c].gold, 0)
  const severeHit = SEVERE.reduce((a, c) => a + cat[c].hit, 0)
  return {
    n,
    intentAcc: pct(intent, n),
    intentCI: wilson(intent, n),
    emotionAcc: pct(emotion, n),
    emotionCI: wilson(emotion, n),
    polarityAcc: pct(pol, n),
    riskPrecision: precision,
    riskRecall: recall,
    riskRecallCI: wilson(tp, tp + fn),
    riskF1: precision + recall ? round((2 * precision * recall) / (precision + recall)) : 0,
    /** recall per category: of the messages that carry this risk, how many got it */
    byCategory: Object.fromEntries(RISKS.map((c) => [c, { gold: cat[c].gold, recall: cat[c].gold ? pct(cat[c].hit, cat[c].gold) : null, precision: cat[c].predicted ? pct(cat[c].correct, cat[c].predicted) : null }])) as Record<RiskCategory, { gold: number; recall: number | null; precision: number | null }>,
    severeRecall: pct(severeHit, severeGold),
    severeMissed: severeGold - severeHit,
    severeGold,
    /** risky messages that got any alert at all — even the wrong category. Not a recall. */
    anyAlertCoverage: pct(anyAlert, risky),
    /** risky messages where at least one predicted category is right */
    trueRiskHit: pct(trueHit, risky),
    riskyN: risky,
    falseAlarm: pct(cleanFalse, clean),
    cleanN: clean,
  }
}
type Score = ReturnType<typeof score>

/** Always answering with the most common label of the tuning data — the floor any method has to beat. Same items as the method. */
function majorityBaseline(train: EvalItem[], test: EvalItem[]) {
  const mode = <T extends string>(xs: T[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())].sort((a, b) => b[1] - a[1])[0][0]
  const intent = mode(train.map((t) => t.intents[0]))
  const emotion = mode(train.map((t) => t.emotions[0]))
  return { ...score(test, test.map(() => ({ intent, emotion, risks: [] }))), intentLabel: intent, emotionLabel: emotion }
}

function scoreBlocks(items: ReplyItem[], blocked: boolean[]) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  items.forEach((it, k) => {
    if (blocked[k] && it.block) tp++
    else if (blocked[k]) fp++
    else if (it.block) fn++
    else tn++
  })
  return { n: items.length, violating: tp + fn, accuracy: pct(tp + tn, items.length), precision: pct(tp, tp + fp), recall: pct(tp, tp + fn), recallCI: wilson(tp, tp + fn), falseBlock: pct(fp, fp + tn), falseBlockCI: wilson(fp, fp + tn) }
}
const ruleBlocks = (items: ReplyItem[]) => items.map((it) => checkCompliance(it.text).some((i) => i.severity === "block"))

/** Cohen's κ for two annotators over the same items. */
function kappa(a: string[], b: string[]) {
  const n = a.length
  const labels = [...new Set([...a, ...b])]
  const po = a.filter((x, i) => x === b[i]).length / n
  const pe = labels.reduce((s, l) => s + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n), 0)
  return pe === 1 ? 1 : round((po - pe) / (1 - pe), 2)
}

/* ───────────────────────── the validation and final sets ───────────────────────── */

type Kind = "plain" | "colloquial" | "implicit" | "sarcasm" | "negation" | "decoy" | "multi" | "late_cue"
type AItem = EvalItem & { id: string; kind: Kind }
type RItem = ReplyItem & { id: string; why: string }
interface Labelled {
  messages: AItem[]
  replies: RItem[]
}
interface Second {
  messages: { id: string; intent: IntentKey; emotion: EmotionKey; risks: RiskCategory[] }[]
  replies: { id: string; block: boolean }[]
}
const KIND_CN: Record<Kind, string> = { plain: "直白", colloquial: "口语与网络用语", implicit: "含蓄表达", sarcasm: "反讽", negation: "否定与转述", decoy: "有风险词但无风险", multi: "双意图", late_cue: "关键线索在长句末尾" }

const parts = <T,>(dir: string, prefix: string): T[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort().flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as T[]) : []

function loadSet(dirA: string, prefixA: [string, string], dirB: string, prefixB: [string, string]): { A: Labelled | null; B: Second | null } {
  const messages = parts<AItem>(dirA, prefixA[0])
  const A = messages.length ? { messages, replies: parts<RItem>(dirA, prefixA[1]) } : null
  const bm = parts<Second["messages"][number]>(dirB, prefixB[0])
  const br = parts<Second["replies"][number]>(dirB, prefixB[1])
  const B = A && bm.length === A.messages.length ? { messages: bm, replies: br.length === A.replies.length ? br : [] } : null
  return { A, B }
}

const validation = loadSet(path.join(here, "blind"), ["a-messages-", "a-replies-"], path.join(here, "blind-texts"), ["b-messages-", "b-replies-"])
const final = loadSet(path.join(here, "final"), ["f-messages-", "f-replies-"], path.join(here, "final-texts"), ["g-messages-", "g-replies-"])

/** The final set counts only while its files match the frozen hash. */
function finalStatus() {
  const dir = path.join(here, "final")
  const frozen = readJSON<{ hash: string; frozenAt: string }>(path.join(dir, "FROZEN.json"))
  if (!frozen) return { frozen: false as const }
  const h = createHash("sha256")
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "FROZEN.json").sort()) h.update(f).update(readFileSync(path.join(dir, f)))
  return { frozen: true as const, hash: frozen.hash, frozenAt: frozen.frozenAt, intact: h.digest("hex") === frozen.hash }
}

function report(set: { A: Labelled | null; B: Second | null }, preds: Pred[], blocks: boolean[]) {
  const { A, B } = set
  if (!A) return null
  const bm = new Map(B?.messages.map((m) => [m.id, m]) ?? [])
  const br = new Map(B?.replies.map((r) => [r.id, r]) ?? [])
  const agreed = A.messages.map((m) => {
    const b = bm.get(m.id)
    return !!b && m.intents.includes(b.intent) && m.emotions.includes(b.emotion) && sameSet(m.risks, b.risks)
  })
  const hasReplyB = Boolean(B?.replies.length)
  const agreedReply = A.replies.map((r) => br.get(r.id)?.block === r.block)
  const pick = <T,>(xs: T[], mask: boolean[]) => xs.filter((_, i) => mask[i])
  const kinds = [...new Set(A.messages.map((m) => m.kind))]
  const lite = A.messages.map((_, i) => preds[i].route === "lite")
  const tuning = [...DEV, ...HOLDOUT1]
  return {
    agreement: B
      ? {
          intent: pct(A.messages.filter((m) => bm.has(m.id) && m.intents.includes(bm.get(m.id)!.intent)).length, A.messages.length),
          intentKappa: kappa(A.messages.map((m) => m.intents[0]), A.messages.map((m) => bm.get(m.id)?.intent ?? "∅")),
          emotion: pct(A.messages.filter((m) => bm.has(m.id) && m.emotions.includes(bm.get(m.id)!.emotion)).length, A.messages.length),
          emotionKappa: kappa(A.messages.map((m) => m.emotions[0]), A.messages.map((m) => bm.get(m.id)?.emotion ?? "∅")),
          polarity: pct(A.messages.filter((m) => bm.has(m.id) && m.emotions.map(polarity).includes(polarity(bm.get(m.id)!.emotion))).length, A.messages.length),
          riskExact: pct(A.messages.filter((m) => bm.has(m.id) && sameSet(m.risks, bm.get(m.id)!.risks)).length, A.messages.length),
          consensusMessages: agreed.filter(Boolean).length,
          block: hasReplyB ? pct(agreedReply.filter(Boolean).length, A.replies.length) : null,
          blockKappa: hasReplyB ? kappa(A.replies.map((r) => String(r.block)), A.replies.map((r) => String(br.get(r.id)?.block ?? "∅"))) : null,
          consensusReplies: hasReplyB ? agreedReply.filter(Boolean).length : null,
        }
      : null,
    // the floor, on exactly the same items as the method
    baseline: majorityBaseline(tuning, A.messages),
    all: score(A.messages, preds),
    consensus: B ? { baseline: majorityBaseline(tuning, pick(A.messages, agreed)), rules: score(pick(A.messages, agreed), pick(preds, agreed)) } : null,
    byKind: kinds.map((k) => {
      const mask = A.messages.map((m) => m.kind === k)
      const s = score(pick(A.messages, mask), pick(preds, mask))
      return { kind: k, cn: KIND_CN[k] ?? k, n: s.n, intentAcc: s.intentAcc, emotionAcc: s.emotionAcc, riskRecall: s.riskRecall }
    }),
    compliance: { all: scoreBlocks(A.replies, blocks), consensus: hasReplyB ? scoreBlocks(pick(A.replies, agreedReply), pick(blocks, agreedReply)) : null },
    router: preds[0]?.route
      ? {
          share: Object.fromEntries(ROUTE_ORDER.map((r) => [r, pct(preds.filter((p) => p.route === r).length, preds.length)])) as Record<Route, number>,
          counts: Object.fromEntries(ROUTE_ORDER.map((r) => [r, preds.filter((p) => p.route === r).length])) as Record<Route, number>,
          liteN: lite.filter(Boolean).length,
          liteIntentAcc: score(pick(A.messages, lite), pick(preds, lite)).intentAcc,
          riskyN: A.messages.filter((m) => m.risks.length).length,
          riskyFull: A.messages.filter((m, i) => m.risks.length && preds[i].route === "full").length,
          riskyLite: A.messages.filter((m, i) => m.risks.length && preds[i].route === "lite").length,
          riskyFast: A.messages.filter((m, i) => m.risks.length && preds[i].route === "fast").length,
          first: readJSON<{ share: Record<Route, number>; riskyKeptFromModel: number; riskyN: number }>(path.join(here, "router-first.json")),
        }
      : null,
  }
}

/* ───────────────────────── token estimate ───────────────────────── */

/** 元 per million tokens, Bailian (Beijing) list prices in the documentation on 2026-10-12. */
const PRICE = { main: { model: "qwen3.8-27b", input: 3, output: 12, cached: 0.6 }, fast: { model: "qwen3.5-35b-a3b", input: 0.4, output: 3.2 } }

function tokenEstimate(routeShare: Record<Route, number> | undefined) {
  const turns: { naiveIn: number; singleIn: number; lingxiIn: number; liteIn: number; out: number; auditOut: number }[] = []
  for (const sc of SCENARIOS) {
    const customer = sc.customer
    const messages: Message[] = []
    for (const step of sc.script) {
      if (step.role === "agent") {
        const prev = messages.findLast((m) => m.role === "consumer")
        const said = sc.script.find((x) => x.role === "consumer" && x.id === prev?.id)
        if (said && said.role === "consumer") messages.push({ id: step.id, role: "agent", text: said.insight.drafts.warm || "好的，我来为您处理。", at: 0 })
        continue
      }
      if (step.role !== "consumer") continue
      messages.push({ id: step.id, role: "consumer", text: step.text, at: 0 })
      const input: AnalyzeInput = { messages: [...messages], customer }
      const citations = retrieve(`${step.text} ${step.insight.intent.summary}`, { k: 3 })
      const pack = buildFactPack(customer.id, DEMO_NOW)
      const reading = { intent: step.insight.intent, emotion: step.insight.emotion, unspoken: step.insight.unspoken, signals: step.insight.signals, keyFacts: step.insight.keyFacts, whisper: step.insight.whisper }
      const draftsOut = estTokens(JSON.stringify({ drafts: step.insight.drafts.warm ? step.insight.drafts : { warm: "x".repeat(110), professional: "x".repeat(90), concise: "x".repeat(40) }, actions: step.insight.actions }))
      const out = estTokens(JSON.stringify(reading)) + draftsOut
      // untrimmed context: the whole dialogue and the whole text of each retrieved document
      const fullCtx = `【客户档案】\n${profile(input)}\n\n【对话】\n${fullTranscript(input)}\n\n【知识库】\n${citations.map((c) => `- ${c.title}：${KNOWLEDGE_MAP[c.docId].body || KNOWLEDGE_MAP[c.docId].clauses?.map((x) => x.text).join("") || ""}`).join("\n")}`
      // one call per agent: 闻 问 切 笔 策 检, each with its own instructions and the untrimmed context
      const third = (CONSTITUTION.length + (PERCEIVE_PROMPT.length - CONSTITUTION.length) / 3) / PERCEIVE_PROMPT.length
      const naiveIn = 5 * (estTokens(PERCEIVE_PROMPT) * third + estTokens(fullCtx)) + estTokens(AUDIT_PROMPT) + draftsOut
      // a reasonable single-call design: one main-model call, basic retrieval, whole dialogue, no history pack
      const singleIn = estTokens(FULL_PROMPT) + estTokens(fullCtx)
      // Lingxi's full route: one main-model call with the fact pack and a trimmed context
      const lingxiIn = estTokens(FULL_PROMPT) + estTokens(fullUser(input, { citations, pack }))
      const liteIn = estTokens(LITE_PROMPT) + estTokens(liteUser(input, { citations, pack }))
      turns.push({ naiveIn, singleIn, lingxiIn, liteIn, out, auditOut: draftsOut })
    }
  }
  const mean = (f: (t: (typeof turns)[number]) => number) => Math.round(turns.reduce((s, t) => s + f(t), 0) / turns.length)
  const m = { naiveIn: mean((t) => t.naiveIn), singleIn: mean((t) => t.singleIn), lingxiIn: mean((t) => t.lingxiIn), liteIn: mean((t) => t.liteIn), out: mean((t) => t.out), auditOut: mean((t) => t.auditOut) }
  const share = routeShare ? { fast: routeShare.fast / 100, lite: routeShare.lite / 100, full: routeShare.full / 100 } : { fast: 0, lite: 0, full: 1 }
  const yuan = (i: number, o: number, tier: "main" | "fast" = "main") => (i * PRICE[tier].input + o * PRICE[tier].output) / 1e6
  const steps = [
    { key: "naive", cn: "每个智能体各调用一次", note: "闻、问、切、笔、策、检各一次，各带完整对话与知识库全文", calls: 6, input: m.naiveIn, output: m.out + m.auditOut, cost: yuan(m.naiveIn, m.out + m.auditOut) },
    { key: "single", cn: "单次调用 + 基础检索（合理基线）", note: "主模型一次完成研判与起草；整段对话、检索命中的全文；没有服务事实", calls: 1, input: m.singleIn, output: m.out, cost: yuan(m.singleIn, m.out) },
    { key: "lingxi", cn: "灵犀完整路由", note: "主模型一次调用；加入服务事实、裁剪上下文；核验失败时另加一次修正（未计入）", calls: 1, input: m.lingxiIn, output: m.out, cost: yuan(m.lingxiIn, m.out) },
    {
      key: "route",
      cn: "灵犀 + 规则路由",
      note: routeShare ? "寒暄不调用模型；有把握的低风险咨询由快速模型完成（未计升级与修正）" : "还没有验证集，按全部走完整路由计算",
      calls: round(share.full + share.lite, 2),
      input: Math.round(share.full * m.lingxiIn + share.lite * m.liteIn),
      output: Math.round((share.full + share.lite) * m.out),
      cost: share.full * yuan(m.lingxiIn, m.out) + share.lite * yuan(m.liteIn, m.out, "fast"),
    },
  ].map((s) => ({ ...s, input: Math.round(s.input), output: Math.round(s.output), total: Math.round(s.input + s.output), cost: round(s.cost, 5) }))
  const single = steps[1]
  const routed = steps[3]
  return {
    basis: `${SCENARIOS.length} 段演示会话的 ${turns.length} 个消费者轮次；路由比例取自迭代验证集`,
    method: "输入按产品真实发送的提示词字符串估算，输出按演示脚本里同一轮的结果长度估算；1 个汉字计 1 token，其余 4 个字符计 1 token。没有经过真实调用验证。",
    prices: PRICE,
    perCall: m,
    steps,
    vsSingle: { tokensPct: round(((routed.total - single.total) / single.total) * 100), costPct: round(((routed.cost - single.cost) / single.cost) * 100) },
    vsNaive: { tokensPct: round(((routed.total - steps[0].total) / steps[0].total) * 100), costPct: round(((routed.cost - steps[0].cost) / steps[0].cost) * 100) },
    cacheablePrefix: { full: estTokens(FULL_PROMPT), threshold: 1024 },
    notCounted: ["核验失败时的修正调用", "快速模型发现风险后的升级", "图片识别", "会诊", "JSON 模式失败后的重试"],
  }
}

/* ───────────────────────── service trajectory: a consistency check ───────────────────────── */

function trajectoryCheck() {
  const alerts = detectAlerts()
  const generated = ALL_CUSTOMERS.filter((c) => c.id.startsWith("G-"))
  const groups: [AlertType, number][] = [["repeat_contact", 6], ["repeat_refund", 4], ["pr", 3], ["adverse", 3]]
  let at = 0
  const planted = groups.map(([type, n]) => {
    const ids = generated.slice(at, at + n).map((c) => c.id)
    at += n
    return { type, cn: ALERT_TYPES[type].cn, planted: n, found: ids.filter((id) => alerts.some((a) => a.type === type && a.customer?.id === id)).length }
  })
  const ordinary = generated.slice(at)
  return {
    data: { customers: ALL_CUSTOMERS.length, orders: ORDERS.length, tickets: TICKETS.length, contacts: CONTACTS.length },
    planted,
    plantedTotal: planted.reduce((s, x) => s + x.planted, 0),
    foundTotal: planted.reduce((s, x) => s + x.found, 0),
    ordinary: ordinary.length,
    ordinaryFlagged: ordinary.filter((c) => alerts.some((a) => a.customer?.id === c.id)).length,
    alerts: alerts.length,
  }
}

/* ───────────────────────── the model (optional) ───────────────────────── */

function loadEnv() {
  const f = path.join(here, "..", ".env.local")
  if (!existsSync(f)) return
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/)
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

async function runLLM(messages: EvalItem[], replies: ReplyItem[]) {
  const { default: OpenAI } = await import("openai")
  const model = process.env.LLM_MODEL ?? "qwen3.8-27b"
  const baseURL = process.env.LLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
  const client = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL, timeout: 60000, maxRetries: 1 })
  const extra = /aliyuncs\.com/.test(baseURL) ? ({ enable_thinking: false } as Record<string, unknown>) : {}
  const ask = async (system: string, user: string) => {
    const t0 = Date.now()
    const res = await client.chat.completions.create({ model, temperature: 0.2, max_tokens: 1200, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...extra })
    const raw = res.choices[0]?.message?.content ?? ""
    return { json: JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)), tokens: res.usage?.total_tokens ?? 0, ms: Date.now() - t0 }
  }
  const batch = async <T, R>(items: T[], label: string, f: (x: T) => Promise<R>) => {
    const out: R[] = []
    for (let i = 0; i < items.length; i += 4) {
      out.push(...(await Promise.all(items.slice(i, i + 4).map(f))))
      process.stdout.write(`\r  ${label} ${Math.min(i + 4, items.length)}/${items.length}`)
    }
    console.log()
    return out
  }
  const preds = await batch(messages, "消息", async (it): Promise<Pred> => {
    try {
      const { json: j, tokens, ms } = await ask(PERCEIVE_PROMPT, `【客户档案】\n（新访客，没有档案）\n\n【对话】\n消费者：${it.text}\n\n请分析最后一条消费者消息，输出 JSON。`)
      const emo = summarizeEmotion(j.emotion ?? {})
      const risks = [...new Set((j.signals ?? []).filter((s: { level: number }) => Number(s.level) >= 2).map((s: { category: RiskCategory }) => s.category))] as RiskCategory[]
      return { intent: j.intent?.primary in INTENTS ? j.intent.primary : "other", intent2: j.intent?.secondary ?? undefined, emotion: emo.dominant, risks, tokens, ms }
    } catch (e) {
      console.error("\n  失败：", (e as Error).message.slice(0, 120))
      return { intent: "other", emotion: "calm", risks: [], failed: true }
    }
  })
  const blocks = await batch(replies, "回复", async (it) => {
    try {
      const { json: j } = await ask(AUDIT_PROMPT, `坐席准备发送的回复：\n${it.text}\n\n请输出 JSON。`)
      return (j.issues ?? []).some((i: { severity?: string }) => i.severity !== "warn")
    } catch {
      return false
    }
  })
  const ok = preds.filter((p) => !p.failed)
  return { model, preds, blocks, failed: preds.length - ok.length, avgTokens: ok.length ? Math.round(ok.reduce((s, p) => s + (p.tokens ?? 0), 0) / ok.length) : 0, avgMs: ok.length ? Math.round(ok.reduce((s, p) => s + (p.ms ?? 0), 0) / ok.length) : 0 }
}

/* ───────────────────────── run ───────────────────────── */

const TUNING = [...DEV, ...HOLDOUT1]
const REPLIES_TUNING = [...REPLIES_DEV, ...REPLIES_HOLDOUT1]
const round1 = readJSON<{ generatedAt: string; baseline: Score; rules: { dev: Score; test: Score }; compliance: { dev: object; test: object } }>(path.join(here, "round1.json"))
const fstat = finalStatus()
const usable = (set: typeof final) => Boolean(set.A && fstat.frozen && fstat.intact)
const vPreds = validation.A ? validation.A.messages.map((m) => ruleEngine(m.text)) : []
const fPreds = final.A ? final.A.messages.map((m) => ruleEngine(m.text)) : []
const previous = readJSON<{ llm?: unknown }>(path.join(here, "results.json"))
const vReport = report(validation, vPreds, validation.A ? ruleBlocks(validation.A.replies) : [])

const out: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  sizes: {
    dev: DEV.length,
    holdout1: HOLDOUT1.length,
    repliesDev: REPLIES_DEV.length,
    repliesHoldout1: REPLIES_HOLDOUT1.length,
    validationMessages: validation.A?.messages.length ?? 0,
    validationReplies: validation.A?.replies.length ?? 0,
    finalMessages: final.A?.messages.length ?? 0,
    finalReplies: final.A?.replies.length ?? 0,
  },
  labels: { intents: Object.keys(INTENTS).length, emotions: EMOTION_ORDER.length },
  round1: round1 ? { at: round1.generatedAt, baseline: round1.baseline, rules: round1.rules.test, compliance: round1.compliance.test } : null,
  tuning: { messages: score(TUNING, TUNING.map((x) => ruleEngine(x.text))), compliance: scoreBlocks(REPLIES_TUNING, ruleBlocks(REPLIES_TUNING)) },
  validation: vReport,
  final: usable(final) ? { status: fstat, rules: report(final, fPreds, ruleBlocks(final.A!.replies)) } : { status: fstat, rules: null },
  tokens: tokenEstimate(vReport?.router?.share),
  trajectory: trajectoryCheck(),
  llm: previous?.llm ?? null,
}

loadEnv()
if (process.argv.includes("--llm")) {
  if (!process.env.LLM_API_KEY) console.log("没有配置 LLM_API_KEY，跳过大模型评测。")
  else {
    const target = usable(final) ? final : validation
    const name = usable(final) ? "final" : "validation"
    console.log(`在${name === "final" ? "最终测试集" : "迭代验证集"}上运行模型（${target.A!.messages.length} 条消息 + ${target.A!.replies.length} 条回复）…`)
    const r = await runLLM(target.A!.messages, target.A!.replies)
    out.llm = { set: name, model: r.model, at: new Date().toISOString(), failed: r.failed, avgTokens: r.avgTokens, avgMs: r.avgMs, ...report(target, r.preds, r.blocks) }
  }
}

writeFileSync(path.join(here, "results.json"), JSON.stringify(out, null, 2))

const show = (label: string, s: Score) =>
  console.log(`${label.padEnd(20)} n=${String(s.n).padEnd(4)} 意图 ${s.intentAcc}% ${s.intentCI ? `[${s.intentCI.join("–")}]` : ""} · 情绪 ${s.emotionAcc}% · 风险 P ${s.riskPrecision}% R ${s.riskRecall}%${s.severeGold !== undefined ? ` · 高后果类召回 ${s.severeRecall}%（漏 ${s.severeMissed}/${s.severeGold}）· 命中真实风险 ${s.trueRiskHit}%` : "（旧格式，冻结于第一轮）"} · 误报 ${s.falseAlarm}%`)
if (round1) show("第一轮留出集", round1.rules.test)
show("调参集（不作数）", (out.tuning as { messages: Score }).messages)
if (vReport) {
  show("验证集 · 基线", vReport.baseline)
  show("验证集 · 规则", vReport.all)
  console.log(`验证集 · 合规       准确 ${vReport.compliance.all.accuracy}% · 违规召回 ${vReport.compliance.all.recall}% · 误拦 ${vReport.compliance.all.falseBlock}%`)
  if (vReport.router) console.log(`路由                 直达 ${vReport.router.share.fast}% · 轻量 ${vReport.router.share.lite}% · 完整 ${vReport.router.share.full}% · ${vReport.router.riskyN} 条有风险：主模型 ${vReport.router.riskyFull}，快速模型 ${vReport.router.riskyLite}，不经模型 ${vReport.router.riskyFast}`)
}
const fin = out.final as { status: ReturnType<typeof finalStatus>; rules: ReturnType<typeof report> }
if (fin.rules) {
  show("最终测试 · 基线", fin.rules.baseline)
  show("最终测试 · 规则", fin.rules.all)
  console.log(`最终测试 · 合规     准确 ${fin.rules.compliance.all.accuracy}% · 违规召回 ${fin.rules.compliance.all.recall}% · 误拦 ${fin.rules.compliance.all.falseBlock}%`)
} else console.log(fin.status.frozen ? (fin.status.intact ? "最终测试集为空。" : "最终测试集在冻结后被修改过，不计分。") : "最终测试集还没有冻结（npx tsx eval/e2e.mts --freeze）。")
const t = out.tokens as ReturnType<typeof tokenEstimate>
console.log(`token 估算           ${t.steps.map((s) => `${s.cn} ${s.total}（${s.calls} 次）`).join(" · ")} · 比合理基线 ${t.vsSingle.tokensPct > 0 ? "+" : ""}${t.vsSingle.tokensPct}% token、${t.vsSingle.costPct > 0 ? "+" : ""}${t.vsSingle.costPct}% 费用`)
const tj = out.trajectory as ReturnType<typeof trajectoryCheck>
console.log(`服务轨迹一致性       埋入 ${tj.plantedTotal} 位异常消费者，找到 ${tj.foundTotal}；${tj.ordinary} 位普通消费者中被预警 ${tj.ordinaryFlagged}`)
