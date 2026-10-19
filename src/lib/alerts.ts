import type { RiskLevel } from "./types"
import { ALL_CUSTOMERS, CONTACTS, DEMO_NOW, TICKETS, daysBetween, type CustomerLite, type TicketType } from "./dataset"
import { buildJourney } from "./engine/journey"
import { detectRisk, emotionVector, summarizeEmotion } from "./engine/heuristics"
import { BATCHES, fmtP } from "./insights"
import { addHours, hoursBetween, isoLocal } from "./clock"

/**
 * 风险预警跟踪看板 — the alerts. Nothing here is typed in: every alert is found by running the
 * same rules the console uses over the whole service dataset (chat corpus + orders + tickets).
 * The first four types are the ones the contest brief names; the rest are ours.
 */
export type AlertType = "pr" | "repeat_contact" | "emotion" | "repeat_refund" | "promise" | "adverse" | "batch" | "live"
export type AlertStatus = "open" | "processing" | "closed" | "invalid"
export type DataSource = "聊天" | "订单" | "工单" | "批次"

export const ALERT_TYPES: Record<AlertType, { cn: string; owner: string; slaHours: number; desc: string }> = {
  pr: { cn: "舆情投诉", owner: "品牌公关部", slaHours: 4, desc: "消费者提到已经或将要公开发布、向平台或监管投诉" },
  repeat_contact: { cn: "重复进线", owner: "客服运营", slaHours: 12, desc: "7 天内第 3 次及以上进线，此前均未解决" },
  emotion: { cn: "情绪升级", owner: "客服运营", slaHours: 12, desc: "最近三次进线情绪逐次走低" },
  repeat_refund: { cn: "重复退款", owner: "风控中心", slaHours: 48, desc: "90 天内退款 3 次及以上" },
  promise: { cn: "承诺逾期", owner: "客服运营", slaHours: 24, desc: "承诺类工单超过约定日期仍未结案" },
  adverse: { cn: "不良反应", owner: "质量法规部", slaHours: 24, desc: "消费者描述使用后皮肤不适" },
  batch: { cn: "批次异常", owner: "质量法规部", slaHours: 2, desc: "同批次 72 小时反馈显著高于平日水平" },
  live: { cn: "高危会话", owner: "值班主管", slaHours: 2, desc: "接待工作台中识别到 L3 及以上风险的会话，自动进入看板" },
}

/** Display order: the brief's four first. */
export const ALERT_ORDER: AlertType[] = ["pr", "repeat_contact", "emotion", "repeat_refund", "promise", "adverse", "batch", "live"]

export const STATUS_CN: Record<AlertStatus, string> = { open: "待处理", processing: "处理中", closed: "已闭环", invalid: "已纠正" }

/** Closed and corrected alerts no longer have a deadline. */
export const isDone = (s: AlertStatus) => s === "closed" || s === "invalid"

export interface Alert {
  id: string
  type: AlertType
  level: RiskLevel
  customer?: CustomerLite
  title: string
  evidence: string
  rule: string
  /** when the triggering record was created */
  at: string
  /** at + the type's handling time. Every alert keeps its own deadline, also inside a case. */
  dueAt: string
  sources: DataSource[]
  /** status implied by the data (ticket states); what agents do on the board is layered on top */
  status: AlertStatus
  /** raised by a live conversation in the console rather than found in the dataset */
  live?: boolean
  /** the risk event this alert is about — the same key the console's signals use */
  eventKey: string
  /** the task, when the alert is a task past its deadline */
  taskId?: string
}

const TICKET_FOR: Partial<Record<AlertType, TicketType[]>> = { pr: ["complaint"], repeat_contact: ["logistics", "complaint"], repeat_refund: ["refund"], promise: ["promise"], adverse: ["adverse"] }

/** A related ticket in progress means someone is on it; all related tickets closed means the loop is closed. */
function statusFromTickets(customerId: string, type: AlertType): AlertStatus {
  const kinds = TICKET_FOR[type]
  if (!kinds) return "open"
  const related = TICKETS.filter((t) => t.customerId === customerId && kinds.includes(t.type))
  if (!related.length) return "open"
  if (related.some((t) => t.status === "processing")) return "processing"
  return related.every((t) => t.status === "closed") ? "closed" : "open"
}

