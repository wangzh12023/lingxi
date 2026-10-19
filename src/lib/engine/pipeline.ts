import type {
  PackSummary,
  AgentId,
  AgentTrace,
  Attachment,
  Citation,
  CustomerProfile,
  DraftStyle,
  EmotionVector,
  Insight,
  IntentKey,
  IntentState,
  Message,
  ModelCall,
  NextBestAction,
  ReplyDraft,
  RiskCategory,
  RiskLevel,
  ScriptedInsight,
  UnspokenNeed,
  VisionFinding,
} from "../types"
import { DRAFT_STYLES, EMOTIONS, EMOTION_ORDER, INTENTS } from "../constants"
import { PRODUCT_MAP, findProduct } from "../data"
import { buildCase, shouldHuddle } from "../huddle"
import { checkCompliance, scoreReply } from "./audit"
import {
  BATCH_CODE,
  analyzeIntent,
  composeWhisper,
  detectRefusal,
  detectRisk,
  draftReplies,
  type KnownForDraft,
  emotionVector,
  extractFacts,
  finalizeActions,
  findBatchCodes,
  inferUnspoken,
  mergeRisk,
  planActions,
  summarizeEmotion,
} from "./heuristics"
import { buildJourney, journeyHeadline } from "./journey"
import { retrieve } from "./retrieval"
import { routeTurn } from "./router"
import { sanitizeAction } from "../policy"
import { DEMO_NOW } from "../dataset"
import { brokenPromises, buildFactPack, subjectOrder, type FactPack } from "./facts"
import { actionsForBrokenPromise, draftsForBrokenPromise, hypothesis, promiseAside, remedyOf, whisperFromFacts } from "./compose"
import { checkClaims, type Claim } from "./claims"
import type { StoredRiskEvent } from "../events"

/**
 * The per-turn pipeline: 忆 望 闻 问 切 → 典 策 → 笔 → 检.
 *
 * It streams trace events so the console can light up each agent as it finishes. Three sources:
 *   script  a rehearsed turn: the script supplies the judgments, everything else is computed here
 *   rules   no model configured: the rule engine supplies the judgments
 *   llm     model agents supply the judgments; the rule track runs beside them as a guardrail
 * In every source the same code computes the emotion summary, risk level, data lookups, citations,
 * rubric scores, compliance, the recommended draft, approvers and the huddle case.
 */

export type PipelineEvent =
  | { type: "trace"; trace: AgentTrace }
  | { type: "partial"; patch: Partial<Insight> }
  | { type: "done"; insight: Insight }
  | { type: "error"; message: string }

export interface AnalyzeInput {
  messages: Message[]
  customer?: CustomerProfile
  /** catalogue SKUs this customer has bought — used to tell which product a conversation is about */
  orderSkus?: string[]
  /** the previous consumer turn's insight in this conversation — risk accumulates on top of it */
  prior?: Pick<Insight, "risk" | "emotion" | "turn" | "productId" | "huddleCase">
  scripted?: ScriptedInsight
  /** recognition result to use for this turn's image without calling a model (demo assets, or already analysed) */
  presetVision?: VisionFinding
  scenarioId?: string
  /** built on the server from the customer id and the task store; built from the dataset alone when absent */
  facts?: FactPack
  /** the board's record of this consumer's risk events — corrected (invalid) events are kept out */
  storedEvents?: StoredRiskEvent[]
  /** the demo clock; defaults to the dataset's pinned "now" */
  now?: string
  /** evaluation only: switch parts off to measure what they add */
  ablate?: { router?: boolean }
}

export interface PerceiveResult {
  intent: { primary: IntentKey; secondary?: IntentKey | null; confidence: number; summary: string }
  emotion: Partial<EmotionVector>
  unspoken: UnspokenNeed[]
  signals: { category: RiskCategory; level: number; title: string; evidence: string; action?: string; unverified?: boolean }[]
  keyFacts: string[]
  whisper: string
}

export interface ScribeResult {
  drafts: Partial<Record<DraftStyle, string>>
  actions: Omit<NextBestAction, "id">[]
}

export interface ModelResult<T> {
  data: T | null
  call: ModelCall
}

