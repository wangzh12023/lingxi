// Regression checks for the defects found in the 2026-10-12 review, plus the edges around them.
// Run: npx tsx tests/judge.check.mts
import { ALERT_TYPES, caseDueAt, caseOverdue, overdueAlerts, toCases, withDue, type Alert, type AlertStatus } from "../src/lib/alerts"
import { finalizeActions } from "../src/lib/engine/heuristics"
import { policyFor, sanitizeAction } from "../src/lib/policy"
import { combineCalls } from "../src/lib/usage"
import type { ModelCall } from "../src/lib/types"

let fail = 0
const check = (ok: boolean, label: string, got?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || got === undefined ? "" : ` → ${JSON.stringify(got)}`}`)
  if (!ok) fail++
}

/* ── 1 · a case's deadline is the earliest deadline among its open alerts ── */
const now = new Date("2026-10-12T10:00:00+08:00")
const customer = { id: "judge-example", name: "测试消费者", tier: "新客" as const, channel: "tmall" as const }
const mk = (type: "repeat_refund" | "pr" | "repeat_contact", hoursAgo: number, status: AlertStatus = "open"): Alert =>
  withDue({ id: `x-${type}`, type, level: 2, customer, title: "构造样例", evidence: "—", rule: "—", at: new Date(now.getTime() - hoursAgo * 3600000).toISOString(), sources: ["聊天"], status })

{
  // the reviewer's example: refund 40 h ago (48 h SLA → 8 h left), PR 1 h ago (4 h SLA → 3 h left)
  const c = toCases([mk("repeat_refund", 40), mk("pr", 1)])[0]
  check(!caseOverdue(c, (a) => a.status, now), "40 小时前的退款预警 + 1 小时前的舆情预警：不算超时")
  check(caseDueAt(c, (a) => a.status) === mk("pr", 1).dueAt, "个案截止 = 未关闭预警中最早的截止（舆情，还剩 3 小时）", caseDueAt(c, (a) => a.status))
}
{
  // a PR alert 5 h old is overdue on its own deadline — and the board says which one
  const c = toCases([mk("repeat_refund", 40), mk("pr", 5)])[0]
  const late = overdueAlerts(c, (a) => a.status, now)
  check(caseOverdue(c, (a) => a.status, now) && late.length === 1 && late[0].type === "pr", "5 小时前的舆情预警超过 4 小时时限：个案超时，并指出是哪一条", late.map((a) => a.type))
}
{
  // a closed alert no longer counts toward the case deadline
  const c = toCases([mk("pr", 5, "closed"), mk("repeat_refund", 40)])[0]
  check(!caseOverdue(c, (a) => a.status, now), "已关闭的舆情预警不再参与截止时间")
  check(caseDueAt(c, (a) => a.status) === mk("repeat_refund", 40).dueAt, "剩下的是退款预警自己的截止时间")
}
{
  // a new alert joining an old case brings its own deadline instead of inheriting the case's age
  const c = toCases([mk("repeat_contact", 30, "closed"), mk("pr", 0.5)])[0]
  check(!caseOverdue(c, (a) => a.status, now), "老个案里新来的预警用它自己的时限（30 小时前的已闭环，新舆情才 0.5 小时）")
}
{
  // every alert type's deadline is trigger + its own SLA
  const a = mk("repeat_refund", 0)
  check(new Date(a.dueAt).getTime() - new Date(a.at).getTime() === ALERT_TYPES.repeat_refund.slaHours * 3600000, "每条预警的截止 = 触发时间 + 本类型时限")
}

/* ── 2 · approvers come from policy, never from the proposal ── */
{
  const [a] = finalizeActions([{ kind: "compensation", title: "测试补偿", detail: "—", impact: "—", cost: 1000, approver: "无需审批" }])
  check(a.approver === "跨部门会诊", "¥1000 补偿自带 approver=无需审批 → 仍由政策算出：跨部门会诊", a.approver)
}
{
  const [a] = finalizeActions([{ kind: "compensation", title: "测试补偿", detail: "—", impact: "—", cost: 120, approver: "一线坐席", approved: true, status: "已批准" }])
  check(a.approver === "组长" && !("approved" in a) && !("status" in a), "多余字段（approved、status）被丢弃；¥120 需组长", a)
}
check(policyFor({ kind: "compensation", title: "补偿", cost: undefined }).blocked !== undefined, "补偿没有金额 → 不能审批，需先核实")
check(policyFor({ kind: "compensation", title: "补偿", cost: Number.NaN }).blocked !== undefined, "金额无效（NaN）→ 需先核实")
check(sanitizeAction({ kind: "compensation", title: "补偿", cost: "八百" })?.cost !== undefined && Number.isNaN(sanitizeAction({ kind: "compensation", title: "补偿", cost: "八百" })!.cost), "金额写成文字 → 记为无效金额，而不是 0")
check(policyFor({ kind: "compensation", title: "补偿", cost: -50 }).blocked !== undefined, "负数金额 → 需先核实")
check(policyFor({ kind: "compensation", title: "补偿", cost: 30 }).approver === undefined, "¥30 在一线权限内")
check(policyFor({ kind: "compensation", title: "补偿", cost: 800 }).approver === "主管", "¥800 需主管")
check(policyFor({ kind: "escalate", title: "资深顾问挽回" }).approver === "组长", "调派人员需组长")
check(policyFor({ kind: "escalate", title: "发起跨部门会诊" }).approver === "主管", "召集会诊需主管")
check(policyFor({ kind: "report", title: "录入不良反应监测" }).approver === undefined, "不良反应登记无需审批")
check(sanitizeAction({ kind: "approve_all", title: "x" }) === null, "未知的行动类型被丢弃")

/* ── 3 · a retried model call adds up every count, not only the total ── */
{
  const first: ModelCall = { name: "x", agents: [], model: "m", ms: 900, tokens: 1200, promptTokens: 1000, completionTokens: 200, cachedTokens: 0, ok: false }
  const second: ModelCall = { name: "x", agents: [], model: "m", ms: 800, tokens: 1300, promptTokens: 1000, completionTokens: 300, cachedTokens: 512, ok: true }
  const c = combineCalls(first, second)
  check(c.tokens === 2500 && c.promptTokens === 2000 && c.completionTokens === 500 && c.cachedTokens === 512 && c.ms === 1700 && c.attempts === 2, "重试后：总量、输入、输出、缓存、耗时都按两次相加", c)
  check(c.tokens === c.promptTokens! + c.completionTokens!, "输入 + 输出 = 总量")
}

console.log(fail ? `\n${fail} FAILED` : "\njudge regressions: all pass")
process.exit(fail ? 1 : 0)
