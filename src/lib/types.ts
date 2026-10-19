/**
 * 灵犀 Lingxi — core domain types.
 *
 * One analysis result ("Insight") is produced per consumer turn by the agent pipeline.
 * A design rule runs through this file: anything shown as a number or a finding carries where it
 * came from (`Origin`), and anything that can be computed is computed — rehearsed demo turns pin
 * down only the judgments a language model would make (see `ScriptedInsight`).
 */

export type Channel = "tmall" | "douyin" | "wechat" | "jd" | "hotline" | "xiaohongshu"

export type Role = "consumer" | "agent" | "system"

export type EmotionKey = "anger" | "anxiety" | "sadness" | "grievance" | "calm" | "anticipation" | "joy" | "gratitude"

export type EmotionVector = Record<EmotionKey, number>

/** Everything except `vector` is derived from it by `summarizeEmotion` — never typed by hand or taken from a model. */
export interface EmotionState {
  vector: EmotionVector
  dominant: EmotionKey
  intensity: number
  valence: number
  trend: "rising" | "falling" | "stable"
}

export type IntentKey =
  | "pre_sale_consult" // 售前咨询
  | "product_efficacy" // 功效咨询
  | "usage_guidance" // 使用指导
  | "skin_matching" // 肤质匹配
  | "authenticity" // 真伪鉴别
  | "logistics" // 物流查询
  | "return_refund" // 退换退款
  | "adverse_reaction" // 不良反应
  | "complaint" // 投诉
  | "price_promo" // 价格优惠
  | "membership" // 会员权益
  | "gift_consult" // 送礼咨询
  | "other"

export interface IntentState {
  primary: IntentKey
  secondary?: IntentKey
  confidence: number
  summary: string
}

export type RiskLevel = 0 | 1 | 2 | 3 | 4

export type RiskCategory =
  | "safety" // 产品安全/不良反应
  | "regulatory" // 监管合规
  | "pr" // 舆情公关
  | "legal" // 法律纠纷
  | "churn" // 流失
  | "fraud" // 异常索赔
  | "privacy" // 隐私
  | "minor" // 未成年人
  | "service" // 服务异常：重复进线、承诺逾期、情绪升级

/**
 * Where a finding came from. Shown in the UI so nothing reads as more certain than it is.
 *  rule   — a deterministic rule matched the text
 *  data   — a lookup against business data (batch complaints, customer profile)
 *  model  — a language/vision model said so
 *  script — a rehearsed demo turn, standing in for what a model would say
 */
export type Origin = "rule" | "data" | "model" | "script"

export interface RiskSignal {
  id: string
  category: RiskCategory
  level: RiskLevel
  title: string
  evidence: string
  rule?: string
  action?: string
  origin: Origin
  /** 1-based index of the consumer turn that raised it — risk is cumulative over a conversation */
  turn: number
  /**
   * The problem this signal is about — `safety:TM20261003-4471`, `safety:batch:LX2608A`,
   * `service:broken_promise:T-2610-0388`. Signals are merged per event, so a model renaming a title
   * does not count the same problem twice, and the board tracks each event's status.
   */
  eventKey?: string
  /** every piece of evidence merged into this event, newest last */
  evidenceList?: string[]
  /** a model signal whose quoted evidence could not be found in the conversation or the record */
  unverified?: boolean
}

/** `level` is the highest level among `signals`. There is no separate score. */
export interface RiskState {
  level: RiskLevel
  signals: RiskSignal[]
}

export interface CustomerProfile {
  id: string
  name: string
  avatarSeed: string
  tier: "新客" | "银卡" | "金卡" | "黑金"
  ltv: number
  orders: number
  skinType: string
  concerns: string[]
  preferredTone: string
  sensitivity: string[]
  lastContact?: string
  channelHabits: Channel[]
  tags: string[]
  historySummary: string
  /** churn-model score on the customer record (demo data) */
  churnRisk: number
  /** distinct accounts sharing this device and compensation claims in the last 90 days (demo data) */
  claims?: { accounts: number; last90d: number }
}

