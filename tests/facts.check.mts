// Acceptance checks for “history must change the plan” (review P0-3).
// Run: npx tsx tests/facts.check.mts
import { runPipeline, anchored, type LLMHooks, type PerceiveResult, type ScribeResult } from "../src/lib/engine/pipeline"
import { buildFactPack, type FactPack } from "../src/lib/engine/facts"
import { checkClaims } from "../src/lib/engine/claims"
import { perceiveUser } from "../src/lib/engine/context"
import { CUSTOMERS } from "../src/lib/data"
import { DEMO_NOW } from "../src/lib/dataset"
import type { Task } from "../src/lib/tasks"
import type { Insight, Message, CustomerProfile } from "../src/lib/types"

let fail = 0
const check = (ok: boolean, label: string, got?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || got === undefined ? "" : `\n     → ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) fail++
}

async function analyze(text: string, customer: CustomerProfile | undefined, facts?: FactPack, hooks?: LLMHooks, prior?: Insight): Promise<Insight> {
  const messages: Message[] = [{ id: "m1", role: "consumer", text, at: 0 }]
  let out: Insight | undefined
  for await (const ev of runPipeline({ messages, customer, facts, prior }, hooks ? "llm" : "rules", hooks)) if (ev.type === "done") out = ev.insight
  return out!
}
const warm = (i: Insight) => i.drafts.find((d) => d.style === "warm")!.text
const primary = (i: Insight) => i.actions.find((a) => a.primary)!

const SAME = "算了，你们每次都说明天。"
const he = CUSTOMERS.he

/* ── 1 · same last sentence, different history → different, grounded plan ── */
const broken = buildFactPack(he.id, DEMO_NOW)
// the counterfactual: the very same record, except the promise was kept (ticket closed)
const kept: FactPack = { ...broken, commitments: broken.commitments.map((c) => ({ ...c, status: "kept" as const })), unresolved: [] }

const a = await analyze(SAME, he, broken)
const b = await analyze(SAME, he, kept)
check(/三次/.test(warm(a)) && /没有做到/.test(warm(a)), "有失约记录：回复点名失约的承诺，说明答应过三次", warm(a))
check(primary(a).resolves === "T-2610-0388" && primary(a).approver === "组长", "有失约记录：主行动是补救这张承诺工单，且需组长确认", primary(a))
check(!/三次|没有做到/.test(warm(b)), "同一句话、承诺已兑现：回复不再提失约", warm(b))
check(!b.actions.some((x) => x.resolves), "同一句话、承诺已兑现：没有补救行动", b.actions.map((x) => x.title))
check(warm(a) !== warm(b) && primary(a).title !== primary(b).title, "只改历史，方案随之改变")

/* ── 2 · what is already known is not asked again ── */
check(!/提供.{0,6}订单号|发我.{0,4}订单号|告诉我.{0,4}订单号/.test(warm(a)), "不再问订单号（已知 TM20261003-4471）", warm(a))
check(/订单 TM20261003-4471/.test(warm(a)) && /破损照片/.test(warm(a)), "直接引用已知的订单和破损照片", warm(a))
const refundHe = await analyze("我要退货", he)
check(/订单 TM20261003-4471/.test(warm(refundHe)) && !/告诉我订单号|提供.{0,4}订单号/.test(warm(refundHe)) && /退款/.test(warm(refundHe)), "有失约的消费者要退货：先认失约，引用已知订单，退款作为选项", warm(refundHe))
const refund = await analyze("我要退货", CUSTOMERS.lin)
check(/订单 TM20260928-8812 我这边已经看到了/.test(warm(refund)) && !/告诉我订单号/.test(warm(refund)), "退货咨询：引用已知订单，而不是让对方报订单号", warm(refund))
const stranger = await analyze("我要退货", undefined)
check(/订单号/.test(warm(stranger)), "新访客没有记录：才需要问订单号", warm(stranger))

/* ── 2b · the order the turn is about, not just the newest one ── */
const { subjectOrder } = await import("../src/lib/engine/facts")
check(subjectOrder(broken, "洁面用着也有点刺", "p-mistral-cleanser").order?.id === "TM20260712-0815", "提到洁面：指向洁面那笔订单，而不是最新的面霜订单")
check(subjectOrder(broken, "面霜什么时候补寄").order?.id === "TM20261003-4471", "没点名商品：指向逾期承诺所在的订单")
const cleanser = await analyze("我那瓶洁面能退吗", he, broken)
check(!cleanser.drafts.some((d) => d.text.includes("TM20261003-4471") && /洁面/.test(d.text) && !/面霜/.test(d.text)), "问洁面退货：不把面霜订单号当成洁面的订单", cleanser.drafts.map((d) => d.text))
const twoOrders: FactPack = { ...broken, commitments: [], unresolved: [], orders: [broken.orders[0], { ...broken.orders[1], paidAt: "2026-10-08T10:00" }] }
check(subjectOrder(twoOrders, "我要退货").ambiguous, "两笔近期订单、没说是哪一笔：判为不确定")
const amb = await analyze("我要退货", he, twoOrders)
check(amb.drafts.some((d) => /还是/.test(d.text)) && !amb.drafts.some((d) => /告诉我订单号|提供.{0,4}订单号/.test(d.text)), "不确定时：问是哪一件商品，而不是让对方报订单号", amb.drafts.map((d) => d.text))

/* ── 3 · nothing is said as arranged before a ticket exists ── */
check(!a.drafts.some((d) => /已为您|已经为您|已经安排|已安排/.test(d.text)), "还没有工单：三版草稿都不说“已经安排”")
const pendingTask: Task = { id: "TK-1", customerId: he.id, kind: "followup", title: "加急补寄并给出工单号", detail: "", cost: 23, approver: "组长", policyBasis: "", status: "pending_approval", commitment: "今天 18:00 前加急发出补寄的面霜，发出后提供快递单号", dueAt: "2026-10-11T18:00", resolves: "T-2610-0388", proposedBy: "小禾", proposedAt: "2026-10-11T10:05", attempts: 0, updatedAt: "" }
const pending = await analyze("那到底什么时候能发？", he, buildFactPack(he.id, DEMO_NOW, [pendingTask]))
check(/提交给组长/.test(warm(pending)) && !/已为您|已经为您提交/.test(warm(pending)), "任务待审批：只说“申请已提交给组长”", warm(pending))
check(!pending.drafts.some((d) => d.issues.some((x) => x.severity === "block")), "“申请已提交给组长”有任务支撑，不被拦截", pending.drafts.flatMap((d) => d.issues.map((x) => x.phrase)))
check(primary(pending).resolves === "T-2610-0388" && primary(pending).title === "加急补寄并给出工单号", "任务待审批：补救行动仍是主行动，界面据此显示审批按钮", primary(pending).title)
const submitted = await analyze("那到底什么时候能发？", he, buildFactPack(he.id, DEMO_NOW, [{ ...pendingTask, status: "submitted", ticketId: "MT-20261011-0001", decidedBy: "王组长" }]))
check(/工单 MT-20261011-0001/.test(warm(submitted)) && /18:00/.test(warm(submitted)), "工单已提交：回复给出工单号和期限", warm(submitted))
check(!submitted.drafts.some((d) => d.issues.some((x) => x.severity === "block")), "工单已提交：这些说法有依据，不被拦截", submitted.drafts.flatMap((d) => d.issues.map((x) => x.reason)))

/* ── 4 · claims are checked against the record ── */
const ctx = { pack: broken, level: 2, situation: { safety: false, logistics: false, refund: false, promise: true } }
const bad = (t: string, kind: string) => checkClaims(t, ctx).some((c) => c.kind === kind && c.severity === "block")
check(bad("已为您安排加急补寄，今天 18:00 前发出", "arranged"), "没有工单却说“已为您安排” → 拦截")
check(bad("今天 18:00 前给您发出", "timing"), "没有带期限的任务却给具体时间 → 拦截（此前已失约）")
check(bad("给您补偿 100 元", "compensation") || bad("给您补偿 100 元", "amount"), "没有批准的补偿却许诺 100 元 → 拦截")
check(bad("订单 TM20260928-8812 已核对", "order"), "别人的订单号 → 拦截")
check(bad("已拆封也可以全额退款，无需寄回剩余产品", "policy"), "把“皮肤不适无忧退”用到破损补寄 → 条款适用条件不符，拦截")
check(!bad("10 月 5 日到现在，我们三次说“明天发”", "timing"), "引述过去的日期和原话不是新的承诺")
check(checkClaims("麻烦您提供一下订单号", ctx).some((c) => c.kind === "reask"), "问已知的订单号 → 提示重复询问")

/* ── 5 · the newest message is sent whole; quoted evidence must be found ── */
const long = `${"我想先说一下情况，".repeat(30)}用了之后脸肿得睁不开`
const prompt = perceiveUser({ messages: [{ id: "x", role: "consumer", text: long, at: 0 }], customer: he }, { citations: [], pack: broken })
check(prompt.includes("脸肿得睁不开"), "第 240 字之后的风险线索也进入模型上下文")
const longRules = await analyze(long, he)
check(longRules.risk.signals.some((x) => x.category === "safety" && x.level >= 3), "规则同样读到第 240 字之后的线索（L3）")
check(anchored("“每次都说明天”", SAME) && !anchored("“我要去法院告你们”", SAME), "证据锚点：原话里有的才算有据")

const lyingModel: LLMHooks = {
  vision: async () => ({ data: null, call: { name: "v", agents: [], model: "mock", ms: 0, tokens: 0, ok: false } }),
  full: async () => ({
    data: {
      intent: { primary: "complaint", secondary: null, confidence: 0.9, summary: "x" },
      emotion: { anger: 0.5 },
      unspoken: [{ surface: "我已经找了律师", underlying: "要走法律程序", confidence: 0.9 }],
      signals: [{ category: "legal", level: 4, title: "已委托律师", evidence: "消费者说“我已经找了律师”" }],
      keyFacts: [],
      whisper: "x",
      drafts: { warm: "已为您安排今天 18:00 前补寄，再送您 100 元补偿。", professional: "好的。", concise: "好的。" },
      actions: [{ kind: "compensation", title: "补偿", detail: "", impact: "", cost: 100, approver: "无需审批" }],
    } as unknown as PerceiveResult & ScribeResult,
    call: { name: "f", agents: [], model: "mock", ms: 1, tokens: 10, ok: true },
  }),
  // the repair returns the same text: the problems must still be visible
  repair: async (_i, ctx) => ({ data: { drafts: ctx.drafts } as ScribeResult, call: { name: "r", agents: [], model: "mock", ms: 1, tokens: 10, ok: true } }),
  lite: async () => ({ data: null, call: { name: "l", agents: [], model: "mock", ms: 0, tokens: 0, ok: false } }),
}
const m = await analyze(SAME, he, broken, lyingModel)
const legal = m.risk.signals.find((x) => x.category === "legal")
check(Boolean(legal?.unverified) && (legal?.level ?? 9) <= 2, "模型编造的原话（“我已经找了律师”）：标为待核实，等级不超过 L2", legal)
check(m.unspoken.every((u) => u.surface !== "我已经找了律师" || u.confidence <= 0.3), "编造的潜台词置信度被压低")
const mw = m.drafts.find((d) => d.style === "warm")!
check(mw.issues.some((x) => x.ruleId === "claim-arranged") && mw.issues.some((x) => x.ruleId === "claim-timing") && mw.issues.some((x) => x.ruleId === "claim-compensation" || x.ruleId === "claim-amount"), "模型草稿里无依据的“已安排”、时间和补偿都被拦下", mw.issues.map((x) => x.ruleId))
check(m.actions.find((x) => x.kind === "compensation")?.approver === "组长", "模型自报的“无需审批”被丢弃：¥100 补偿需组长", m.actions.map((x) => [x.title, x.approver]))

/* ── 6 · a thank-you does not make an open risk disappear ── */
const thanks = await analyze("好的，谢谢你", he, broken, undefined, a)
check(thanks.risk.signals.some((x) => x.eventKey === "service:broken_promise:T-2610-0388"), "说“谢谢”之后，未兑现的承诺风险仍在")

console.log(fail ? `\n${fail} FAILED` : "\nfacts: all pass")
process.exit(fail ? 1 : 0)
