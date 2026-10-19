import { ALERT_TYPES, detectAlerts, withDue, type Alert, type AlertStatus } from "../alerts"
import { ALL_CUSTOMERS } from "../dataset"
import { isoLocal } from "../clock"
import { isTaskOverdue } from "../tasks"
import { listEvents, listTasks, logFor, now } from "./db"
import type { StoredRiskEvent } from "../events"

/**
 * What the board shows, computed on the server from one clock and one store:
 *   · alerts the rules find in the service data
 *   · L3+ events raised by conversations in the console (高危会话)
 *   · tasks past their deadline (a promise we made and have not kept is itself an alert)
 * Each alert's status is the stored event's status when one exists, otherwise what the data implies.
 */
export function boardData() {
  const t = now()
  const events = listEvents()
  const byKey = new Map(events.map((e) => [`${e.customerId}|${e.eventKey}`, e]))
  const statusOf = (e?: StoredRiskEvent): AlertStatus | undefined => e?.status

  const base = detectAlerts(t)
  const keys = new Set(base.map((a) => `${a.customer?.id ?? "*"}|${a.eventKey}`))
  const customers = new Map(ALL_CUSTOMERS.map((c) => [c.id, c]))

  const live: Alert[] = events
    .filter((e) => e.level >= 3 && !keys.has(`${e.customerId}|${e.eventKey}`))
    .map((e) =>
      withDue({ id: `live-${e.id}`, type: "live", level: e.level, customer: customers.get(e.customerId), title: e.title, evidence: e.evidence.at(-1) ?? "", rule: "接待工作台识别到 L3 及以上的风险", at: e.firstSeen, sources: ["聊天"], status: e.status, live: true, eventKey: e.eventKey }),
    )

  const late: Alert[] = listTasks()
    .filter((k) => isTaskOverdue(k, t))
    .map((k) =>
      withDue({ id: `task-${k.id}`, type: "promise", level: 3, customer: customers.get(k.customerId), title: `补救承诺逾期：${k.title}`, evidence: `${k.ticketId ? `工单 ${k.ticketId}，` : ""}期限 ${k.dueAt?.replace("T", " ")}，状态“${k.status}”`, rule: "已批准的承诺超过期限仍未兑现", at: k.dueAt!, sources: ["工单"], status: "open", eventKey: `task:${k.id}`, taskId: k.id }),
    )

  const alerts = [...live, ...late, ...base].map((a) => {
    // a batch row (no consumer) and one consumer's event with the same key are different things:
    // "her bottle is not from this batch" does not make the batch anomaly go away
    const e = byKey.get(`${a.customer?.id ?? "*"}|${a.eventKey}`)
    return { ...a, status: statusOf(e) ?? a.status, eventId: e?.id }
  })

  // the tracking log of every event on the board, newest last
  const customerIds = [...new Set(alerts.map((a) => a.customer?.id).filter(Boolean))] as string[]
  const ids = new Set(alerts.map((a) => a.eventId).filter(Boolean))
  const log = [...customerIds, "*"].flatMap((id) => logFor(id, 200)).filter((l) => l.eventId && ids.has(l.eventId)).sort((a, b) => a.id - b.id)
  return { now: isoLocal(t), alerts, log, slaHours: Object.fromEntries(Object.entries(ALERT_TYPES).map(([k, v]) => [k, v.slaHours])) }
}
