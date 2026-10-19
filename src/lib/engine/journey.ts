import type { RiskCategory, RiskLevel } from "../types"
import { DEMO_NOW, TICKET_TYPE_CN, contactsOf, daysBetween, ordersOf, ticketsOf, type OrderRecord } from "../dataset"
import { emotionVector, summarizeEmotion } from "./heuristics"

/**
 * 忆 · service trajectory — fuses the three data sources (orders, after-sales tickets, past
 * contacts) for one customer into a single timeline, and derives the facts that only show up
 * across sources: this is the 3rd contact about the same parcel, a promised gift is 19 days
 * overdue, three refunds in 90 days.
 *
 * Thresholds are constants below and are shown in the UI next to every fact they produce.
 */
export const REPEAT_CONTACT_DAYS = 7
export const REPEAT_REFUND_DAYS = 90
export const REPEAT_REFUND_WARN = 3
export const ESCALATION_VALENCE = -0.4

export interface JourneyEvent {
  at: string
  kind: "order" | "ticket" | "contact"
  title: string
  detail: string
  tone: "neutral" | "good" | "warn" | "bad"
  ref: string
}

export type FactKey = "repeat_contact" | "repeat_refund" | "broken_promise" | "emotion_escalation" | "open_ticket"

export interface JourneyFact {
  key: FactKey
  level: RiskLevel
  category: RiskCategory
  label: string
  detail: string
  rule: string
  action: string
  /** the record the fact is about (ticket id, or the customer for whole-history facts) */
  ref: string
}

export interface Journey {
  customerId: string
  events: JourneyEvent[]
  facts: JourneyFact[]
  /** the order this conversation is most likely about: the newest one */
  currentOrder?: OrderRecord
  counts: { orders: number; tickets: number; contacts: number }
}

const dayLabel = (d: number) => (d < 1 ? "今天" : d < 2 ? "昨天" : `${Math.floor(d)} 天前`)

