import { DEMO_NOW, TICKET_TYPE_CN, contactsOf, daysBetween, ordersOf, ticketsOf, type OrderRecord } from "../dataset"
import { fmtDemo, hoursBetween } from "../clock"
import { isCommitted, isOpenCommitment, type Task } from "../tasks"

/**
 * 忆 · the fact pack. Everything the system knows about this consumer's case, in short numbered
 * lines a model can cite and a checker can verify: orders, tickets, every promise we made and
 * whether we kept it, what the consumer already handed over, and what we still owe.
 *
 * It is built on the server from the customer id — a client cannot add facts — and it is the same
 * object for the rule drafts, the model prompts, the send-time check and the evaluation.
 */
export interface Fact {
  /** F1, F2 … — stable within one pack, cited by drafts and checks */
  id: string
  source: "订单" | "工单" | "进线" | "任务"
  /** the source record id */
  ref: string
  at?: string
  text: string
}

export interface Commitment {
  /** the ticket or task the promise lives in */
  ref: string
  text: string
  madeAt: string
  dueAt: string
  /** each time it was (re)stated */
  history: { at: string; by: string; text: string; dueAt: string }[]
  /** the order the promise is about */
  orderId?: string
  status: "pending" | "overdue" | "kept"
  overdueHours: number
  source: "工单" | "任务"
  ticketId?: string
  /** the task that is making good on this promise, if one exists */
  remedy?: Pick<Task, "id" | "status" | "ticketId" | "commitment" | "dueAt">
}

export interface KnownItem {
  label: string
  value: string
  ref: string
  /** when it was given, for items the consumer handed over */
  at?: string
}

export interface FactPack {
  customerId: string
  now: string
  facts: Fact[]
  commitments: Commitment[]
  /** what we still owe, one line each */
  unresolved: { text: string; ref: string }[]
  /** what the consumer has already told or given us — do not ask again */
  known: KnownItem[]
  currentOrder?: Pick<OrderRecord, "id" | "product" | "price" | "status" | "batch" | "sku">
  /** every order, newest first — the conversation may be about any of them */
  orders: Pick<OrderRecord, "id" | "product" | "price" | "status" | "batch" | "sku" | "paidAt">[]
  /** live tasks from the store (empty when there is none, e.g. in an offline evaluation) */
  tasks: Task[]
  /** every order id that belongs to this consumer — a reply may name only these */
  orderIds: string[]
  /** amounts a reply may state without an approved task: order prices */
  amounts: number[]
}

