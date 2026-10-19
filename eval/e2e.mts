// End-to-end evaluation: the real product pipeline, multi-turn sessions over service histories.
//
//   npx tsx eval/e2e.mts --freeze     freeze the final test set (once; later edits make every run refuse)
//   npx tsx eval/e2e.mts              condition A (rules) — no key needed
//   npx tsx eval/e2e.mts --llm        all five conditions against the model in .env.local (costs tokens)
//   npx tsx eval/e2e.mts --mock       smoke-test the harness with a stand-in model (never reported as results)
//
// Run it with NODE_OPTIONS=--conditions=react-server so server modules load outside Next
// (`pnpm eval:e2e` does this).
//
// Conditions — same sessions, same model, same scoring:
//   A rules         the offline rule engine through the product pipeline
//   B base          one main-model call with basic retrieval; no service history
//   C base+facts    B plus the structured fact pack (orders, tickets, promises, contacts)
//   D lingxi        the product pipeline: facts, rules + model, router, verification and repair
//   E lingxi-noroute D with the token router switched off (every turn on the main model)
//
// Per-turn inputs, outputs and usage go to eval/runs/<stamp>-<condition>/turns.jsonl.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
process.env.LINGXI_DB = ":memory:"

/* ───────────────────────── frozen test set ───────────────────────── */

const FINAL = path.join(here, "final")
const finalFiles = () => (existsSync(FINAL) ? readdirSync(FINAL).filter((f) => f.endsWith(".json") && f !== "FROZEN.json").sort() : [])
const setHash = () => {
  const h = createHash("sha256")
  for (const f of finalFiles()) h.update(f).update(readFileSync(path.join(FINAL, f)))
  return h.digest("hex")
}
if (process.argv.includes("--freeze")) {
  const frozenPath = path.join(FINAL, "FROZEN.json")
  if (existsSync(frozenPath)) {
    console.log("最终测试集已经冻结过，不能重新冻结。", JSON.parse(readFileSync(frozenPath, "utf8")))
    process.exit(1)
  }
  writeFileSync(frozenPath, JSON.stringify({ hash: setHash(), files: finalFiles(), frozenAt: new Date().toISOString(), note: "冻结后任何修改都会让评测脚本拒绝运行。" }, null, 2))
  console.log("已冻结：", setHash())
  process.exit(0)
}
const frozen = existsSync(path.join(FINAL, "FROZEN.json")) ? (JSON.parse(readFileSync(path.join(FINAL, "FROZEN.json"), "utf8")) as { hash: string; frozenAt: string }) : null
if (!frozen) {
  console.log("最终测试集还没有冻结。先运行 npx tsx eval/e2e.mts --freeze")
  process.exit(1)
}
if (frozen.hash !== setHash()) {
  console.log("最终测试集在冻结之后被修改过，拒绝运行。冻结哈希", frozen.hash, "当前", setHash())
  process.exit(1)
}

/* ───────────────────────── load sessions and inject their records ───────────────────────── */

type Iso = string
interface Session {
  id: string
  kinds: string[]
  customer: { id: string; name: string; tier: string; skinType?: string; preferredTone?: string; historySummary?: string }
  orders: { id: string; sku: string; product: string; price: number; channel: string; paidAt: Iso; status: string; signedAt?: Iso; batch?: string }[]
  tickets: { id: string; orderId?: string; type: string; status: string; createdAt: Iso; dueAt?: Iso; amount?: number; summary: string; promiseLog?: { at: Iso; by: string; text: string; dueAt: Iso }[] }[]
  contacts: { id: string; at: Iso; channel: string; orderId?: string; topic: string; resolved: boolean; lines: string[]; evidence?: string[] }[]
  turns: { text: string; intents: string[]; emotions: string[]; risks: string[]; expect: { acknowledge: string[]; doNotAsk: string[]; orderRef: string | null; noCommitWithoutTicket: boolean; note?: string } }[]
}
const sessions: Session[] = finalFiles()
  .filter((f) => f.startsWith("sessions-"))
  .flatMap((f) => JSON.parse(readFileSync(path.join(FINAL, f), "utf8")) as Session[])