/** Order records carry no batch code: it is printed on the package only, so it reaches us through the consumer. */
export interface Order {
  id: string
  product: string
  sku: string
  price: number
  date: string
  status: string
  channel: Channel
}

export interface Product {
  id: string
  brand: string
  name: string
  /** short name used when matching mentions in conversation */
  aliases: string[]
  category: string
  price: number
  keyIngredients: string[]
  /** efficacy categories on file for this product — a reply must not claim beyond them */
  claims: string[]
  cautions: string[]
  suitableFor: string[]
  /** contains a strong active that is not recommended to minors */
  strongActive?: boolean
}

export interface KnowledgeDoc {
  id: string
  kind: "sop" | "policy" | "regulation" | "product" | "case"
  title: string
  source: string
  body: string
  tags: string[]
  updatedAt: string
  /** regulation documents only: the day the quoted articles were checked against the official text */
  verifiedAt?: string
  /** where the official text lives */
  refs?: { label: string; url: string }[]
  /** policies split into clauses: each has its own id and the situation it is written for */
  clauses?: KnowledgeClause[]
}

export interface KnowledgeClause {
  id: string
  title: string
  /** the situation the clause is written for — a citation supports a reply only when this holds */
  applies: string
  text: string
}

export interface Citation {
  docId: string
  /** the clause within the document, when the document is split into clauses */
  clauseId?: string
  /** the document version the clause was read from */
  version?: string
  /** the situation the clause is written for — a citation is only support when this holds */
  applies?: string
  title: string
  kind: KnowledgeDoc["kind"]
  snippet: string
  /** the query terms and tags that hit this document — shown instead of an opaque relevance score */
  matched: string[]
}

/** Normalised rectangle: [x, y, width, height], each 0–1 of the image. */
export type Box = [number, number, number, number]

export interface Attachment {
  id: string
  kind: "image"
  url: string
  caption?: string
}

export interface VisionFinding {
  /** visible features only — never a diagnosis */
  summary: string
  severity: "none" | "mild" | "moderate" | "severe"
  findings: { label: string; confidence: number; box?: Box }[]
  /** regions the console covers before showing the image to an agent (eyes, ID numbers …) */
  privacy: { label: string; box: Box }[]
  /** a face is visible. With no privacy boxes to cover it, the console keeps the whole image blurred. */
  containsFace: boolean
  /** model: a vision model looked at it · preset: recognition result shipped with a demo image · none: nobody looked */
  source: "model" | "preset" | "none"
}

export interface Message {
  id: string
  role: Role
  text: string
  at: number
  attachments?: Attachment[]
  /** agent messages: typed by hand, adopted from a draft, or adopted then edited */
  origin?: "manual" | "ai" | "ai_edited"
  /** consumer messages, filled in once analysed — lets later turns build on earlier ones without re-analysing */
  vision?: VisionFinding
  valence?: number
}

export type DraftStyle = "warm" | "professional" | "concise"

export interface RubricCheck {
  dim: "empathy" | "professional"
  label: string
  pass: boolean
}

/**
 * Rule-computed rubric. The same scorer grades AI drafts in the console and trainees in the academy,
 * so a score always decomposes into the checks that produced it.
 */
export interface ReplyScore {
  empathy: number
  professional: number
  compliance: number
  efficiency: number
  overall: number
  checks: RubricCheck[]
}

export interface ComplianceIssue {
  id: string
  ruleId: string
  /** the offending text and where it starts in the reply */
  phrase: string
  index: number
  reason: string
  suggestion: string
  /** safe replacement, when the rule has one … */
  replace?: string
  /** … for the matched phrase, or for the whole clause it sits in */
  scope?: "phrase" | "clause"
  severity: "warn" | "block"
}

