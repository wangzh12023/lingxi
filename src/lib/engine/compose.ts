import type { DraftStyle, IntentKey, NextBestAction, UnspokenNeed } from "../types"
import type { FactPack, Commitment } from "./facts"
import { brokenPromises } from "./facts"
import { fmtDemo } from "../clock"
import { TASK_STATUS_CN, isCommitted, isTaskOverdue, type Task } from "../tasks"

/**
 * 笔 · 策 on the rule track, written from the fact pack. When the record shows a broken promise,
 * the reply and the plan are about that promise — named, dated, owned — instead of a generic opener.
 * What a draft may say depends on where the remedy task stands:
 *   no task yet       “我为您申请…，批准后告诉您工单号”   (asking, not promising)
 *   waiting approval  “申请已提交给组长…”
 *   submitted         “已为您提交（工单 MT-…），{commitment}”   (only now is it a promise)
 * The same rule holds for model drafts: the send-time check blocks “已安排” without a ticket.
 */

const md = (at: string) => {
  const d = new Date(at)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
const CN_NUM = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"]
const times = (n: number) => (n <= 10 ? CN_NUM[n] : String(n))

/** The task (if any) that is making good on this broken promise. */
export const remedyOf = (c: Commitment, tasks: Task[]) => tasks.find((t) => t.resolves === c.ref && t.status !== "cancelled" && t.status !== "rejected")

function knownLine(p: FactPack, style: DraftStyle, orderId?: string) {
  const photo = p.known.find((k) => /照片/.test(k.label))
  const order = (orderId && p.orders.find((o) => o.id === orderId)) || p.currentOrder
  if (!order) return ""
  if (style === "concise") return `订单${photo ? "和破损照片" : ""}都有记录，不用再提供。`
  if (style === "professional") return `您无需再提供订单号${photo ? "或照片" : ""}。`
  return `订单 ${order.id}${photo?.at ? ` 和您 ${md(photo.at)}发来的破损照片` : ""}我们这边都有记录，您不用再提供任何信息。`
}

/**
 * One line that owns up to a broken promise, for a turn that is about something else: the reply
 * answers what was asked and does not let the promise go unmentioned.
 */
export function promiseAside(p: FactPack): string | null {
  const c = brokenPromises(p)[0]
  if (!c) return null
  const task = remedyOf(c, p.tasks)
  const n = c.history.length
  return task && isCommitted(task)
    ? `另外，之前答应您的事已经提交工单 ${task.ticketId}，我会盯着。`
    : `另外，之前答应您的“${c.text.replace(/^[^：]*：/, "").replace(/[，。].*$/, "")}”${n > 1 ? `说了 ${n} 次都` : ""}还没做到，这是我们的问题，我同时在为您跟进。`
}

/** Drafts for a conversation where we owe the consumer a broken promise. */
export function draftsForBrokenPromise(name: string | undefined, p: FactPack, turnOrderId?: string): Record<DraftStyle, string> | null {
  const c = brokenPromises(p)[0]
  if (!c) return null
  // the consumer is asking about another order: answer that, and mention the promise in one line (promiseAside)
  if (turnOrderId && c.orderId && turnOrderId !== c.orderId) return null
  const n = c.history.length
  const dates = c.history.map((h) => md(h.at))
  const call = name ? `${name}，` : ""
  const task = remedyOf(c, p.tasks)
  const told = n > 1 ? `先后${times(n)}次跟您说“明天”` : `答应过您“${c.history[0].text}”`

  if (task && isCommitted(task) && isTaskOverdue(task, new Date(p.now))) {
    // the new promise has passed too: say so first, and do not offer another time
    return {
      warm: `${call}我必须先跟您说实话：工单 ${task.ticketId} 约定的期限（${task.dueAt ? fmtDemo(task.dueAt) : "约定时间"}）已经过了，我们又没有做到。我现在就把情况升级给主管，不再给您新的口头时间；处理结果出来，我第一时间主动告诉您。如果您不想再等，我也可以马上为您申请退款。`,
      professional: `${name ? `${name}您好` : "您好"}，工单 ${task.ticketId} 已超过约定期限，未能兑现，责任在我方。我现在升级主管处理，结果将主动告知；如需退款可即刻为您申请。`,
      concise: `${call}工单 ${task.ticketId} 又逾期了，是我们的问题。我现在升级主管，结果主动告诉您；也可以为您申请退款。`,
    }
  }
  if (task && isCommitted(task)) {
    const what = task.commitment ?? task.title
    return {
      warm: `${call}${task.title}已经为您提交（工单 ${task.ticketId}），${what}。这一次有工单可以查，不再只是一句“明天”；如果到时没有做到，系统会提醒我们主动联系您，不用您再来问。`,
      professional: `${name ? `${name}您好` : "您好"}，${task.title}已提交，工单号 ${task.ticketId}，${what}。如未按期完成，我们会主动联系您。`,
      concise: `${call}已为您提交（工单 ${task.ticketId}），${what}。`,
    }
  }
  if (task && task.status === "pending_approval") {
    return {
      warm: `${call}您说得对，${dates[0]}到现在，我们${told}，都没有做到，这是我们的问题。${knownLine(p, "warm", c.orderId)}“${task.title}”的申请已经提交给${task.approver}，批准后会生成工单，我第一时间把工单号告诉您。`,
      professional: `${name ? `${name}您好` : "您好"}。${knownLine(p, "professional", c.orderId)}“${task.title}”的申请已提交${task.approver}审批，批准后提供工单号。`,
      concise: `${call}申请已提交${task.approver}，批准后马上发您工单号。`,
    }
  }
  if (task) {
    // approved but not yet submitted, or the submission failed: still not something to promise
    return {
      warm: `${call}${task.title}已经批准，我正在提交工单，拿到工单号马上告诉您。${knownLine(p, "warm", c.orderId)}`,
      professional: `${name ? `${name}您好` : "您好"}，${task.title}已获批准，工单提交中，完成后告知工单号。`,
      concise: `${call}已获批准，正在提交工单，马上给您工单号。`,
    }
  }
  return {
    warm: `${call}您说得对。${dates[0]}到现在，我们${told}，一次都没有做到，这是我们的问题，我不再给您一个口头的“明天”了。${knownLine(p, "warm", c.orderId)}我现在就为您提交加急补寄的申请，批准后会生成工单，我把工单号直接发给您；如果您不想再等，我也可以为您申请退款，破损的那瓶不用寄回。`,
    professional: `${name ? `${name}您好` : "您好"}。核对记录：${dates[0]}反馈破损后我们承诺补寄，${n > 1 ? `并在 ${dates.slice(1).join("、")} 两次重申，` : ""}至今未发出，责任在我方。${knownLine(p, "professional", c.orderId)}下一步可以二选一：1）为您申请加急补寄，批准后提供工单号；2）为您申请退款，破损商品无需寄回。您倾向哪一种？`,
    concise: `${call}${n > 1 ? `${times(n)}次说“明天”` : "答应的事"}都没做到，是我们的问题。${knownLine(p, "concise", c.orderId)}我马上申请加急补寄，批准后直接发您工单号；不想等也可以为您申请退款。`,
  }
}

/** The plan for a broken promise: make good on it with something checkable, keep a fallback, find out why. */
export function actionsForBrokenPromise(p: FactPack): Omit<NextBestAction, "id">[] | null {
  const c = brokenPromises(p)[0]
  if (!c) return null
  const order = (c.orderId && p.orders.find((o) => o.id === c.orderId)) || p.currentOrder
  const acts: Omit<NextBestAction, "id">[] = []
  // the remedy itself has passed its deadline: escalating comes first
  const late = remedyOf(c, p.tasks)
  if (late && isCommitted(late) && isTaskOverdue(late, new Date(p.now))) {
    acts.push({ kind: "escalate", title: "升级主管：补救再次逾期", detail: `工单 ${late.ticketId} 超过期限仍未完成`, impact: "不再让消费者等第五次", resolves: c.ref, primary: true })
  }
  // proposed every turn, also once a task exists: the panel shows that task's live status and controls
  {
    acts.push({
      kind: "followup",
      title: "加急补寄并给出工单号",
      detail: "顺丰加急，运费由品牌承担；提交工单后才能告知消费者",
      cost: 23,
      impact: "用可查的凭证代替“明天”",
      commitment: "今天 18:00 前加急发出补寄的面霜，发出后提供快递单号",
      dueInHours: 8,
      resolves: c.ref,
      primary: !acts.length,
    })
  }
  if (order) acts.push({ kind: "verify", title: "备选：直接退款", detail: "消费者不愿再等时；破损商品无需寄回", cost: order.price, impact: "把选择交给消费者", resolves: c.ref })
  acts.push({ kind: "verify", title: "查明三次失约的原因", detail: "核对仓库排单与工单流转", impact: "避免再次失约" })
  return acts
}

/**
 * The 灵犀一念 as a hypothesis with its evidence, not a verdict about the consumer's motive:
 * “可能…；依据…；建议先…”.
 */
const pronoun = (name?: string) => (/女士|小姐/.test(name ?? "") ? "她" : /先生/.test(name ?? "") ? "他" : "对方")

export function whisperFromFacts(p: FactPack, name?: string): string | null {
  const c = brokenPromises(p)[0]
  if (!c) return null
  const n = c.history.length
  const days = c.history.map((h) => {
    const d = new Date(h.at)
    return `${d.getMonth() + 1}/${d.getDate()}`
  })
  return `${pronoun(name)}可能已经不相信“明天”这个词了。依据：${days.join("、")}${n > 1 ? ` ${times(n)}次` : ""}答应尽快补寄，都没有做到（${c.ref}）。建议：先承认失约，不再给口头时间，用工单号代替承诺。`
}

/** A one-line status of the remedy, for the plugin's first card. */
export function remedyStatus(c: Commitment, tasks: Task[]): string {
  const t = remedyOf(c, tasks)
  if (!t) return "还没有补救任务"
  if (isCommitted(t)) return `已提交工单 ${t.ticketId}${t.dueAt ? `，期限 ${fmtDemo(t.dueAt)}` : ""}`
  return TASK_STATUS_CN[t.status]
}

/** Rule-written hypothesis for the other cases: name the evidence instead of asserting a motive. */
export function hypothesis(unspoken: UnspokenNeed[], intent: IntentKey, hint: string, name?: string): string {
  const u = unspoken[0]
  if (!u || u.confidence < 0.6) return hint
  return `可能：${u.underlying}。依据：原话“${u.surface.slice(0, 18)}”。${hint}${intent === "adverse_reaction" ? `补偿诉求和健康顾虑可以同时存在，先确认${pronoun(name)}最担心的是什么。` : ""}`
}