const dataset = await import("../src/lib/dataset")
for (const s of sessions) {
  for (const o of s.orders) dataset.ORDERS.push({ ...o, customerId: s.customer.id } as never)
  for (const t of s.tickets) dataset.TICKETS.push({ ...t, customerId: s.customer.id } as never)
  for (const c of s.contacts) dataset.CONTACTS.push({ ...c, customerId: s.customer.id } as never)
}

const { runPipeline } = await import("../src/lib/engine/pipeline")
const { buildFactPack, factDigest } = await import("../src/lib/engine/facts")
const { checkClaims } = await import("../src/lib/engine/claims")
const { retrieve } = await import("../src/lib/engine/retrieval")
const { CONSTITUTION } = await import("../src/lib/engine/prompts")
const { DEMO_NOW } = await import("../src/lib/dataset")
type Insight = import("../src/lib/types").Insight
type Msg = import("../src/lib/types").Message
type ModelCall = import("../src/lib/types").ModelCall
type CustomerProfile = import("../src/lib/types").CustomerProfile

const profileOf = (s: Session): CustomerProfile => ({
  id: s.customer.id,
  name: s.customer.name,
  avatarSeed: s.customer.id,
  tier: (["新客", "银卡", "金卡", "黑金"].includes(s.customer.tier) ? s.customer.tier : "新客") as CustomerProfile["tier"],
  ltv: s.orders.reduce((a, o) => a + o.price, 0),
  orders: s.orders.length,
  skinType: s.customer.skinType ?? "—",
  concerns: [],
  preferredTone: s.customer.preferredTone ?? "—",
  sensitivity: [],
  channelHabits: [(s.orders[0]?.channel ?? "tmall") as CustomerProfile["channelHabits"][number]],
  tags: [],
  historySummary: s.customer.historySummary ?? "",
  churnRisk: 0.3,
})

/* ───────────────────────── model access ───────────────────────── */

function loadEnv() {
  const f = path.join(here, "..", ".env.local")
  if (!existsSync(f)) return
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/)
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const useLLM = process.argv.includes("--llm")
const useMock = process.argv.includes("--mock")
if (useLLM) {
  loadEnv()
  delete process.env.LINGXI_MODE
  if (!process.env.LLM_API_KEY) {
    console.log("没有配置 LLM_API_KEY（lingxi/.env.local），不能运行 --llm。")
    process.exit(1)
  }
}
const { chatJSON, getLLMConfig } = await import("../src/lib/server/llm")
const { llmHooks } = await import("../src/lib/server/hooks")
type Hooks = import("../src/lib/engine/pipeline").LLMHooks

/** A stand-in model for smoke tests: always the same generic answer. Its scores mean nothing. */
const mockCall = (name: string): ModelCall => ({ name, agents: [], model: "mock", ms: 5, tokens: 200, promptTokens: 150, completionTokens: 50, ok: true })
const MOCK_READ = { intent: { primary: "complaint", secondary: null, confidence: 0.6, summary: "mock" }, emotion: { calm: 0.5 }, unspoken: [], signals: [], keyFacts: [], whisper: "mock", drafts: { warm: "您好，我来帮您看一下。", professional: "您好，已收到。", concise: "收到。" }, actions: [] }
const mockHooks: Hooks = {
  vision: async () => ({ data: null, call: mockCall("vision") }),
  full: async () => ({ data: MOCK_READ as never, call: mockCall("full") }),
  repair: async (_i, ctx) => ({ data: { drafts: ctx.drafts } as never, call: mockCall("repair") }),
  lite: async () => ({ data: MOCK_READ as never, call: mockCall("lite") }),
}
const hooks: Hooks | undefined = useLLM ? llmHooks : useMock ? mockHooks : undefined

