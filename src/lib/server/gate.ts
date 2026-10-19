import { createHash } from "node:crypto"
import { checkCompliance } from "../engine/audit"
import { checkClaims, type Claim } from "../engine/claims"
import { claimIssues } from "../engine/pipeline"
import { buildFactPack, brokenPromises } from "../engine/facts"
import { PRODUCT_MAP } from "../data"
import { chatJSON, llmEnabled } from "./llm"
import { AUDIT_PROMPT } from "../engine/prompts"
import { getReview, listTasks, logSend, now, saveReview } from "./db"
import { STAFF_MAP } from "../staff"
import { canApprove } from "../policy"

const logReview = (customerId: string, actor: string, text: string) => logSend(customerId, actor, `高风险回复人工过目后发送：“${text.slice(0, 40)}${text.length > 40 ? "…" : ""}”`)
import type { ComplianceIssue, ModelCall } from "../types"

/**
 * 检 · the send gate, on the server. A reply is checked when the agent presses send — the exact
 * text, bound to its hash — not the draft that was checked a minute ago. Three layers:
 *   1. rules: the red-line patterns (医学诊断、医疗宣称、绝对化、推卸、指责、以利换评)
 *   2. facts and policy: every order, amount, time, “已安排” and policy phrase must be supported by
 *      the consumer's record, an approved/submitted task or a clause that applies (claims.ts)
 *   3. meaning: when a model is configured, it reads the reply for what patterns cannot catch;
 *      for high-risk conversations this layer is required, and its absence is a stated status,
 *      not a silent pass
 * The verdict says which layers ran. Editing the text gives it a new hash, so a stale verdict can
 * never be used for a different text.
 */
export type GateStatus = "pass" | "blocked" | "needs_human"

export interface GateVerdict {
  hash: string
  status: GateStatus
  /** a short line for the send button's area */
  summary: string
  layers: { rules: "pass" | "blocked"; facts: "pass" | "blocked" | "warn"; semantic: "pass" | "blocked" | "skipped" | "failed" }
  issues: ComplianceIssue[]
  claims: Claim[]
  semanticNotes?: { phrase: string; reason: string }[]
  call?: ModelCall
  checkedAt: string
}

export const textHash = (customerId: string, text: string) => createHash("sha256").update(`${customerId}\n${text}`).digest("hex").slice(0, 16)

export interface GateInput {
  customerId: string
  text: string
  productId?: string
  /** risk level of the conversation as last analysed */
  level: number
  situation?: { safety: boolean; logistics: boolean; refund: boolean }
  /** a team lead (or above) who has read this exact text — the human path when the semantic layer is missing */
  reviewedBy?: string
}

/** Conversations at L3 and above may not send a reply that no model and no person has read for meaning. */
export const NEEDS_SEMANTIC_LEVEL = 3

export async function reviewReply(input: GateInput): Promise<GateVerdict> {
  const hash = textHash(input.customerId, input.text)
  const pack = buildFactPack(input.customerId, now(), listTasks(input.customerId))
  const situation = { safety: false, logistics: false, refund: false, ...input.situation, promise: brokenPromises(pack).length > 0 || pack.commitments.length > 0 }
  const product = input.productId ? PRODUCT_MAP[input.productId] : undefined

  const ruleIssues = checkCompliance(input.text, { product })
  const claims = checkClaims(input.text, { pack, level: input.level, situation })
  const factIssues = claimIssues(claims)
  const issues = [...ruleIssues, ...factIssues].sort((a, b) => a.index - b.index)
  const rules = ruleIssues.some((i) => i.severity === "block") ? "blocked" : "pass"
  const facts = factIssues.some((i) => i.severity === "block") ? "blocked" : factIssues.length ? "warn" : "pass"

  let semantic: GateVerdict["layers"]["semantic"] = "skipped"
  let semanticNotes: GateVerdict["semanticNotes"]
  let call: ModelCall | undefined
  if (llmEnabled() && rules === "pass" && facts !== "blocked") {
    const r = await chatJSON<{ issues?: { phrase: string; severity?: string; reason: string }[] }>(
      [
        { role: "system", content: AUDIT_PROMPT },
        { role: "user", content: `坐席准备发送的回复：\n${input.text}\n\n请输出 JSON。` },
      ],
      { model: "fast", temperature: 0, maxTokens: 600, name: "检 · 发送前语义审查", agents: ["auditor"] },
    )
    call = r.call
    if (!r.data) semantic = "failed"
    else {
      const found = (r.data.issues ?? []).filter((i) => i?.phrase && i?.reason)
      semanticNotes = found.map((i) => ({ phrase: String(i.phrase).slice(0, 40), reason: String(i.reason).slice(0, 80) }))
      semantic = found.some((i) => i.severity !== "warn") ? "blocked" : "pass"
    }
  }

  const highRisk = input.level >= NEEDS_SEMANTIC_LEVEL
  const reviewer = input.reviewedBy ? STAFF_MAP[input.reviewedBy] : undefined
  const humanOk = Boolean(reviewer && canApprove(reviewer.rank, "组长"))
  const blocked = rules === "blocked" || facts === "blocked" || semantic === "blocked"
  const status: GateStatus = blocked ? "blocked" : highRisk && (semantic === "skipped" || semantic === "failed") && !humanOk ? "needs_human" : "pass"
  if (!blocked && highRisk && humanOk && semantic !== "pass") logReview(input.customerId, reviewer!.name, input.text)
  const summary =
    status === "blocked"
      ? `已拦截：${[rules === "blocked" && "命中红线", facts === "blocked" && "有无依据的说法", semantic === "blocked" && "语义审查发现问题"].filter(Boolean).join("、")}`
      : status === "needs_human"
        ? `${semantic === "failed" ? "语义审查调用失败" : "未配置语义审查"}；L${input.level} 会话的回复需组长或以上过目后发送${input.reviewedBy && !humanOk ? `（${reviewer?.name ?? "当前操作人"}没有这个权限）` : ""}`
        : humanOk && highRisk && semantic !== "pass"
          ? `规则与事实核对未发现问题；${reviewer!.name}已过目`
          : semantic === "pass"
          ? "规则、事实核对与语义审查均未发现问题"
          : "规则与事实核对未发现问题"

  const verdict: GateVerdict = { hash, status, summary, layers: { rules, facts, semantic }, issues, claims, semanticNotes, call, checkedAt: new Date().toISOString() }
  saveReview(hash, input.customerId, verdict)
  return verdict
}

/** A verdict is valid only for the exact text it was made for. */
export const verdictFor = (customerId: string, text: string) => getReview<GateVerdict>(textHash(customerId, text))
