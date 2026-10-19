import type { RiskCategory, RiskLevel } from "./types"

/**
 * A risk event as the board keeps it: one problem (an order's safety, a batch, a broken promise),
 * its evidence, its status and its history. Signals in a conversation point at events through
 * `eventKey`. An event closed on the board reopens when new evidence arrives; an event a person has
 * marked invalid (with a reason and the evidence for it) is kept out of later analysis.
 */
export type EventStatus = "open" | "processing" | "closed" | "invalid"

export const EVENT_STATUS_CN: Record<EventStatus, string> = { open: "待处理", processing: "处理中", closed: "已闭环", invalid: "已纠正（无效）" }

export interface StoredRiskEvent {
  id: string
  customerId: string
  eventKey: string
  category: RiskCategory
  level: RiskLevel
  title: string
  status: EventStatus
  /** demo-clock times */
  firstSeen: string
  lastSeen: string
  /** demo-clock deadline for handling, from the event's alert type */
  dueAt?: string
  evidence: string[]
  invalidReason?: string
  invalidBy?: string
  /** bumps whenever new evidence is added — a roundtable held on an older version is flagged for review */
  version: number
}