/* ───────────────────────── baseline B / C: one plain model call ───────────────────────── */

const BASE_PROMPT = `${CONSTITUTION}

你是美妆品牌在线客服的助手。阅读对话，判断最后一条消费者消息的意图、情绪和风险，并为人工坐席起草一条可以直接发送的回复。严格输出 JSON：
{"intent": {"primary": IntentKey, "secondary": IntentKey 或 null}, "emotion": {"anger":0–1, "anxiety":0–1, "sadness":0–1, "grievance":0–1, "calm":0–1, "anticipation":0–1, "joy":0–1, "gratitude":0–1}, "signals": [{"category": RiskCategory, "level": 1–4, "evidence": "原话"}], "reply": "回复正文", "actions": [{"title": "下一步行动", "detail": "说明"}]}
IntentKey ∈ pre_sale_consult | product_efficacy | usage_guidance | skin_matching | authenticity | logistics | return_refund | adverse_reaction | complaint | price_promo | membership | gift_consult | other
RiskCategory ∈ safety | regulatory | pr | legal | churn | fraud | privacy | minor | service
只输出 JSON。`

interface TurnOut {
  intent: string
  risks: string[]
  reply: string
  actions: { title: string; resolves?: string }[]
  usage: ModelCall[]
  ms: number
  failed: boolean
}

async function baseTurn(s: Session, messages: Msg[], withFacts: boolean): Promise<TurnOut> {
  const t0 = Date.now()
  const last = messages.findLast((m) => m.role === "consumer")!.text
  const cites = retrieve(last, { k: 3 })
  const dialogue = messages.map((m) => `${m.role === "consumer" ? "消费者" : "坐席"}：${m.text}`).join("\n")
  const facts = withFacts ? `【服务事实】\n${factDigest(buildFactPack(s.customer.id, DEMO_NOW))}\n\n` : ""
  const user = `${facts}【知识库】\n${cites.map((c) => `- ${c.title}：${c.snippet}`).join("\n") || "（空）"}\n\n【对话】\n${dialogue}\n\n请输出 JSON。`
  if (useMock) return { intent: "complaint", risks: [], reply: "您好，我来帮您看一下。", actions: [], usage: [mockCall("base")], ms: Date.now() - t0, failed: false }
  const r = await chatJSON<{ intent?: { primary?: string }; signals?: { category: string; level: number }[]; reply?: string; actions?: { title: string }[] }>(
    [
      { role: "system", content: BASE_PROMPT },
      { role: "user", content: user },
    ],
    { model: "main", temperature: 0.3, maxTokens: 1200, name: withFacts ? "基线+事实" : "基线", agents: [] },
  )
  const d = r.data
  return {
    intent: d?.intent?.primary ?? "other",
    risks: [...new Set((d?.signals ?? []).filter((x) => Number(x.level) >= 2).map((x) => x.category))],
    reply: d?.reply ?? "",
    actions: (d?.actions ?? []).map((a) => ({ title: String(a.title ?? "") })),
    usage: [r.call],
    ms: Date.now() - t0,
    failed: !d,
  }
}

async function lingxiTurn(s: Session, messages: Msg[], prior: Insight | undefined, mode: "rules" | "llm", router = true): Promise<{ out: TurnOut; insight: Insight }> {
  const t0 = Date.now()
  let ins: Insight | undefined
  for await (const ev of runPipeline({ messages, customer: profileOf(s), orderSkus: s.orders.map((o) => o.sku), prior, ablate: router ? undefined : { router: false } }, mode, mode === "llm" ? hooks : undefined)) if (ev.type === "done") ins = ev.insight
  const rec = ins!.drafts.find((d) => d.style === ins!.recommended.style) ?? ins!.drafts[0]
  return {
    insight: ins!,
    out: {
      intent: ins!.intent.primary,
      risks: [...new Set(ins!.risk.signals.filter((x) => x.level >= 2 && x.turn === ins!.turn && x.origin !== "data").map((x) => x.category))],
      reply: rec.text,
      actions: ins!.actions.map((a) => ({ title: a.title, resolves: a.resolves })),
      usage: ins!.usage,
      ms: Date.now() - t0,
      failed: ins!.degraded.length > 0,
    },
  }
}

