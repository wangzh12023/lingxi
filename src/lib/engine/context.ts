import type { Citation, RiskLevel, VisionFinding } from "../types"
import type { AnalyzeInput, PerceiveResult } from "./pipeline"
import { factDigest, type FactPack } from "./facts"

/**
 * What a model is shown. Kept apart from the provider code so the same builders feed the real calls
 * and the token estimate in eval/.
 *
 * Two things here exist to save tokens:
 *   · the dialogue is windowed, and old messages are dropped in steps rather than one at a time
 *   · blocks are ordered from most to least stable — profile, then the append-only dialogue, then
 *     whatever belongs to this turn only — so consecutive calls in one conversation share the
 *     longest possible prefix, which is what a provider-side prefix cache bills at a discount
 */
export const HISTORY_WINDOW = 8
const HISTORY_STEP = 4
const MESSAGE_CAP = 240

const line = (m: AnalyzeInput["messages"][number], cap = MESSAGE_CAP) =>
  `${m.role === "consumer" ? "消费者" : m.role === "agent" ? "坐席" : "系统"}：${m.text.length > cap ? `${m.text.slice(0, cap)}…` : m.text}${m.attachments?.length ? `［附图 ${m.attachments.length} 张］` : ""}`

/**
 * The dialogue window. The newest consumer message is always sent whole — a risk cue in its 300th
 * character must reach the model. Older messages are capped; messages older than the window are
 * dropped, and what must survive them (open risks, promises, corrections) travels in the fact pack
 * and in 【此前已识别的风险】 instead.
 */
export function transcript(input: AnalyzeInput): string {
  const all = input.messages
  const start = all.length > HISTORY_WINDOW + HISTORY_STEP ? Math.floor((all.length - HISTORY_WINDOW) / HISTORY_STEP) * HISTORY_STEP : 0
  const lastConsumer = all.findLast((m) => m.role === "consumer")
  return `${start ? `（更早的 ${start} 条消息已省略，其中的风险、承诺与纠正见上方的服务事实）\n` : ""}${all
    .slice(start)
    .map((m) => line(m, m === lastConsumer ? Infinity : MESSAGE_CAP))
    .join("\n")}`
}

/** The whole dialogue, uncapped — only used to estimate what an untrimmed prompt would cost. */
export const fullTranscript = (input: AnalyzeInput) => input.messages.map((m) => line(m, Infinity)).join("\n")

export function profile(input: AnalyzeInput): string {
  const c = input.customer
  if (!c) return "（新访客，没有档案）"
  return [
    `${c.name}，${c.tier}，${c.orders} 单，累计消费 ¥${c.ltv}`,
    `肤质：${c.skinType}；沟通偏好：${c.preferredTone}；敏感：${c.sensitivity.join("、") || "无"}`,
    `标签：${c.tags.join("、") || "无"}`,
    `历史：${c.historySummary}`,
  ].join("\n")
}

const join = (blocks: (string | false | undefined)[]) => blocks.filter(Boolean).join("\n\n")

const factsBlock = (pack?: FactPack) => (pack ? `【服务事实】（编号可引用；订单、工单、承诺与进线记录）\n${factDigest(pack)}` : "")

export function perceiveUser(input: AnalyzeInput, ctx: { vision?: VisionFinding; citations: Citation[]; pack?: FactPack }): string {
  return join([
    `【客户档案】\n${profile(input)}`,
    factsBlock(ctx.pack),
    `【对话】\n${transcript(input)}`,
    ctx.vision && ctx.vision.source !== "none" && `【图片识别】${ctx.vision.summary}（${ctx.vision.findings.map((f) => f.label).join("、")}）`,
    !!input.prior?.risk.signals.length && `【此前已识别的风险】${input.prior.risk.signals.map((s) => `L${s.level} ${s.title}`).join("；")}`,
    !!ctx.citations.length && `【知识库】\n${ctx.citations.map((c) => `- ${c.title}：${c.snippet}`).join("\n")}`,
    "请分析最后一条消费者消息，输出 JSON。",
  ])
}

export function scribeUser(input: AnalyzeInput, ctx: { perceive: PerceiveResult; citations: Citation[]; vision?: VisionFinding; level: RiskLevel; pack?: FactPack }): string {
  return join([
    `【客户档案】\n${profile(input)}`,
    factsBlock(ctx.pack),
    `【对话】\n${transcript(input)}`,
    `【感知结果】${JSON.stringify({ intent: ctx.perceive.intent, unspoken: ctx.perceive.unspoken, keyFacts: ctx.perceive.keyFacts, riskLevel: `L${ctx.level}` })}`,
    ctx.vision && ctx.vision.source !== "none" && `【图片识别】${ctx.vision.summary}`,
    ctx.citations.length ? `【知识库引用】\n${ctx.citations.map((c) => `- [${c.clauseId ?? c.docId}] ${c.title}${c.applies ? `（适用：${c.applies}）` : ""}：${c.snippet}`).join("\n")}` : "【知识库引用】（空）",
    "请起草回复，输出 JSON。",
  ])
}

/** The full route: one main-model call reads and drafts, with the same context as perception. */
export const fullUser = (input: AnalyzeInput, ctx: { vision?: VisionFinding; citations: Citation[]; pack?: FactPack }) => perceiveUser(input, ctx).replace("请分析最后一条消费者消息，输出 JSON。", "请完成研判并起草，输出 JSON。")

/** The repair call: the drafts, what verification found wrong with them, and the citations to use. */
export function repairUser(input: AnalyzeInput, ctx: { drafts: Record<string, string>; problems: string[]; citations: Citation[]; pack?: FactPack }): string {
  return join([
    factsBlock(ctx.pack),
    ctx.citations.length ? `【知识库】\n${ctx.citations.map((c) => `- [${c.clauseId ?? c.docId}] ${c.title}${c.applies ? `（适用：${c.applies}）` : ""}：${c.snippet}`).join("\n")}` : "【知识库】（空）",
    `【刚才的草稿】\n${Object.entries(ctx.drafts).map(([k, v]) => `${k}：${v}`).join("\n")}`,
    `【需修正的问题】\n${ctx.problems.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
    `【对话】\n${transcript(input)}`,
    "请改写，输出 JSON。",
  ])
}

/** The lite route sends the perception context once and gets the reading and the drafts back together. */
export const liteUser = (input: AnalyzeInput, ctx: { citations: Citation[]; pack?: FactPack }) => perceiveUser(input, ctx).replace("请分析最后一条消费者消息，输出 JSON。", "请复核并起草，输出 JSON。")

/**
 * A rough token count for estimates when no provider is connected: one token per CJK character
 * or full-width mark, one per four other characters. Real usage is read from the API response.
 */
export function estTokens(s: string): number {
  let cjk = 0
  for (const ch of s) if (ch.charCodeAt(0) > 0x2e7f) cjk++
  return cjk + Math.ceil((s.length - cjk) / 4)
}