export interface ReplyDraft {
  id: string
  style: DraftStyle
  text: string
  score: ReplyScore
  issues: ComplianceIssue[]
  origin: Origin
  /** each order, amount, time and “已安排” in the text, and what supports it */
  claims?: import("./engine/claims").Claim[]
}

export interface NextBestAction {
  id: string
  kind: "compensation" | "escalate" | "followup" | "education" | "recommend" | "verify" | "report"
  title: string
  detail: string
  cost?: number
  impact: string
  /** who must sign off — computed by policy.ts from the kind and cost; never taken from whoever proposed the action */
  approver?: string
  /** why that approver (or none); `blocked` when the action cannot be approved as proposed */
  policy?: { basis: string; blocked?: string }
  /** what may be told to the consumer once this is approved and submitted */
  commitment?: string
  /** how long the commitment gives us, in demo hours */
  dueInHours?: number
  /** the earlier promise (ticket id) this action makes good */
  resolves?: string
  primary?: boolean
}

export interface UnspokenNeed {
  surface: string
  underlying: string
  confidence: number
}

export type AgentId =
  | "vision" // 望
  | "empath" // 闻
  | "intent" // 问
  | "sentinel" // 切
  | "memory" // 忆
  | "scholar" // 典
  | "strategist" // 策
  | "scribe" // 笔
  | "auditor" // 检
  | "guardian" // 护
  | "moderator" // 议
  | "insighter" // 察
  | "coach" // 练

export type AgentPhase = "perceive" | "fuse" | "decide" | "guard" | "learn"

export interface AgentDef {
  id: AgentId
  glyph: string
  cn: string
  en: string
  role: string
  description: string
  color: string
  phase: AgentPhase
  model: "flagship" | "fast" | "vision" | "rule" | "hybrid" | "embed"
  inputs: string[]
  outputs: string[]
  tools: string[]
  /** latency budget in ms — a design target, not a measurement */
  budget: number
  /** what actually runs behind this agent in the current build */
  impl: string
}

export interface AgentTrace {
  agent: AgentId
  /** degraded: the model call failed or returned something unusable, so the rule engine answered instead */
  status: "idle" | "running" | "done" | "degraded" | "skipped"
  headline?: string
  detail?: string
  via?: Origin
}

/** One real model call. Several agents can share a call (闻 / 问 / 切 are one prompt), so usage is per call, not per agent. */
export interface ModelCall {
  name: string
  agents: AgentId[]
  model: string
  ms: number
  tokens: number
  /** input / output split and how much of the input the provider served from its prefix cache, when reported */
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  /** how many requests this logical call took (a JSON-mode retry makes it 2) */
  attempts?: number
  ok: boolean
}

export interface Insight {
  messageId: string
  /** 1-based index of this consumer turn */
  turn: number
  intent: IntentState
  emotion: EmotionState
  unspoken: UnspokenNeed[]
  risk: RiskState
  vision?: VisionFinding
  /** the catalogue product this conversation is about, when one can be identified */
  productId?: string
  citations: Citation[]
  drafts: ReplyDraft[]
  recommended: { style: DraftStyle; reason: string }
  actions: NextBestAction[]
  keyFacts: string[]
  trace: AgentTrace[]
  /** the one-line coaching hint on the 灵犀一念 card */
  whisper: string
  /** present when the risk warrants a cross-department huddle */
  huddleCase?: HuddleCase
  /** script: a rehearsed demo turn · rules: the offline rule engine · llm: model agents with rule guardrails */
  source: "script" | "rules" | "llm"
  /** agents whose model call fell back to rules on this turn */
  degraded: AgentId[]
  /** real model calls made for this turn — empty unless a model was actually called */
  usage: ModelCall[]
  /** how much model this turn was given and why — set whenever a model is configured */
  route?: { route: "fast" | "lite" | "full"; reason: string }
  /** what the record says this consumer is owed and has already given — the plugin's first card */
  pack?: PackSummary
  /** risk events a person has marked as wrong, and why — kept out of this turn's risk */
  corrections?: { eventKey: string; title: string; reason: string; by: string }[]
}