/* ───────────────────────── scoring ───────────────────────── */

const ACK = /没有做到|没做到|失约|逾期|没有兑现|没能兑现|一直没|没有按时|没按时|让您等了|拖了|食言|说话不算|是我们的问题|是我们的责任/
/**
 * A re-ask is a request addressed to the consumer (请/麻烦/方便… 提供/发/拍… X), not a mention of X
 * (“您发来的照片我们都有记录” acknowledges, it does not ask). Scorer fixed after the first run, which
 * counted mentions too — see eval/e2e-first.json.
 */
const ASK = "(?:请|麻烦|方便|能否|可以|能不能|需要|还需要|再)(?:您)?(?:再)?(?:帮忙)?"
const REASK: Record<string, RegExp> = {
  订单号: new RegExp(`${ASK}(?:提供|发|告诉|报|给|说)(?:一下|下)?(?:我)?[^。？！，]{0,6}订单(?:号|编号)|订单(?:号|编号)是(?:多少|什么)`),
  照片: new RegExp(`${ASK}(?:提供|发|拍|上传|补)(?:一下|下|张|个)?[^。？！，]{0,6}(?:照片|图片|视频)|(?:发|拍)(?:一下|下)(?:我)?[^。？！，]{0,4}(?:照片|图片)`),
  批号: new RegExp(`${ASK}(?:提供|发|告诉|拍)(?:一下|下)?[^。？！，]{0,6}批号|批号是(?:多少|什么)`),
  经过: new RegExp(`${ASK}(?:说|讲|描述|告诉我)(?:一下|下)?[^。？！，]{0,8}(?:经过|情况|过程)|再(?:说|讲)一遍`),
}
const ORDER_ID = /(?:TM|DY|JD|WX|XHS)\d{8}-\d{4}/g
const SEVERE = ["safety", "legal", "pr", "minor"]

interface TurnScore {
  intentOk: boolean
  goldIntent: string
  gotIntent: string
  acceptable: string[]
  /** a wrong order id, ticket id or amount in the reply */
  factError: boolean
  /** policy phrases in the reply, and how many apply to the situation */
  policyClaims: number
  policySupported: number
  gold: string[]
  got: string[]
  ackNeeded: boolean
  ackOk: boolean
  falseApology: boolean
  remedyAction: boolean
  reasks: string[]
  wrongOrder: boolean
  unsupportedCommit: boolean
}

function scoreTurn(s: Session, turn: Session["turns"][number], out: TurnOut): TurnScore {
  const pack = buildFactPack(s.customer.id, DEMO_NOW)
  const claims = checkClaims(out.reply, { pack, level: 2, situation: { safety: false, logistics: false, refund: false, promise: true } })
  const kept = s.kinds.includes("kept_promise")
  const orders = [...out.reply.matchAll(ORDER_ID)].map((m) => m[0])
  const policy = claims.filter((c) => c.kind === "policy")
  return {
    intentOk: turn.intents.includes(out.intent),
    goldIntent: turn.intents[0],
    gotIntent: out.intent,
    acceptable: turn.intents,
    factError: claims.some((c) => (c.kind === "order" || c.kind === "ticket" || c.kind === "amount") && c.severity === "block"),
    policyClaims: policy.length,
    policySupported: policy.filter((c) => c.supported).length,
    gold: turn.risks,
    got: out.risks,
    ackNeeded: turn.expect.acknowledge.length > 0,
    ackOk: turn.expect.acknowledge.length > 0 && ACK.test(out.reply),
    falseApology: kept && turn.expect.acknowledge.length === 0 && /没有做到|失约|食言|没有兑现/.test(out.reply),
    remedyAction: turn.expect.acknowledge.some((ref) => out.actions.some((a) => a.resolves === ref)),
    reasks: turn.expect.doNotAsk.filter((f) => REASK[f]?.test(out.reply)),
    // naming the order of a promise the reply has to acknowledge is expected, not confusion
    wrongOrder: Boolean(turn.expect.orderRef) && orders.some((o) => o !== turn.expect.orderRef && !s.tickets.some((t) => turn.expect.acknowledge.includes(t.id) && t.orderId === o)),
    unsupportedCommit: turn.expect.noCommitWithoutTicket && claims.some((c) => (c.kind === "arranged" || c.kind === "timing" || c.kind === "compensation") && c.severity === "block"),
  }
}