export interface LLMHooks {
  vision: (att: Attachment) => Promise<ModelResult<Omit<VisionFinding, "source">>>
  /** the full route: the main model reads and drafts in one call */
  full: (input: AnalyzeInput, ctx: { vision?: VisionFinding; citations: Citation[]; pack?: FactPack }) => Promise<ModelResult<PerceiveResult & ScribeResult>>
  /** a second call only when verification found unsupported or forbidden claims in the drafts */
  repair: (input: AnalyzeInput, ctx: { drafts: Record<DraftStyle, string>; problems: string[]; citations: Citation[]; pack?: FactPack }) => Promise<ModelResult<ScribeResult>>
  /** the lite route: the fast model reads and drafts in one call */
  lite: (input: AnalyzeInput, ctx: { citations: Citation[]; pack?: FactPack }) => Promise<ModelResult<PerceiveResult & ScribeResult>>
}

/** Pacing only for the rehearsed source, so the constellation can be followed on stage. Real runs are never slowed. */
const STAGE_PACE_MS = { short: 160, medium: 300, long: 420 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const INTENT_TAGS: Partial<Record<IntentKey, string[]>> = {
  adverse_reaction: ["不良反应", "皮肤不适"],
  logistics: ["物流", "延误"],
  authenticity: ["真伪", "防伪码"],
  return_refund: ["退款", "退货"],
  complaint: ["补偿"],
  product_efficacy: ["功效宣称"],
  membership: ["补偿"],
}

/** Intents whose replies tend to state policies, amounts or deadlines. */
const POLICY_INTENTS: IntentKey[] = ["return_refund", "adverse_reaction", "complaint", "authenticity", "membership", "price_promo", "logistics"]

const RISK_CATS: RiskCategory[] = ["safety", "regulatory", "pr", "legal", "churn", "fraud", "privacy", "minor", "service"]
const INTENT_KEYS = Object.keys(INTENTS) as IntentKey[]
const STYLES: DraftStyle[] = ["warm", "professional", "concise"]
const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0))