const md = (at: string) => {
  const d = new Date(at)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function buildFactPack(customerId: string, now: Date = DEMO_NOW, tasks: Task[] = []): FactPack {
  const orders = [...ordersOf(customerId)].sort((a, b) => b.paidAt.localeCompare(a.paidAt))
  const tickets = ticketsOf(customerId)
  const contacts = [...contactsOf(customerId)].sort((a, b) => b.at.localeCompare(a.at))
  const facts: Fact[] = []
  const add = (f: Omit<Fact, "id">) => {
    const id = `F${facts.length + 1}`
    facts.push({ ...f, id })
    return id
  }

  const currentOrder = orders[0]
  for (const o of orders.slice(0, 3)) {
    add({ source: "订单", ref: o.id, at: o.paidAt, text: `订单 ${o.id}：${o.product}，¥${o.price}，${o.status}${o.signedAt ? `（${md(o.signedAt)} 签收）` : ""}${o.batch ? `，出库批次 ${o.batch}` : ""}` })
  }

  // promises: the ticket's own record, every restatement, and whether a live task is making good on it
  const commitments: Commitment[] = []
  for (const t of tickets.filter((x) => x.type === "promise" && x.dueAt)) {
    const history = t.promiseLog?.length ? t.promiseLog : [{ at: t.createdAt, by: "坐席", text: t.summary, dueAt: t.dueAt! }]
    const lastDue = history.at(-1)!.dueAt
    const remedyTask = tasks.find((k) => k.resolves === t.id && k.status !== "cancelled" && k.status !== "rejected")
    const kept = t.status === "closed" || remedyTask?.status === "closed"
    const overdueHours = Math.max(0, hoursBetween(t.dueAt!, now))
    commitments.push({
      ref: t.id,
      text: t.summary,
      madeAt: history[0].at,
      dueAt: t.dueAt!,
      history,
      orderId: t.orderId,
      status: kept ? "kept" : new Date(lastDue) < now ? "overdue" : "pending",
      overdueHours,
      source: "工单",
      ticketId: t.id,
      remedy: remedyTask && { id: remedyTask.id, status: remedyTask.status, ticketId: remedyTask.ticketId, commitment: remedyTask.commitment, dueAt: remedyTask.dueAt },
    })
    add({
      source: "工单",
      ref: t.id,
      at: t.createdAt,
      text: `承诺 ${t.id}（订单 ${t.orderId ?? "—"}）：${t.summary}${history.length > 1 ? `先后 ${history.length} 次答应：${history.map((h) => `${md(h.at)}「${h.text}」`).join("、")}` : ""}${kept ? "（已兑现）" : new Date(lastDue) < now ? `；最近一次答应的期限 ${fmtDemo(lastDue)} 也已过` : ""}`,
    })
  }
  // live tasks that are themselves commitments to the consumer
  for (const k of tasks.filter((x) => isOpenCommitment(x) && x.commitment && x.dueAt && !x.resolves)) {
    commitments.push({ ref: k.id, text: k.commitment!, madeAt: k.proposedAt, dueAt: k.dueAt!, history: [{ at: k.proposedAt, by: k.proposedBy, text: k.commitment!, dueAt: k.dueAt! }], status: new Date(k.dueAt!) < now ? "overdue" : "pending", overdueHours: Math.max(0, hoursBetween(k.dueAt!, now)), source: "任务", ticketId: k.ticketId })
  }
  for (const k of tasks.filter((x) => x.status !== "cancelled")) {
    add({ source: "任务", ref: k.id, at: k.proposedAt, text: `任务 ${k.id}「${k.title}」：${k.status === "pending_approval" ? `待${k.approver}审批` : k.status === "rejected" ? "已驳回" : isCommitted(k) ? `已提交工单 ${k.ticketId}${k.dueAt ? `，期限 ${fmtDemo(k.dueAt)}` : ""}` : k.status === "submit_failed" ? "工单提交失败，待重试" : k.status === "closed" ? "已回访确认，闭环" : k.status}${k.commitment ? `；可告知消费者：${k.commitment}` : ""}` })
  }

  for (const t of tickets.filter((x) => x.type !== "promise")) {
    add({ source: "工单", ref: t.id, at: t.createdAt, text: `${TICKET_TYPE_CN[t.type]}工单 ${t.id}：${t.summary}（${{ open: "待处理", processing: "处理中", closed: "已结案" }[t.status]}${t.amount ? `，¥${t.amount}` : ""}）` })
  }

  const known: KnownItem[] = []
  for (const c of contacts.filter((x) => daysBetween(x.at, now) <= 30).slice(0, 4)) {
    add({ source: "进线", ref: c.id, at: c.at, text: `${md(c.at)} 进线「${c.topic}」${c.resolved ? "已解决" : "未解决"}：“${c.lines.join(" ")}”${c.evidence?.length ? `；已提供 ${c.evidence.join("、")}` : ""}` })
    for (const e of c.evidence ?? []) known.push({ label: e.replace(/\s*\d+\s*张$/, ""), value: `${md(c.at)} 已提供（${c.id}）`, ref: c.id, at: c.at })
  }
  if (currentOrder) {
    known.unshift({ label: "订单号", value: currentOrder.id, ref: currentOrder.id }, { label: "商品", value: currentOrder.product, ref: currentOrder.id })
    if (currentOrder.batch) known.push({ label: "出库批次", value: currentOrder.batch, ref: currentOrder.id })
  }
  if (contacts.filter((c) => !c.resolved && daysBetween(c.at, now) <= 7).length >= 2) known.push({ label: "问题经过", value: "已在之前的进线里说过", ref: contacts[0].id })

  const unresolved: FactPack["unresolved"] = [
    ...commitments.filter((c) => c.status === "overdue").map((c) => ({ text: `${c.text}${c.history.length > 1 ? `（答应过 ${c.history.length} 次）` : ""}，已逾期 ${Math.floor(c.overdueHours / 24)} 天`, ref: c.ref })),
    ...tickets.filter((t) => t.type !== "promise" && t.status !== "closed").map((t) => ({ text: `${TICKET_TYPE_CN[t.type]}工单 ${t.id} 未结案`, ref: t.id })),
  ]

  return {
    customerId,
    now: now.toISOString(),
    facts,
    commitments,
    unresolved,
    known,
    currentOrder: currentOrder && { id: currentOrder.id, product: currentOrder.product, price: currentOrder.price, status: currentOrder.status, batch: currentOrder.batch, sku: currentOrder.sku },
    tasks,
    orders: orders.map((o) => ({ id: o.id, product: o.product, price: o.price, status: o.status, batch: o.batch, sku: o.sku, paidAt: o.paidAt })),
    orderIds: orders.map((o) => o.id),
    amounts: [...new Set(orders.map((o) => o.price))],
  }
}

/** The pack as prompt text: numbered facts, what is owed, what not to ask again. */
export function factDigest(p: FactPack): string {
  const lines = [
    ...p.facts.map((f) => `${f.id}［${f.source} ${f.ref}］${f.text}`),
    p.unresolved.length ? `尚未解决：${p.unresolved.map((u) => `${u.text}（${u.ref}）`).join("；")}` : "尚未解决：无",
    p.known.length ? `已知、不要再问：${p.known.map((k) => `${k.label}=${k.value}`).join("；")}` : "",
  ]
  return lines.filter(Boolean).join("\n")
}

/**
 * Which order this turn is about. Named in the text (order id, batch code, product) wins; then the
 * order of an overdue promise; then the only recent order. With several candidates and nothing to tell
 * them apart the answer is “ambiguous” — a reply must ask which one rather than guess.
 */
export function subjectOrder(p: FactPack, text: string, productSku?: string): { order?: FactPack["orders"][number]; ambiguous: boolean; by: string } {
  const byId = p.orders.find((o) => text.includes(o.id))
  if (byId) return { order: byId, ambiguous: false, by: "消息里的订单号" }
  const byBatch = p.orders.find((o) => o.batch && text.includes(o.batch))
  if (byBatch) return { order: byBatch, ambiguous: false, by: "消息里的批号" }
  if (productSku) {
    const same = p.orders.filter((o) => o.sku === productSku)
    if (same.length) return { order: same[0], ambiguous: false, by: "消息里提到的商品" }
  }
  const promise = brokenPromises(p)[0]
  const promised = promise?.orderId && p.orders.find((o) => o.id === promise.orderId)
  if (promised) return { order: promised, ambiguous: false, by: "逾期承诺所在的订单" }
  const recent = p.orders.filter((o) => (new Date(p.now).getTime() - new Date(o.paidAt).getTime()) / 86400000 <= 30)
  if (recent.length === 1) return { order: recent[0], ambiguous: false, by: "近 30 天唯一的订单" }
  if (p.orders.length === 1) return { order: p.orders[0], ambiguous: false, by: "唯一的订单" }
  return { order: undefined, ambiguous: p.orders.length > 1, by: p.orders.length > 1 ? "有多笔订单，无法确定" : "没有订单" }
}

/** Overdue promises, worst first — the thing a reply has to address before anything else. */
export const brokenPromises = (p: FactPack) => p.commitments.filter((c) => c.status === "overdue").sort((a, b) => b.overdueHours - a.overdueHours)
