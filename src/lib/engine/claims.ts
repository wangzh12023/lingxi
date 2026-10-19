import type { FactPack } from "./facts"
import { PRODUCTS } from "../data"
import { isCommitted } from "../tasks"

/**
 * 检 · the claims in a reply, and what supports each one. A reply that names an order, an amount, a
 * time or says something "has been arranged" is making a factual claim or a promise; each must be
 * backed by the fact pack, by a task that has actually been submitted, or by a policy clause whose
 * conditions hold. Having citations does not mean every sentence is supported — this checks the
 * sentences.
 */
export type ClaimKind = "order" | "ticket" | "amount" | "arranged" | "timing" | "compensation" | "policy" | "reask"

export interface Claim {
  kind: ClaimKind
  text: string
  index: number
  supported: boolean
  /** the fact, task or clause that supports it */
  by?: string
  issue?: string
  severity: "block" | "warn" | "ok"
}

export interface ClaimContext {
  pack?: FactPack
  /** risk level of the conversation: unsupported time promises are blocked at L2 and above */
  level: number
  /** the situation the reply is for — decides whether a policy clause applies */
  situation: { safety: boolean; logistics: boolean; refund: boolean; promise: boolean }
}

const ORDER_ID = /(?:TM|DY|JD|WX|XHS)\d{8}-\d{4}|G\d{6}/g
const TICKET_ID = /T-\d{4}-\d{4}|T-G\d{3}|MT-\d{8}-\d{4}/g
const AMOUNT = /(?:¥|￥)\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:元|块钱?)(?!以内)/g
/** said as done: 已为您提交 / 已经安排 / 已补寄 … (not 已记录、已收到 — those are acknowledgements) */
const ARRANGED = /已(?:经)?(?:为您|帮您|给您)?(?:安排|提交|申请好|办好|补寄|寄出|发出|发货|退款|退回|改派|加急|处理好|登记好)|已为您|已经为您|已帮您|已经帮您/g
/** a specific time attached to doing something for the consumer */
const TIMING = /(?:今天|今晚|明天|明早|后天|\d+\s*(?:小时|天|个工作日)内|\d{1,2}[:：]\d{2}\s*(?:前|之前|以前)?|(\d+)\s*月\s*(\d+)\s*日)[^，。！？]{0,10}?(?:发出|寄出|补寄|发货|退款|到账|退回|回电|联系您|答复|回复您|送达|送到|到货|处理好|给您结果)/g
/** Quoted words are what was said before (“你们每次都说明天”), not something this reply promises. */
const unquote = (t: string) => t.replace(/“[^”]*”|"[^"]*"|「[^」]*」|‘[^’]*’/g, (m) => "＿".repeat(m.length))
/** an offer of money or goods (asking for it on the consumer's behalf — 申请 — is fine) */
const COMPENSATION = /(?<!申请)(?:给您|为您|送您|补偿您|赔偿您)(?:补偿|赔偿|一张|返现|赠送|\d+\s*元)|(?<!申请)(?:无门槛券|代金券|优惠券)(?!.*申请)|返现|赔付您/g
const REASK = /(?:麻烦|请|方便|能否|可以)(?:您)?(?:再)?(?:提供|发|告诉|报|拍|说)(?:一下|下)?(?:我)?[^。？！]{0,8}?(订单号|订单编号|批号|照片|地址|手机号|经过|情况)/g

/** Policy phrases and the situation each clause is written for. */
const POLICY_PHRASES: { re: RegExp; clause: string; when: (s: ClaimContext["situation"]) => boolean; scope: string }[] = [
  { re: /已拆封[^。，]{0,10}(?:全额)?退款|无需寄回剩余/g, clause: "policy-return-01#1", when: (s) => s.safety, scope: "因皮肤不适申请退货" },
  { re: /就医费用/g, clause: "policy-medical-01#1", when: (s) => s.safety, scope: "疑似产品相关的皮肤不适就医" },
  { re: /运费由(?:我们|品牌)承担|改派顺丰|加急顺丰/g, clause: "sop-logistics-01#2", when: (s) => s.logistics || s.promise, scope: "物流延误或补寄" },
]

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01