/** Strip quotes, spaces and punctuation, so “原话” matches the message it came from. */
const squash = (t: string) => t.replace(/[\s“”"'‘’「」『』（）()【】\[\]，,。.！!？?、：:；;…~～—-]/g, "")

/**
 * Is a quoted piece of evidence really in the materials? The quoted part (or the whole string when
 * nothing is quoted) must appear — 4 characters at least — in the conversation, the image reading or
 * the record. Evidence that cannot be found is kept, but as an unverified inference.
 */
export function anchored(evidence: string, materials: string): boolean {
  const m = squash(materials)
  const quoted = [...evidence.matchAll(/[“"「『]([^”"」』]{2,})[”"」』]/g)].map((x) => x[1])
  const parts = (quoted.length ? quoted : [evidence]).map(squash).filter((x) => x.length >= 4)
  if (!parts.length) return false
  return parts.some((x) => m.includes(x) || (x.length > 10 && m.includes(x.slice(0, 10))))
}

/** Model output is untrusted: keep only well-formed fields, drop the rest, and check quoted evidence against the materials. */
function sanitizePerceive(p: PerceiveResult | null, materials = ""): (PerceiveResult & { unverifiedSignals?: number[] }) | null {
  if (!p || typeof p !== "object" || !INTENT_KEYS.includes(p.intent?.primary)) return null
  const emotion: Partial<EmotionVector> = {}
  for (const k of EMOTION_ORDER) emotion[k] = clamp01(p.emotion?.[k])
  return {
    intent: {
      primary: p.intent.primary,
      secondary: INTENT_KEYS.includes(p.intent.secondary as IntentKey) ? p.intent.secondary : undefined,
      confidence: clamp01(p.intent.confidence),
      summary: String(p.intent.summary ?? "").slice(0, 40),
    },
    emotion,
    unspoken: (Array.isArray(p.unspoken) ? p.unspoken : [])
      .filter((u) => u?.surface && u?.underlying)
      .slice(0, 2)
      // a “surface” the consumer never said is not an unspoken need of theirs: keep it, at low confidence
      .map((u) => ({ surface: String(u.surface).slice(0, 60), underlying: String(u.underlying).slice(0, 60), confidence: !materials || anchored(String(u.surface), materials) ? clamp01(u.confidence) : Math.min(0.3, clamp01(u.confidence)) })),
    signals: (Array.isArray(p.signals) ? p.signals : [])
      .filter((x) => RISK_CATS.includes(x?.category) && x?.title)
      .slice(0, 4)
      .map((x) => {
        const evidence = String(x.evidence ?? "").slice(0, 120)
        const verified = !materials || anchored(evidence, materials)
        // an unverified model signal may raise attention, but not past L2 on its own
        const level = Math.max(1, Math.min(verified ? 4 : 2, Math.round(Number(x.level) || 1)))
        return { category: x.category, level, title: String(x.title).slice(0, 24), evidence, action: x.action ? String(x.action).slice(0, 60) : undefined, unverified: !verified }
      }),
    keyFacts: (Array.isArray(p.keyFacts) ? p.keyFacts : []).map(String).slice(0, 6),
    whisper: String(p.whisper ?? "").slice(0, 70),
  }
}

/** Unsupported claims become issues the draft is judged by, like any compliance problem. */
export function claimIssues(claims: Claim[]) {
  return claims
    .filter((x) => x.severity !== "ok")
    .map((x) => ({
      id: `claim-${x.kind}@${x.index}`,
      ruleId: `claim-${x.kind}`,
      phrase: x.text,
      index: x.index,
      reason: x.issue ?? "没有依据",
      suggestion: x.kind === "reask" ? "这项信息已经有了，直接引用记录" : "删去，或先建立并提交对应的任务、引用对应的记录",
      scope: "phrase" as const,
      severity: x.severity === "block" ? ("block" as const) : ("warn" as const),
    }))
}

/** Which catalogue product this conversation is about: named in the text, else carried over, else the only one ordered. */
function resolveProduct(text: string, input: AnalyzeInput): string | undefined {
  const named = findProduct(text)?.id
  if (named) return named
  if (input.prior?.productId) return input.prior.productId
  const skus = [...new Set(input.orderSkus ?? [])]
  return skus.length === 1 ? skus[0] : undefined
}

const RECOMMEND_REASON = {
  risk: "这一轮存在 L2 以上的风险，语气要稳，先接住对方",
  hot: "负面情绪强烈，先接住情绪",
  glad: "对方情绪积极，用温暖的语气延续好感",
  brisk: "客户档案显示对方看重效率，说重点即可",
  plain: "情绪平稳，信息清楚、条理分明更重要",
}

/**
 * Which draft to put forward is a policy, not the drafter's opinion of itself:
 * the style the situation calls for, unless it breaks a rule — then the best-scoring compliant one.
 */
function recommendDraft(drafts: ReplyDraft[], emotion: { intensity: number; valence: number }, level: RiskLevel, preferredTone?: string): Insight["recommended"] {
  const situation: keyof typeof RECOMMEND_REASON =
    emotion.valence < -0.2 && emotion.intensity >= 0.5 ? "hot" : level >= 2 ? "risk" : emotion.valence > 0.3 ? "glad" : /效率|重点|简洁/.test(preferredTone ?? "") ? "brisk" : "plain"
  const wanted: DraftStyle = situation === "brisk" ? "concise" : situation === "plain" ? "professional" : "warm"
  const ok = (d: ReplyDraft) => !d.issues.some((i) => i.severity === "block")
  if (drafts.some((d) => d.style === wanted && ok(d))) return { style: wanted, reason: RECOMMEND_REASON[situation] }
  const best = drafts.filter(ok).sort((a, b) => b.score.overall - a.score.overall)[0]
  return best
    ? { style: best.style, reason: `「${DRAFT_STYLES[wanted].cn}」版含违规表述，改为推荐合规版本中得分最高的` }
    : { style: wanted, reason: "三版草稿都含违规表述，请先修改再发送" }
}

export async function* runPipeline(input: AnalyzeInput, mode: "script" | "rules" | "llm", hooks?: LLMHooks): AsyncGenerator<PipelineEvent> {
  const last = input.messages.findLast((m) => m.role === "consumer")
  if (!last) {
    yield { type: "error", message: "没有可分析的消费者消息" }
    return
  }
  const text = last.text
  const turn = (input.prior?.turn ?? 0) + 1
  const s = input.scripted
  const useModel = mode === "llm" && Boolean(hooks) && !s
  const pace = (k: keyof typeof STAGE_PACE_MS) => (mode === "script" ? sleep(STAGE_PACE_MS[k]) : Promise.resolve())
  const traces = new Map<AgentId, AgentTrace>()
  const usage: ModelCall[] = []
  const degraded: AgentId[] = []

  const emit = (agent: AgentId, patch: Omit<AgentTrace, "agent">): PipelineEvent => {
    const t: AgentTrace = { ...traces.get(agent), agent, ...patch }
    traces.set(agent, t)
    return { type: "trace", trace: t }
  }
  const fallBack = (agents: AgentId[]) => {
    for (const a of agents) if (!degraded.includes(a)) degraded.push(a)
  }
  const doneOrDegraded = (agent: AgentId) => (degraded.includes(agent) ? "degraded" : "done")

  /* ── 感知 · 忆 望 ── */
  const c = input.customer
  yield emit("memory", { status: "running", headline: "读取客户档案" })
  yield emit("empath", { status: "running", headline: "解析情绪" })
  yield emit("intent", { status: "running", headline: "识别意图与潜台词" })
  const att = last.attachments?.[0]
  if (att) yield emit("vision", { status: "running", headline: "查看图片" })
  await pace("short")
  const now = input.now ? new Date(input.now) : DEMO_NOW
  const journey = c ? buildJourney(c.id, now) : undefined
  // 忆: the fact pack — built on the server with the live tasks; from the dataset alone otherwise
  const pack = input.facts ?? (c ? buildFactPack(c.id, now) : undefined)
  const broken = pack ? brokenPromises(pack) : []
  yield emit("memory", {
    status: "done",
    headline: journey ? journeyHeadline(journey) : "新访客，没有档案",
    detail: broken.length ? `欠消费者：${broken[0].text}（答应过 ${broken[0].history.length} 次）` : c?.historySummary,
    via: "data",
  })
  const packSummary: PackSummary | undefined = pack && {
    facts: pack.facts.slice(0, 10).map(({ id, source, ref, text }) => ({ id, source, ref, text })),
    unresolved: pack.unresolved,
    known: pack.known,
    commitments: pack.commitments.map((k) => ({ ref: k.ref, text: k.text, status: k.status, overdueHours: Math.round(k.overdueHours), times: k.history.length, dueAt: k.history.at(-1)!.dueAt, remedy: remedyOf(k, pack.tasks)?.id })),
  }
  if (packSummary) yield { type: "partial", patch: { pack: packSummary } }

  let vision: VisionFinding | undefined
  if (att) {
    if (input.presetVision) {
      vision = input.presetVision
      await pace("long")
      yield emit("vision", { status: "done", headline: vision.summary, via: vision.source === "model" ? "model" : "script" })
    } else if (mode === "llm" && hooks) {
      const r = await hooks.vision(att)
      usage.push(r.call)
      if (r.data) {
        vision = { ...r.data, source: "model" }
        yield emit("vision", { status: "done", headline: vision.summary, via: "model" })
      } else {
        fallBack(["vision"])
        vision = { summary: "图片未能识别，请人工查看", severity: "none", findings: [], privacy: [], containsFace: true, source: "none" }
        yield emit("vision", { status: "degraded", headline: "识别失败，已提示人工查看" })
      }
    } else {
      vision = { summary: "没有配置视觉模型，图片未经识别", severity: "none", findings: [], privacy: [], containsFace: true, source: "none" }
      yield emit("vision", { status: "skipped", headline: "未配置视觉模型，请人工查看图片" })
    }
    yield { type: "partial", patch: { vision } }
  } else {
    yield emit("vision", { status: "skipped", headline: "本轮没有图片" })
  }

  /* ── 典 · retrieval runs early so perception can use it ── */
  yield emit("scholar", { status: "running", headline: "检索知识库" })
  const ruleIntent = analyzeIntent(text)
  const productId = resolveProduct(text, input)
  const product = productId ? PRODUCT_MAP[productId] : undefined
  // which of this consumer's orders the turn is about
  const turnOrder = pack ? subjectOrder(pack, text, findProduct(text)?.id) : { order: undefined, ambiguous: false, by: "没有记录" }
  const queryIntent = s?.intent ?? ruleIntent
  const previous = input.messages.filter((m) => m.role === "consumer" && m.id !== last.id).at(-1)?.text ?? ""
  const promiseTags = broken.length ? ["服务承诺", "补寄", "失约"] : []
  let citations = retrieve(`${text} ${previous} ${queryIntent.summary}`, { k: 3, boostTags: [...(INTENT_TAGS[queryIntent.primary] ?? []), ...promiseTags], product })
  let reRetrieved = false
  // what perception checks its evidence against: everything the consumer wrote, the image reading, the record
  const materials = [...input.messages.filter((m) => m.role === "consumer").map((m) => m.text), vision?.summary ?? "", ...(pack?.facts.map((f) => f.text) ?? [])].join("\n")

  /* ── 省 · the rules have read the turn already; they decide how much model it needs ── */
  const journeySignals = (journey?.facts ?? []).filter((f) => f.level >= 1)
  let route = useModel
    ? input.ablate?.router === false
      ? { route: "full" as const, reason: "评测：关闭省 token 路由" }
      : routeTurn({
        text,
        intent: ruleIntent,
        emotion: summarizeEmotion(emotionVector(text)),
        signalLevel: Math.max(0, ...detectRisk(text, { vision, customer: c, valence: 0, batchCodes: findBatchCodes(text, vision) }).map((x) => x.level), ...journeySignals.map((f) => f.level)) as RiskLevel,
          priorLevel: input.prior?.risk.level ?? 0,
          hasImage: Boolean(att),
        })
    : undefined

  /* ── 闻 问 · judgments ── */
  let perceive: PerceiveResult | null = null
  let modelScribe: ScribeResult | null = null
  if (useModel && route?.route === "lite") {
    // the cheap model reads and drafts at once; whatever it flags is handed up to the main model
    const r = await hooks!.lite(input, { citations, pack })
    usage.push(r.call)
    const read = sanitizePerceive(r.data, materials)
    if (!read) route = { route: "full", reason: "快速模型没有返回有效结果，改由主模型完成" }
    else if (read.signals.some((x) => x.level >= 2)) route = { route: "full", reason: "快速模型发现了风险，升级到主模型" }
    else {
      perceive = read
      modelScribe = { drafts: r.data?.drafts ?? {}, actions: Array.isArray(r.data?.actions) ? r.data!.actions : [] }
    }
  }
  if (useModel && route?.route === "full") {
    const r = await hooks!.full(input, { vision, citations, pack })
    usage.push(r.call)
    perceive = sanitizePerceive(r.data, materials)
    if (!perceive) fallBack(["empath", "intent", "sentinel"])
    if (r.data?.drafts) modelScribe = { drafts: r.data.drafts, actions: Array.isArray(r.data.actions) ? r.data.actions : [] }
  }
  // the model read a different intent than the rules: retrieve again with what it read, before drafting
  if (perceive && perceive.intent.primary !== ruleIntent.primary) {
    const again = retrieve(`${text} ${previous} ${perceive.intent.summary}`, { k: 3, boostTags: [...(INTENT_TAGS[perceive.intent.primary] ?? []), ...promiseTags], product })
    if (again.map((x) => x.clauseId ?? x.docId).join() !== citations.map((x) => x.clauseId ?? x.docId).join()) {
      citations = again
      reRetrieved = true
    }
  }
  const judgedVia = s ? "script" : perceive ? "model" : "rule"

  const emotion = summarizeEmotion(s?.emotion ?? perceive?.emotion ?? emotionVector(text), input.prior?.emotion.vector)
  await pace("medium")
  yield emit("empath", { status: doneOrDegraded("empath"), headline: `主导情绪：${EMOTIONS[emotion.dominant].cn} · 强度 ${Math.round(emotion.intensity * 100)}`, via: judgedVia })
  yield { type: "partial", patch: { emotion } }

  const intent: IntentState = s?.intent ?? (perceive ? { ...perceive.intent, secondary: perceive.intent.secondary ?? undefined } : ruleIntent)
  const unspoken = s?.unspoken ?? perceive?.unspoken ?? inferUnspoken(text, intent.primary)
  const judged = s?.keyFacts ?? perceive?.keyFacts ?? []
  const field = (f: string) => f.split("：")[0].slice(0, 2)
  const keyFacts = [...judged, ...extractFacts(text, vision).filter((f) => !judged.some((j) => field(j) === field(f)))].slice(0, 6)
  await pace("medium")
  yield emit("intent", { status: doneOrDegraded("intent"), headline: intent.summary, detail: unspoken[0]?.underlying, via: judgedVia })
  yield { type: "partial", patch: { intent, unspoken, keyFacts, productId } }

  /* ── 切 · risk accumulates across the conversation ── */
  yield emit("sentinel", { status: "running", headline: "研判风险" })
  await pace("long")
  const priorSignals = input.prior?.risk.signals ?? []
  const priorCodes = priorSignals.flatMap((x) => x.title.match(new RegExp(BATCH_CODE.source, "g")) ?? [])
  const batchCodes = [...new Set([...priorCodes, ...findBatchCodes(text, vision)])]
  // every signal is about an event: the order for product safety, the batch for batch anomalies, the
  // promise ticket for a broken promise, the consumer for the rest
  const subject = turnOrder.order?.id ?? productId ?? "conversation"
  const who = c?.id ?? "visitor"
  const brokenRef = broken[0]?.ref
  const keyOf = (category: RiskCategory, title: string, evidence: string): string => {
    const code = `${title} ${evidence}`.match(BATCH_CODE)?.[0]
    if (category === "safety") return code ? `safety:batch:${code}` : `safety:${subject}`
    if (category === "service" && brokenRef && /承诺|失约|明天|补寄|没发|未发/.test(`${title}${evidence}`)) return `service:broken_promise:${brokenRef}`
    if (category === "service" && /进线|又来|第.次/.test(`${title}${evidence}`)) return `service:repeat_contact:${who}`
    return `${category}:${who}`
  }
  const fresh = [
    ...detectRisk(text, { vision, customer: c, valence: emotion.valence, batchCodes }).map((x) => ({ ...x, eventKey: keyOf(x.category, x.title, x.evidence) })),
    // 忆 → 切: facts that only exist across orders, tickets and past contacts
    ...journeySignals.map((f) => ({ category: f.category, level: f.level, title: f.label, evidence: `忆：${f.detail}`, rule: f.rule, action: f.action, origin: "data" as const, eventKey: `${f.category}:${f.key}:${f.ref}` })),
    ...(s?.signals ?? []).map((x) => ({ ...x, origin: "script" as const, eventKey: keyOf(x.category, x.title, x.evidence) })),
    ...(perceive?.signals ?? []).map((x) => ({ category: x.category, level: x.level as RiskLevel, title: x.title, evidence: x.evidence, action: x.action, origin: "model" as const, unverified: x.unverified, eventKey: keyOf(x.category, x.title, x.evidence) })),
  ]
  const refusal = detectRefusal(text, priorSignals)
  if (refusal) fresh.push({ ...refusal, eventKey: `churn:${who}` })
  // a person marked these events as wrong (e.g. a misread batch code): they stay out, with the reason shown
  const invalid = new Map((input.storedEvents ?? []).filter((e) => e.status === "invalid").map((e) => [e.eventKey, e]))
  const keep = <T extends { eventKey?: string; category: RiskCategory; title: string }>(x: T) => !invalid.has(x.eventKey ?? `${x.category}|${x.title}`)
  // a consumer's own corrections are always listed; a batch-wide one ("*") only where it removed something
  const removed = new Set([...priorSignals, ...fresh].filter((x) => !keep(x)).map((x) => x.eventKey))
  const corrections = [...invalid.values()].filter((e) => e.customerId !== "*" || removed.has(e.eventKey)).map((e) => ({ eventKey: e.eventKey, title: e.title, reason: e.invalidReason ?? "已标记为无效", by: e.invalidBy ?? "—" }))
  const risk = mergeRisk(priorSignals.filter(keep), fresh.filter(keep), turn)
  const newCount = risk.signals.filter((x) => x.turn === turn).length
  yield emit("sentinel", {
    status: doneOrDegraded("sentinel"),
    headline: `风险等级 L${risk.level} · ${risk.signals.length} 个信号${turn > 1 && newCount ? `，本轮新增 ${newCount}` : ""}`,
    detail: risk.signals[0]?.title,
    via: risk.signals[0]?.origin ?? "rule",
  })
  yield { type: "partial", patch: { risk } }

  await pace("short")
  yield emit("scholar", { status: "done", headline: citations.length ? `命中 ${citations.length} 条依据${reRetrieved ? "（按模型纠正后的意图重新检索）" : ""}` : "没有命中依据", detail: citations[0]?.title, via: "rule" })
  yield { type: "partial", patch: { citations } }

  /* ── 融合 · 策 ── */
  yield emit("strategist", { status: "running", headline: "制定下一步" })
  const categories = risk.signals.filter((x) => x.level >= 2).map((x) => x.category)
  const needsHuddle = shouldHuddle(risk.level, categories)
  // one case per conversation: once opened, later turns keep pointing at the same case
  const priorCase = input.prior?.huddleCase
  let huddleCase = priorCase ?? (needsHuddle && c ? { ...buildCase(c, { turn, intent, risk, vision, unspoken, citations }, input.scenarioId), version: 1 } : undefined)
  // the case stays the same case, but new evidence is added to it — and a roundtable held earlier must be reviewed
  if (priorCase && c) {
    const now = buildCase(c, { turn, intent, risk, vision, unspoken, citations }, input.scenarioId)
    const added = now.evidence.filter((e) => !priorCase.evidence.includes(e))
    if (added.length) huddleCase = { ...priorCase, evidence: [...priorCase.evidence, ...added].slice(-8), level: Math.max(priorCase.level, now.level) as RiskLevel, version: (priorCase.version ?? 1) + 1, newEvidence: added }
    else huddleCase = { ...priorCase, newEvidence: undefined }
  }
  const freshHuddle = Boolean(huddleCase && !input.prior?.huddleCase)
  const whisper =
    (s?.whisper || undefined) ??
    (perceive?.whisper ||
      (freshHuddle ? composeWhisper(emotion.dominant, unspoken, risk.level, true) : (pack && whisperFromFacts(pack, c?.name)) || hypothesis(unspoken, intent.primary, composeWhisper(emotion.dominant, unspoken, risk.level, false), c?.name)))

  /* ── 起草 · 笔 ── */
  yield emit("scribe", { status: "running", headline: "起草三版回复" })
  // a scripted turn may leave drafts empty: then the rule track writes them from the record, like offline
  let draftTexts: Partial<Record<DraftStyle, string>> | undefined = s?.drafts && STYLES.every((k) => s.drafts[k]) ? s.drafts : undefined
  let rawActions: Omit<NextBestAction, "id">[] | undefined = s?.actions?.length ? s.actions : undefined
  let actionsVia: "script" | "model" | "rule" = rawActions ? "script" : "rule"
  if (useModel && route?.route !== "fast") {
    // the drafts came back with the reading, in the same call
    const r = { data: modelScribe }
    const d = r.data?.drafts
    if (d && STYLES.every((k) => typeof d[k] === "string" && d[k]!.trim())) {
      draftTexts = d
      const acts = (Array.isArray(r.data?.actions) ? r.data!.actions : []).filter((a) => a?.title)
      if (acts.length) {
        // only the whitelisted fields survive; approver and the like are decided by policy, not by the model
        rawActions = acts.map(sanitizeAction).filter((a): a is Omit<NextBestAction, "id"> => a !== null)
        actionsVia = "model"
      }
    } else fallBack(["scribe", "strategist"])
  }
  const draftOrigin = draftTexts ? (s?.drafts && draftTexts === s.drafts ? "script" : "model") : "rule"
  // the rule track writes from the record: a broken promise is named, dated and owned, known facts are not asked again
  const factDrafts = !draftTexts && pack ? draftsForBrokenPromise(c?.name, pack, turnOrder.order?.id) : null
  const aside = !draftTexts && !factDrafts && pack ? promiseAside(pack) : null
  const known: KnownForDraft = pack
    ? {
        order: turnOrder.order,
        ambiguous: turnOrder.ambiguous ? pack.orders.slice(0, 3).map((o) => ({ id: o.id, product: o.product })) : undefined,
        photos: pack.known.some((k) => /照片/.test(k.label)),
        batch: turnOrder.order?.batch,
        story: pack.known.some((k) => k.label === "问题经过"),
      }
    : {}
  const base = draftReplies(intent.primary, emotion.dominant, c?.name, known)
  const withAside = aside ? { warm: `${base.warm}${aside}`, professional: `${base.professional}${aside}`, concise: base.concise } : base
  const texts = { ...withAside, ...(factDrafts ?? {}), ...draftTexts }

  // the rules decide the huddle and the approvals, whoever wrote the action list
  const promiseActs = !rawActions && pack ? actionsForBrokenPromise(pack) : null
  let actionList = rawActions?.length ? rawActions : [...(promiseActs ?? []), ...planActions(intent.primary, risk.level, categories).filter((a) => !promiseActs || a.kind !== "followup" || !/直接解答/.test(a.title))]
  // a `resolves` that does not point at one of this consumer's promises is dropped
  const refs = new Set(pack?.commitments.map((k) => k.ref) ?? [])
  actionList = actionList.map((a) => (a.resolves && !refs.has(a.resolves) ? { ...a, resolves: undefined } : a))
  if (freshHuddle && !actionList.some((a) => a.kind === "escalate" && /会诊/.test(a.title))) {
    actionList = [{ kind: "escalate", title: "发起跨部门会诊", detail: "按风险归属召集相关部门", impact: "形成带责任部门的决议", primary: true }, ...actionList.map((a) => ({ ...a, primary: false }))]
  }
  const policySensitive = POLICY_INTENTS.includes(intent.primary) || actionList.some((a) => a.cost)
  if (!citations.length && policySensitive && !actionList.some((a) => /确认政策/.test(a.title))) {
    actionList = [...actionList.slice(0, 3), { kind: "verify", title: "向主管确认政策", detail: "知识库没有命中依据，涉及政策、金额或时限前先确认", impact: "不编造承诺" }]
  }
  const actions = finalizeActions(actionList, { brokenPromises: broken.length })
  await pace("long")
  yield emit("strategist", { status: doneOrDegraded("strategist"), headline: actions.find((a) => a.primary)?.title ?? "—", detail: whisper, via: actionsVia })
  yield { type: "partial", patch: { actions, whisper, huddleCase } }

  /* ── 守护 · 检 ── */
  yield emit("auditor", { status: "running", headline: "合规检查与评分" })
  const situation = {
    safety: categories.includes("safety") || intent.primary === "adverse_reaction",
    logistics: intent.primary === "logistics",
    refund: intent.primary === "return_refund",
    promise: broken.length > 0 || (pack?.commitments.length ?? 0) > 0,
  }
  const check = (all: Record<DraftStyle, string>): ReplyDraft[] =>
    STYLES.map((style) => {
      const t = all[style]
      const claims = checkClaims(t, { pack, level: risk.level, situation })
      const issues = [...checkCompliance(t, { product }), ...claimIssues(claims)]
      return { id: `${turn}-${style}`, style, text: t, issues, score: scoreReply(t, { product, issues }), origin: draftOrigin, claims }
    })
  let drafts = check(texts)
  // 核验 → 修正: model drafts that verification blocks get one rewrite with the reasons; the rewrite is checked again
  const problems = drafts.flatMap((d) => d.issues.filter((x) => x.severity === "block").map((x) => `${DRAFT_STYLES[d.style].cn}版“${x.phrase}”：${x.reason}`))
  // (a corrected intent alone does not cost a second call: what matters is whether a draft says something unsupported)
  if (useModel && draftOrigin === "model" && problems.length) {
    yield emit("scribe", { status: "running", headline: `核验发现 ${problems.length} 处问题，交回模型修正` })
    const r = await hooks!.repair(input, { drafts: texts, problems, citations, pack })
    usage.push(r.call)
    const d = r.data?.drafts
    if (d && STYLES.every((k) => typeof d[k] === "string" && d[k]!.trim())) {
      const repaired = check({ ...texts, ...(d as Record<DraftStyle, string>) })
      // keep the rewrite only if it is no worse than what it replaces
      const blocking = (xs: ReplyDraft[]) => xs.filter((x) => x.issues.some((i) => i.severity === "block")).length
      if (blocking(repaired) <= blocking(drafts)) drafts = repaired
    }
  }
  const recommended = recommendDraft(drafts, emotion, risk.level, c?.preferredTone)
  yield emit("scribe", { status: doneOrDegraded("scribe"), headline: `三版草稿 · 推荐「${DRAFT_STYLES[recommended.style].cn}」`, via: draftOrigin })
  yield { type: "partial", patch: { drafts, recommended } }
  await pace("short")
  const blocked = drafts.filter((d) => d.issues.some((i) => i.severity === "block")).length
  yield emit("auditor", { status: "done", headline: blocked ? `${blocked} 版草稿含违规表述，已标出` : "三版草稿均未发现违规", via: "rule" })

  yield {
    type: "done",
    insight: {
      messageId: last.id,
      turn,
      intent,
      emotion,
      unspoken,
      risk,
      vision,
      productId,
      citations,
      drafts,
      recommended,
      actions,
      keyFacts,
      trace: [...traces.values()],
      whisper,
      huddleCase,
      // a turn the router kept away from the model was judged by rules, and is labelled so
      source: s ? "script" : mode === "llm" && route?.route !== "fast" ? "llm" : "rules",
      degraded,
      usage,
      route,
      pack: packSummary,
      corrections: corrections.length ? corrections : undefined,
    },
  }
}