export function buildJourney(customerId: string, now: Date = DEMO_NOW): Journey {
  const orders = ordersOf(customerId)
  const tickets = ticketsOf(customerId)
  const contacts = contactsOf(customerId).sort((a, b) => a.at.localeCompare(b.at))

  const events: JourneyEvent[] = [
    ...orders.map((o): JourneyEvent => ({ at: o.paidAt, kind: "order", title: `下单 ${o.product}`, detail: `¥${o.price} · ${o.status}${o.signedAt ? ` · ${dayLabel(daysBetween(o.signedAt, now))}签收` : ""}`, tone: o.status === "已退款" ? "warn" : "neutral", ref: o.id })),
    ...tickets.map((t): JourneyEvent => {
      const overdue = t.dueAt && t.status !== "closed" && new Date(t.dueAt) < now
      return { at: t.createdAt, kind: "ticket", title: `${TICKET_TYPE_CN[t.type]}工单 · ${{ open: "待处理", processing: "处理中", closed: "已结案" }[t.status]}${overdue ? " · 已逾期" : ""}`, detail: t.summary, tone: overdue ? "bad" : t.status === "closed" ? "neutral" : "warn", ref: t.id }
    }),
    ...contacts.map((c): JourneyEvent => ({ at: c.at, kind: "contact", title: `进线 · ${c.topic}${c.resolved ? "" : " · 未解决"}`, detail: `“${c.lines[0]}”`, tone: c.resolved ? "good" : "warn", ref: c.id })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const facts: JourneyFact[] = []

  // 重复进线: earlier contacts inside the window that were left unresolved
  const recent = contacts.filter((c) => daysBetween(c.at, now) <= REPEAT_CONTACT_DAYS && !c.resolved)
  if (recent.length >= 1) {
    const nth = recent.length + 1
    facts.push({
      key: "repeat_contact",
      level: recent.length >= 2 ? 2 : 1,
      category: "service",
      label: `${REPEAT_CONTACT_DAYS} 天内第 ${nth} 次进线`,
      detail: `此前 ${recent.length} 次进线未解决：${recent.map((c) => `${dayLabel(daysBetween(c.at, now))}「${c.topic}」`).join("、")}`,
      rule: `${REPEAT_CONTACT_DAYS} 天内有未解决的进线记录`,
      action: "不要让对方再讲一遍：直接承接上次的问题，给出确定的进展",
      ref: customerId,
    })
  }

  // 重复退款: refund tickets inside the window
  const refunds = tickets.filter((t) => t.type === "refund" && daysBetween(t.createdAt, now) <= REPEAT_REFUND_DAYS)
  if (refunds.length >= 2) {
    const total = refunds.reduce((s, t) => s + (t.amount ?? 0), 0)
    facts.push({
      key: "repeat_refund",
      level: refunds.length >= REPEAT_REFUND_WARN ? 2 : 1,
      category: "fraud",
      label: `${REPEAT_REFUND_DAYS} 天内退款 ${refunds.length} 次`,
      detail: `合计 ¥${total.toLocaleString()}，占同期 ${orders.filter((o) => daysBetween(o.paidAt, now) <= REPEAT_REFUND_DAYS).length} 笔订单中的 ${refunds.length} 笔`,
      rule: `${REPEAT_REFUND_DAYS} 天内退款工单 ≥ 2`,
      action: "核对退款原因是否集中在同一产品或同一理由；按流程核验，不预设结论",
      ref: customerId,
    })
  }

  // 承诺逾期: something was promised in a ticket and the date has passed
  for (const t of tickets) {
    if (t.type === "promise" && t.status !== "closed" && t.dueAt && new Date(t.dueAt) < now) {
      facts.push({
        key: "broken_promise",
        level: 2,
        category: "service",
        label: `服务承诺逾期 ${Math.floor(daysBetween(t.dueAt, now))} 天`,
        detail: t.summary,
        rule: "承诺类工单超过约定日期仍未结案",
        action: "先为失约道歉并立即兑现，再谈别的",
        ref: t.id,
      })
    }
  }

  // 情绪升级: the consumer's tone has worsened contact after contact
  if (contacts.length >= 3) {
    const v = contacts.slice(-3).map((c) => summarizeEmotion(emotionVector(c.lines.join(" "))).valence)
    if (v[0] > v[1] && v[1] > v[2] && v[2] <= ESCALATION_VALENCE) {
      facts.push({
        key: "emotion_escalation",
        level: 2,
        category: "service",
        label: "连续三次进线情绪走低",
        detail: `情绪效价 ${v.map((x) => (x > 0 ? "+" : "") + x.toFixed(2)).join(" → ")}`,
        rule: `最近三次进线的情绪效价逐次下降，且最后一次 ≤ ${ESCALATION_VALENCE}`,
        action: "升级给组长，优先接待",
        ref: customerId,
      })
    }
  }

  const open = tickets.filter((t) => t.status !== "closed")
  if (open.length) {
    facts.push({ key: "open_ticket", level: 0, category: "service", label: `${open.length} 个未结工单`, detail: open.map((t) => `${TICKET_TYPE_CN[t.type]}（${t.id}）`).join("、"), ref: customerId, rule: "工单状态不是已结案", action: "回复前先看工单进展" })
  }

  // causes before symptoms: a broken promise explains the repeat contacts and the worsening tone
  const PRIORITY: FactKey[] = ["broken_promise", "repeat_contact", "emotion_escalation", "repeat_refund", "open_ticket"]
  facts.sort((a, b) => b.level - a.level || PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key))

  const currentOrder = [...orders].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]
  return { customerId, events, facts, currentOrder, counts: { orders: orders.length, tickets: tickets.length, contacts: contacts.length } }
}

/** One line for the 忆 trace: what the fused record says before the consumer has finished typing. */
export function journeyHeadline(j: Journey): string {
  const flagged = j.facts.filter((f) => f.level >= 1).map((f) => f.label)
  const base = `${j.counts.orders} 笔订单 · ${j.counts.tickets} 张工单 · ${j.counts.contacts} 次进线`
  return flagged.length ? `${flagged.join("；")}（${base}）` : base
}