export function checkClaims(text: string, ctx: ClaimContext): Claim[] {
  const out: Claim[] = []
  const plain = unquote(text)
  const today = ctx.pack ? new Date(ctx.pack.now) : undefined
  const p = ctx.pack
  const committed = (p?.tasks ?? []).filter(isCommitted)
  // a deadline that has already passed supports nothing said today
  const live = committed.filter((t) => !t.dueAt || !p || new Date(t.dueAt).getTime() >= new Date(p.now).getTime())
  const approved = (p?.tasks ?? []).filter((t) => ["approved", "submitted", "executed"].includes(t.status))

  for (const m of text.matchAll(ORDER_ID)) {
    const ok = Boolean(p?.orderIds.includes(m[0]))
    out.push({ kind: "order", text: m[0], index: m.index, supported: ok, by: ok ? m[0] : undefined, issue: ok ? undefined : "这个订单号不属于当前消费者", severity: ok ? "ok" : "block" })
  }
  for (const m of text.matchAll(TICKET_ID)) {
    const ok = Boolean(p?.facts.some((f) => f.ref === m[0]) || p?.tasks.some((t) => t.ticketId === m[0]))
    out.push({ kind: "ticket", text: m[0], index: m.index, supported: ok, by: ok ? m[0] : undefined, issue: ok ? undefined : "查不到这个工单号", severity: ok ? "ok" : "block" })
  }
  for (const m of text.matchAll(AMOUNT)) {
    const v = Number(m[1] ?? m[2])
    const task = approved.find((t) => t.cost !== undefined && sameAmount(t.cost, v))
    const order = p?.amounts.find((a) => sameAmount(a, v))
    const listed = PRODUCTS.find((x) => sameAmount(x.price, v))
    const ok = Boolean(task || order !== undefined || listed)
    out.push({ kind: "amount", text: m[0], index: m.index, supported: ok, by: task ? task.id : order !== undefined ? "订单金额" : listed ? `${listed.name} 标价` : undefined, issue: ok ? undefined : "这个金额没有出处：不是订单金额、商品标价，也没有批准的任务", severity: ok ? "ok" : "block" })
  }
  const proposed = (p?.tasks ?? []).filter((t) => !["cancelled", "rejected"].includes(t.status))
  for (const m of plain.matchAll(ARRANGED)) {
    // “申请已经提交给组长” is a claim about the application, true as soon as the task exists
    const aboutApplication = /申请/.test(plain.slice(Math.max(0, m.index - 6), m.index)) && /提交/.test(m[0])
    const ok = aboutApplication ? proposed.length > 0 : committed.length > 0
    out.push({ kind: "arranged", text: m[0], index: m.index, supported: ok, by: ok ? (aboutApplication ? proposed[0].id : committed[0].ticketId) : undefined, issue: ok ? undefined : aboutApplication ? "说申请已提交，但没有找到这项申请" : "说成了“已经安排”，但还没有提交成功的工单；批准并提交之前只能说“我为您申请”", severity: ok ? "ok" : "block" })
  }
  for (const m of plain.matchAll(TIMING)) {
    // a calendar date before today refers to the past (“10 月 5 日反馈破损后…”), not a new promise
    if (m[1] && today && new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2])) < new Date(today.getFullYear(), today.getMonth(), today.getDate())) continue
    const task = live.find((t) => t.dueAt)
    const stale = !task && committed.some((t) => t.dueAt)
    const ok = Boolean(task)
    out.push({ kind: "timing", text: m[0], index: m.index, supported: ok, by: task?.id, issue: ok ? undefined : stale ? "引用的工单期限已经过了，不能再拿它当承诺" : "给了具体时间，但没有已提交、带期限的任务支撑", severity: ok ? "ok" : ctx.level >= 2 || (p?.commitments.some((c) => c.status === "overdue") ?? false) ? "block" : "warn" })
  }
  for (const m of plain.matchAll(COMPENSATION)) {
    const task = approved.find((t) => t.kind === "compensation")
    const ok = Boolean(task)
    out.push({ kind: "compensation", text: m[0], index: m.index, supported: ok, by: task?.id, issue: ok ? undefined : "提出了补偿，但没有批准的补偿任务；可以说“我为您申请”", severity: ok ? "ok" : "block" })
  }
  for (const r of POLICY_PHRASES) {
    for (const m of text.matchAll(r.re)) {
      const ok = r.when(ctx.situation)
      out.push({ kind: "policy", text: m[0], index: m.index, supported: ok, by: ok ? r.clause : undefined, issue: ok ? undefined : `这条政策只适用于“${r.scope}”，与当前情况不符`, severity: ok ? "ok" : "block" })
    }
  }
  for (const m of text.matchAll(REASK)) {
    const wanted = m[1]
    const known = p?.known.find((k) => (wanted.startsWith("订单") && k.label === "订单号") || (wanted === "照片" && /照片/.test(k.label)) || (wanted === "批号" && k.label === "出库批次") || ((wanted === "经过" || wanted === "情况") && k.label === "问题经过"))
    if (known) out.push({ kind: "reask", text: m[0], index: m.index, supported: false, by: known.ref, issue: `重复询问：${known.label}已知（${known.value}）`, severity: "warn" })
  }
  return out.sort((a, b) => a.index - b.index)
}

export const blockingClaims = (cs: Claim[]) => cs.filter((c) => c.severity === "block")