const PRICE: Record<string, { input: number; output: number; cached?: number }> = { "qwen3.8-27b": { input: 3, output: 12, cached: 0.6 }, "qwen3.5-35b-a3b": { input: 0.4, output: 3.2 } }
const costOf = (c: ModelCall) => {
  const p = PRICE[c.model] ?? PRICE["qwen3.8-27b"]
  const cached = c.cachedTokens ?? 0
  return (((c.promptTokens ?? c.tokens) - cached) * p.input + cached * (p.cached ?? p.input) + (c.completionTokens ?? 0) * p.output) / 1e6
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null)
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.min(a.length - 1, Math.floor(q * a.length))]
}

/** Macro-F1 over intent classes; a prediction counts as correct when it is one of the turn's acceptable intents. */
function macroF1(scores: TurnScore[]) {
  const classes = [...new Set([...scores.map((s) => s.goldIntent), ...scores.map((s) => s.gotIntent)])]
  const f1s = classes.map((c) => {
    const tp = scores.filter((s) => s.gotIntent === c && s.acceptable.includes(c)).length
    const fp = scores.filter((s) => s.gotIntent === c && !s.acceptable.includes(c)).length
    const fn = scores.filter((s) => s.goldIntent === c && !s.acceptable.includes(s.gotIntent)).length
    return tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 1
  })
  return Math.round((f1s.reduce((a, x) => a + x, 0) / Math.max(1, f1s.length)) * 1000) / 10
}

function summarize(scores: TurnScore[], outs: TurnOut[]) {
  const cats = [...new Set(scores.flatMap((s) => s.gold))]
  const perCat = Object.fromEntries(cats.map((c) => [c, pct(scores.filter((s) => s.gold.includes(c) && s.got.includes(c)).length, scores.filter((s) => s.gold.includes(c)).length)]))
  const severeGold = scores.reduce((a, s) => a + s.gold.filter((c) => SEVERE.includes(c)).length, 0)
  const severeMissed = scores.reduce((a, s) => a + s.gold.filter((c) => SEVERE.includes(c) && !s.got.includes(c)).length, 0)
  const clean = scores.filter((s) => !s.gold.length)
  const usage = outs.flatMap((o) => o.usage)
  return {
    turns: scores.length,
    intentAcc: pct(scores.filter((s) => s.intentOk).length, scores.length),
    intentMacroF1: macroF1(scores),
    riskRecallByCategory: perCat,
    severeMissed: `${severeMissed}/${severeGold}`,
    falseAlarmOnCleanTurns: pct(clean.filter((s) => s.got.length).length, clean.length),
    acknowledgedBrokenPromise: pct(scores.filter((s) => s.ackOk).length, scores.filter((s) => s.ackNeeded).length),
    remedyActionProposed: pct(scores.filter((s) => s.ackNeeded && s.remedyAction).length, scores.filter((s) => s.ackNeeded).length),
    falseApology: scores.filter((s) => s.falseApology).length,
    reaskedKnownInfo: scores.filter((s) => s.reasks.length).length,
    wrongOrderCited: scores.filter((s) => s.wrongOrder).length,
    unsupportedCommitments: scores.filter((s) => s.unsupportedCommit).length,
    factErrors: scores.filter((s) => s.factError).length,
    policyClaimSupport: pct(scores.reduce((a, s) => a + s.policySupported, 0), scores.reduce((a, s) => a + s.policyClaims, 0)),
    modelCalls: usage.length,
    modelFailures: usage.filter((c) => !c.ok).length,
    tokensPerTurn: outs.length ? Math.round(usage.reduce((a, c) => a + c.tokens, 0) / outs.length) : 0,
    costPerTurnYuan: outs.length ? Math.round((usage.reduce((a, c) => a + costOf(c), 0) / outs.length) * 1e5) / 1e5 : 0,
    latencyMs: { p50: quantile(outs.map((o) => o.ms), 0.5), p95: quantile(outs.map((o) => o.ms), 0.95) },
  }
}

