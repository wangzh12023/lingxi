import type { NextBestAction } from "./types"
import type { Role } from "./policy"

/**
 * A promise to a consumer, as a piece of work. The lifecycle the review asked for:
 *
 *   proposed ─┬─▶ pending_approval ──approve──▶ approved ──submit──▶ submitted ──result──▶ executed ──verify ok──▶ closed
 *             │                     └─reject──▶ rejected (never executed)      │  └──fail──▶ submit_failed ─retry─┘
 *             └─(no approval needed)──────────▶ approved                       └──verify not ok──▶ reopened ─submit─▶ …
 *
 * Only a task that has been submitted to the ticket system and came back with a ticket id may be
 * presented to the consumer as arranged ("已为您安排"). A proposal, or an approval whose submission
 * failed, is not a promise yet. Every transition is logged with who, when (wall clock and demo
 * clock) and an idempotency key, so a double click does nothing twice.
 */
export type TaskStatus = "pending_approval" | "approved" | "rejected" | "submit_failed" | "submitted" | "executed" | "reopened" | "closed" | "cancelled"

export const TASK_STATUS_CN: Record<TaskStatus, string> = {
  pending_approval: "待审批",
  approved: "已批准，待提交",
  rejected: "已驳回",
  submit_failed: "提交失败，可重试",
  submitted: "已提交工单",
  executed: "已执行，待回访",
  reopened: "已重新打开",
  closed: "已闭环",
  cancelled: "已撤销",
}

export type TaskAction = "approve" | "reject" | "submit" | "record_result" | "verify" | "reopen" | "cancel"

export const TASK_ACTION_CN: Record<TaskAction, string> = { approve: "批准", reject: "驳回", submit: "提交工单", record_result: "登记执行结果", verify: "回访确认", reopen: "重新打开", cancel: "撤销" }

export interface Task {
  id: string
  customerId: string
  /** the conversation the proposal came from */
  sessionId?: string
  kind: NextBestAction["kind"]
  title: string
  detail: string
  cost?: number
  /** decided by policy.ts when the task was proposed */
  approver?: Role
  policyBasis: string
  status: TaskStatus
  /** what may be told to the consumer once the task is submitted, e.g. “今天 18:00 前加急补寄” */
  commitment?: string
  /** demo-clock deadline for the commitment; the follow-up is due then */
  dueAt?: string
  /** the earlier commitment (ticket id) this task makes good */
  resolves?: string
  ticketId?: string
  proposedBy: string
  proposedAt: string
  decidedBy?: string
  decidedAt?: string
  note?: string
  attempts: number
  lastError?: string
  result?: string
  updatedAt: string
}

export interface TaskLogEntry {
  id: number
  taskId?: string
  eventId?: string
  customerId: string
  action: string
  actor: string
  /** wall-clock time of the click */
  at: string
  /** demo-clock time the action is booked at */
  demoAt: string
  note?: string
  idemKey?: string
}

/** May the consumer be told this is arranged? Only once a ticket exists. */
export const isCommitted = (t: Pick<Task, "status" | "ticketId">) => (t.status === "submitted" || t.status === "executed") && Boolean(t.ticketId)

/** Still owed to the consumer: approved or submitted, not yet verified closed. */
export const isOpenCommitment = (t: Pick<Task, "status">) => ["approved", "submit_failed", "submitted", "executed", "reopened"].includes(t.status)

/** Past its deadline while still owed. A submitted task past due is a broken promise; the board raises it. */
export const isTaskOverdue = (t: Pick<Task, "status" | "dueAt">, now: Date) => Boolean(t.dueAt) && ["approved", "submit_failed", "submitted", "reopened"].includes(t.status) && new Date(t.dueAt!).getTime() < now.getTime()

/**
 * The legal moves. Returns the next status, or the reason the move is not allowed. Approval rights
 * are checked by the caller against the actor's rank; this only knows the order of things.
 */
export function nextStatus(t: Pick<Task, "status" | "approver">, action: TaskAction): { status: TaskStatus } | { error: string } {
  const s = t.status
  switch (action) {
    case "approve":
      return s === "pending_approval" ? { status: "approved" } : { error: `“${TASK_STATUS_CN[s]}”的任务不能批准` }
    case "reject":
      return s === "pending_approval" ? { status: "rejected" } : { error: `“${TASK_STATUS_CN[s]}”的任务不能驳回` }
    case "submit":
      // the outcome (submitted / submit_failed) is decided by the ticket system's answer
      return ["approved", "submit_failed", "reopened"].includes(s) ? { status: "submitted" } : { error: s === "pending_approval" ? "还没有批准，不能提交工单" : `“${TASK_STATUS_CN[s]}”的任务不能提交` }
    case "record_result":
      return s === "submitted" ? { status: "executed" } : { error: "只有已提交工单的任务才能登记执行结果" }
    case "verify":
      return s === "executed" ? { status: "closed" } : { error: "执行之后才能回访确认" }
    case "reopen":
      return ["executed", "closed"].includes(s) ? { status: "reopened" } : { error: `“${TASK_STATUS_CN[s]}”的任务不能重新打开` }
    case "cancel":
      return ["pending_approval", "approved", "submit_failed", "reopened"].includes(s) ? { status: "cancelled" } : { error: "已提交工单的任务不能直接撤销，请登记执行结果或回访" }
  }
}