export function detectAlerts(now: Date = DEMO_NOW): Alert[] {
  const out: Alert[] = []

  for (const c of ALL_CUSTOMERS) {
    const j = buildJourney(c.id, now)
    const contacts = CONTACTS.filter((x) => x.customerId === c.id).sort((a, b) => a.at.localeCompare(b.at))
    const lastContact = contacts.at(-1)
    const add = (type: AlertType, level: RiskLevel, title: string, evidence: string, rule: string, at: string, sources: DataSource[], eventKey: string) =>
      out.push(withDue({ id: `${type}-${c.id}`, type, level, customer: c, title, evidence, rule, at, sources, status: statusFromTickets(c.id, type), eventKey }))

    for (const f of j.facts) {
      const key = `${f.category}:${f.key}:${f.ref}`
      if (f.key === "repeat_contact" && f.level >= 2) add("repeat_contact", f.level, f.label, f.detail, f.rule, lastContact?.at ?? now.toISOString(), ["聊天", "订单"], key)
      if (f.key === "repeat_refund" && f.level >= 2) add("repeat_refund", f.level, f.label, f.detail, f.rule, TICKETS.filter((t) => t.customerId === c.id && t.type === "refund").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt, ["工单", "订单"], key)
      if (f.key === "broken_promise") add("promise", f.level, f.label, f.detail, f.rule, TICKETS.find((t) => t.id === f.ref)?.dueAt ?? TICKETS.find((t) => t.customerId === c.id && t.type === "promise")!.dueAt!, ["工单"], key)
      if (f.key === "emotion_escalation") add("emotion", f.level, f.label, f.detail, f.rule, lastContact!.at, ["聊天"], key)
    }

    // what the consumer wrote in the last 7 days, read by the same rules as the console
    for (const ct of contacts.filter((x) => daysBetween(x.at, now) <= 7)) {
      const text = ct.lines.join(" ")
      const valence = summarizeEmotion(emotionVector(text)).valence
      const signals = detectRisk(text, { valence, batchCodes: [] })
      const pr = signals.filter((s) => s.category === "pr" || s.category === "legal").sort((a, b) => b.level - a.level)[0]
      if (pr && !out.some((a) => a.id === `pr-${c.id}`)) add("pr", pr.level, pr.title, `“${ct.lines[0]}”`, pr.rule ?? "舆情分级", ct.at, ["聊天"], `${pr.category}:${c.id}`)
      const safety = signals.find((s) => s.category === "safety")
      if (safety && !out.some((a) => a.id === `adverse-${c.id}`)) add("adverse", safety.level, safety.title, `“${ct.lines[0]}”`, safety.rule ?? "疑似不良反应接待规范", ct.at, ["聊天", "工单"], `safety:${ct.orderId ?? c.id}`)
    }
  }

  for (const b of BATCHES) {
    if (b.status === "normal") continue
    out.push(withDue({
      id: `batch-${b.batch}`,
      type: "batch",
      level: b.status === "anomaly" ? 4 : 2,
      title: `批次 ${b.batch} 反馈${b.status === "anomaly" ? "异常集中" : "偏高"}`,
      evidence: `${b.product}：近 72 小时同类反馈 ${b.complaints72h} 起，平日约 ${b.baseline} 起（${b.ratio} 倍，${fmtP(b.pValue)}）`,
      rule: `泊松检验 ${b.status === "anomaly" ? "p < 0.001" : "p < 0.05"}`,
      at: new Date(now.getTime() - (b.status === "anomaly" ? 22 : 30) * 3600000).toISOString().slice(0, 16),
      sources: ["批次", "聊天"],
      status: b.status === "anomaly" ? "processing" : "open",
      eventKey: `safety:batch:${b.batch}`,
    }))
  }

  return out.sort((a, b) => b.level - a.level || b.at.localeCompare(a.at))
}

/** Give an alert its own deadline: trigger time plus the handling time of its type. */
export const withDue = (a: Omit<Alert, "dueAt">): Alert => ({ ...a, dueAt: isoLocal(addHours(a.at, ALERT_TYPES[a.type].slaHours)) })