/* ───────────────────────── run ───────────────────────── */

type Cond = "rules" | "base" | "base+facts" | "lingxi" | "lingxi-noroute"
const conditions: Cond[] = useLLM || useMock ? ["rules", "base", "base+facts", "lingxi", "lingxi-noroute"] : ["rules"]
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const results: Record<string, unknown> = {}
const cfg = getLLMConfig()

for (const cond of conditions) {
  const dir = path.join(here, "runs", `${stamp}-${cond}${useMock ? "-mock" : ""}`)
  mkdirSync(dir, { recursive: true })
  const lines: string[] = []
  const scores: TurnScore[] = []
  const outs: TurnOut[] = []
  for (const s of sessions) {
    const messages: Msg[] = []
    let prior: Insight | undefined
    for (const [k, turn] of s.turns.entries()) {
      messages.push({ id: `${s.id}-c${k}`, role: "consumer", text: turn.text, at: k })
      let out: TurnOut
      if (cond === "base" || cond === "base+facts") out = await baseTurn(s, messages, cond === "base+facts")
      else {
        const r = await lingxiTurn(s, messages, prior, cond === "rules" ? "rules" : "llm", cond !== "lingxi-noroute")
        out = r.out
        prior = r.insight
      }
      const sc = scoreTurn(s, turn, out)
      scores.push(sc)
      outs.push(out)
      lines.push(JSON.stringify({ session: s.id, turn: k, input: turn.text, gold: { intents: turn.intents, risks: turn.risks, expect: turn.expect }, output: { intent: out.intent, risks: out.risks, reply: out.reply, actions: out.actions }, score: sc, usage: out.usage, ms: out.ms }))
      messages.push({ id: `${s.id}-a${k}`, role: "agent", text: out.reply || "（未生成回复）", at: k + 0.5 })
    }
  }
  const summary = summarize(scores, outs)
  writeFileSync(path.join(dir, "turns.jsonl"), lines.join("\n"))
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ condition: cond, mock: useMock, setHash: frozen.hash, model: cond === "rules" ? null : { main: cfg.model, fast: cfg.fastModel, baseURL: cfg.baseURL }, summary }, null, 2))
  results[cond] = summary
  console.log(`${cond.padEnd(15)} ${JSON.stringify(summary)}`)
}

if (!useMock) {
  const file = path.join(here, "e2e-results.json")
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}
  writeFileSync(file, JSON.stringify({ ...prev, generatedAt: new Date().toISOString(), setHash: frozen.hash, frozenAt: frozen.frozenAt, sessions: sessions.length, turns: sessions.reduce((a, s) => a + s.turns.length, 0), model: useLLM ? { main: cfg.model, fast: cfg.fastModel } : prev.model ?? null, conditions: { ...(prev.conditions ?? {}), ...results } }, null, 2))
  console.log("写入 eval/e2e-results.json")
} else console.log("（--mock：替身模型的冒烟测试，结果只写入 eval/runs/，不作为评测结果）")