export interface PackSummary {
  facts: { id: string; source: string; ref: string; text: string }[]
  unresolved: { text: string; ref: string }[]
  known: { label: string; value: string; ref: string }[]
  commitments: { ref: string; text: string; status: "pending" | "overdue" | "kept"; overdueHours: number; times: number; dueAt: string; remedy?: string }[]
}

/**
 * What a rehearsed demo turn pins down: the judgments a language model would make.
 * Everything else — emotion summary, risk level, batch lookup, citations, rubric scores,
 * compliance issues, recommended draft, approvers, huddle seats — is computed live.
 */
export interface ScriptedInsight {
  intent: IntentState
  emotion: Partial<EmotionVector>
  unspoken: UnspokenNeed[]
  signals: Omit<RiskSignal, "id" | "origin" | "turn">[]
  keyFacts: string[]
  whisper: string
  drafts: Record<DraftStyle, string>
  actions: Omit<NextBestAction, "id">[]
}

/** 护 — the human side of 双向共情 */
export interface AgentWellbeing {
  agentName: string
  stress: number // 0–100
  sessionsToday: number
  hardSessions: number
  streakNegative: number
  lastBreakMin: number
}

export type HuddleRoleId = "moderator" | "cs" | "qa" | "legal" | "pr" | "rnd" | "crm" | "risk"

export interface HuddleRole {
  id: HuddleRoleId
  name: string
  title: string
  color: string
  stance: string
}

export interface HuddleTurn {
  id: string
  role: HuddleRoleId
  text: string
  stance?: "support" | "caution" | "oppose" | "neutral"
  refs?: string[]
}

export interface HuddleResolution {
  decision: string
  actions: { owner: string; action: string; deadline: string }[]
  /** derived from the seats' final stances by `consensusOf` */
  consensus: number
  dissent?: string
}

/** One case put before the roundtable. Seats (`roles`) are convened from the risk categories involved. */
export interface HuddleCase {
  id: string
  title: string
  level: RiskLevel
  summary: string
  evidence: string[]
  roles: HuddleRoleId[]
  categories: RiskCategory[]
  /** the consumer's unspoken need — the customer-experience seat argues from it */
  hint?: string
  /** the rehearsed scenario this case came from, if any — selects its scripted roundtable */
  scenarioId?: string
  /** bumps when new evidence joins the case; a roundtable held on an older version needs review */
  version?: number
  /** evidence added since the previous version */
  newEvidence?: string[]
}

/** A hand-written roundtable for a rehearsed case. Consensus is still computed from its turns. */
export interface HuddleScript {
  turns: HuddleTurn[]
  resolution: Omit<HuddleResolution, "consensus">
}

export type HuddleSource = "script" | "composed" | "llm"

export interface HuddleRecord {
  caseId: string
  turns: HuddleTurn[]
  resolution: HuddleResolution
  source: HuddleSource
  /** the case version the roundtable was held on */
  caseVersion?: number
}

export type ScriptStep =
  | { id: string; role: "consumer"; text: string; attachments?: Attachment[]; insight: ScriptedInsight }
  /** the agent's turn: the console pre-fills the recommended draft and the human sends it */
  | { id: string; role: "agent" }
  /** the roundtable convenes before the conversation continues */
  | { id: string; role: "huddle" }

export interface Scenario {
  id: string
  title: string
  subtitle: string
  channel: Channel
  tags: string[]
  customer: CustomerProfile
  orders: Order[]
  script: ScriptStep[]
  highlight: string
  /** how long this consumer has been waiting when the demo opens */
  waitingSec: number
  /** rehearsed roundtable for the case this scenario escalates */
  huddle?: HuddleScript
}