export const ageHours = (a: { at: string }, now: Date = DEMO_NOW) => Math.max(0, hoursBetween(a.at, now))

/** Past its own deadline and not closed. */
export const isOverdue = (a: Alert, status: AlertStatus, now: Date = DEMO_NOW) => !isDone(status) && new Date(dueOf(a)).getTime() < now.getTime()

/**
 * One case per consumer. A person who has contacted four times and whose tone is worsening is one
 * piece of work, not two rows to close separately — but every alert inside keeps its own trigger
 * time, deadline and status. The case's deadline is the earliest deadline among the alerts that are
 * still open; a closed alert no longer counts, and an alert that arrives later brings its own.
 * Batch alerts have no consumer and stand alone.
 */
export interface AlertCase {
  id: string
  alerts: Alert[]
  types: AlertType[]
  level: RiskLevel
  customer?: CustomerLite
  /** the earliest trigger among the case's alerts — how long this person has been waiting */
  firstAt: string
  status: AlertStatus
  sources: DataSource[]
  owners: string[]
  live: boolean
}

/**
 * How the board knows each alert's status: from the data by default, from the tracking log when
 * there is one. A plain status may also be passed — a whole case marked closed has nothing open.
 */
export type StatusOf = ((a: Alert) => AlertStatus) | AlertStatus
const dataStatus: StatusOf = (a) => a.status
const resolve = (s: StatusOf) => (typeof s === "function" ? s : (a: Alert) => (isDone(s) ? s : a.status))

/** An alert's own deadline (alerts built by hand may not carry one yet). */
export const dueOf = (a: Omit<Alert, "dueAt"> & { dueAt?: string }) => a.dueAt ?? isoLocal(addHours(a.at, ALERT_TYPES[a.type].slaHours))

export function toCases(alerts: Alert[], statusOf: StatusOf = dataStatus): AlertCase[] {
  const groups = new Map<string, Alert[]>()
  for (const a of alerts) {
    const key = a.customer ? `case-${a.customer.id}` : a.id
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()]
    .map(([id, list]): AlertCase => {
      const sorted = [...list].sort((a, b) => b.level - a.level || ALERT_ORDER.indexOf(a.type) - ALERT_ORDER.indexOf(b.type))
      const st = sorted.map(resolve(statusOf))
      const status: AlertStatus = st.includes("open") ? "open" : st.includes("processing") ? "processing" : st.every((x) => x === "invalid") ? "invalid" : "closed"
      return {
        id,
        alerts: sorted,
        types: [...new Set(sorted.map((a) => a.type))],
        level: sorted[0].level,
        customer: sorted[0].customer,
        firstAt: sorted.map((a) => a.at).sort()[0],
        status,
        sources: [...new Set(sorted.flatMap((a) => a.sources))],
        owners: [...new Set(sorted.map((a) => ALERT_TYPES[a.type].owner))],
        live: sorted.some((a) => a.live),
      }
    })
    // highest level first; among equals, what the console has just raised, then the longest waiting
    .sort((a, b) => b.level - a.level || Number(b.live) - Number(a.live) || a.firstAt.localeCompare(b.firstAt))
}

/** The alerts of a case that are still open, earliest deadline first. */
export const openAlerts = (c: AlertCase, statusOf: StatusOf = dataStatus) =>
  c.alerts
    .filter((a) => !isDone(resolve(statusOf)(a)))
    .map((a) => ({ ...a, dueAt: dueOf(a) }))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

/** The case's deadline: the earliest deadline among its open alerts; none once everything is closed. */
export const caseDueAt = (c: AlertCase, statusOf: StatusOf = dataStatus) => openAlerts(c, statusOf)[0]?.dueAt

/** Which open alerts are past their own deadline — the board names them, not just the case. */
export const overdueAlerts = (c: AlertCase, statusOf: StatusOf = dataStatus, now: Date = DEMO_NOW) => openAlerts(c, statusOf).filter((a) => new Date(a.dueAt).getTime() < now.getTime())

export const caseOverdue = (c: AlertCase, statusOf: StatusOf = dataStatus, now: Date = DEMO_NOW) => overdueAlerts(c, statusOf, now).length > 0
