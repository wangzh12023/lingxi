// The promise lifecycle against the real store (an in-memory SQLite). Run: npx tsx tests/tasks.check.mts
// Review P0-4: proposal → approval → ticket → result → follow-up → close or reopen; persistence across
// agents; idempotent clicks; failures stay pending; rejections never execute; overdue is noticed.
process.env.LINGXI_DB = ":memory:"
const db = await import("../src/lib/server/db")
const { buildFactPack, brokenPromises } = await import("../src/lib/engine/facts")
const { isTaskOverdue } = await import("../src/lib/tasks")
const { runPipeline } = await import("../src/lib/engine/pipeline")
const { CUSTOMERS } = await import("../src/lib/data")
const { caseContext } = await import("../src/lib/server/case")
type Insight = import("../src/lib/types").Insight

let fail = 0
const check = (ok: boolean, label: string, got?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || got === undefined ? "" : `\n     → ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) fail++
}
const he = CUSTOMERS.he
let n = 0
const key = () => `test-${Date.now()}-${++n}`
const remedy = { kind: "followup", title: "加急补寄并给出工单号", detail: "顺丰加急", cost: 23, impact: "—", commitment: "今天 18:00 前加急发出补寄的面霜，发出后提供快递单号", dueInHours: 8, resolves: "T-2610-0388", approver: "无需审批", status: "closed" }

async function turn(text: string) {
  let out: Insight | undefined
  for await (const ev of runPipeline({ messages: [{ id: "m", role: "consumer", text, at: 0 }], customer: he, ...caseContext(he.id) }, "rules")) if (ev.type === "done") out = ev.insight
  return out!
}

/* ── propose: the policy, not the client, decides ── */
const k1 = key()
const p1 = await db.proposeTask({ customerId: he.id, action: remedy, actorId: "u-xiaohe", idemKey: k1, autoSubmit: true })
check(p1.ok && p1.value.status === "pending_approval" && p1.value.approver === "组长", "坐席提出补救：客户端写的“无需审批”“closed”被忽略，进入待组长审批", p1.ok ? p1.value : p1)
const id = p1.ok ? p1.value.id : ""
const again = await db.proposeTask({ customerId: he.id, action: remedy, actorId: "u-xiaohe", idemKey: k1, autoSubmit: true })
check(again.ok && again.value.id === id && db.listTasks(he.id).length === 1, "同一次点击重复发送（幂等键相同）：不新建任务")
const dup = await db.proposeTask({ customerId: he.id, action: remedy, actorId: "u-xiaolin", idemKey: key(), autoSubmit: true })
check(dup.ok && dup.value.id === id && db.listTasks(he.id).length === 1, "另一位坐席再提同一项补救：返回已有任务，不重复承诺")

/* ── before approval: nothing may be promised ── */
const t1 = await turn("那到底什么时候能发？")
check(/提交给组长/.test(t1.drafts[0].text) && !t1.drafts.some((d) => /已为您提交|工单 MT-/.test(d.text)), "批准前：草稿只说“已提交给组长”，没有工单号", t1.drafts[0].text)

/* ── approval rights ── */
const deny = await db.transitionTask(id, "approve", { actorId: "u-xiaolin", idemKey: key() })
check(!deny.ok && deny.status === 403, "一线坐席无权批准", deny)
const failNext = () => db.setFailNextSubmit(true)
failNext()
const ap = await db.transitionTask(id, "approve", { actorId: "u-wang", idemKey: key(), note: "仓库确认有货" })
check(ap.ok && ap.value.status === "submit_failed" && !ap.value.ticketId, "组长批准，但工单系统故障：状态是“提交失败”，没有工单号", ap.ok ? ap.value : ap)
const t2 = await turn("那到底什么时候能发？")
check(!t2.drafts.some((d) => /已为您提交|工单 MT-/.test(d.text)), "提交失败时：草稿仍不能说“已安排”", t2.drafts[0].text)
const retry = await db.transitionTask(id, "submit", { actorId: "u-xiaohe", idemKey: key() })
check(retry.ok && retry.value.status === "submitted" && /^MT-/.test(retry.value.ticketId ?? ""), "重试提交：拿到模拟工单号", retry.ok ? retry.value : retry)
const ticket = retry.ok ? retry.value.ticketId! : ""
const resubmit = await db.transitionTask(id, "submit", { actorId: "u-xiaohe", idemKey: key() })
check(!resubmit.ok && db.ticketsFor(he.id).length === 1, "已提交的任务再提交：被拒绝，工单只有一张")

/* ── handover: another agent sees the same state ── */
const t3 = await turn("这次能给我个准话吗？")
check(t3.drafts.some((d) => d.text.includes(ticket)) && /18:00/.test(t3.drafts[0].text), "换坐席接手（同一份记录）：回复给出同一个工单号和期限", t3.drafts[0].text)
check(!t3.drafts.some((d) => d.issues.some((x) => x.severity === "block")), "有工单支撑的“已提交”“18:00 前”不被拦截", t3.drafts.flatMap((d) => d.issues.map((x) => x.reason)))
const pack = buildFactPack(he.id, db.now(), db.listTasks(he.id))
check(pack.facts.some((f) => f.text.includes(ticket)) && pack.commitments[0].remedy?.ticketId === ticket, "事实包里有这张工单：谁接手都能看到")

/* ── overdue is noticed on the demo clock ── */
const task = db.getTask(id)!
check(!isTaskOverdue(task, db.now()), "期限之前：不算逾期")
db.advanceClock(9, "u-zhao")
check(isTaskOverdue(db.getTask(id)!, db.now()), "演示时钟前进 9 小时：新的承诺也逾期，系统识别出来")
const lateTurn = await turn("发了吗？")
check(/期限.{0,20}已经过了|又逾期/.test(lateTurn.drafts[0].text) && !lateTurn.drafts.some((d) => /已(经)?(把情况)?升级/.test(d.text)), "过了新期限：回复先承认再次逾期，只说“现在就升级”，不说已经升级", lateTurn.drafts[0].text)
check(lateTurn.actions.find((x) => x.primary)?.title === "升级主管：补救再次逾期" && lateTurn.actions.find((x) => x.primary)?.approver === "组长", "过了新期限：主行动变为升级，需组长确认", lateTurn.actions.map((x) => [x.title, x.primary, x.approver]))
const { checkClaims } = await import("../src/lib/engine/claims")
const stalePack = buildFactPack(he.id, db.now(), db.listTasks(he.id))
check(checkClaims("今天 18:00 前加急发出", { pack: stalePack, level: 2, situation: { safety: false, logistics: false, refund: false, promise: true } }).some((c) => c.kind === "timing" && c.severity === "block"), "过期的工单期限不能再支撑“今天 18:00 前”")
const late = buildFactPack(he.id, db.now(), db.listTasks(he.id))
check(late.commitments.some((c) => c.source === "工单" && c.status === "overdue"), "原承诺仍未兑现，仍在“欠消费者”的清单里")

/* ── result, follow-up, close, reopen ── */
const noNote = await db.transitionTask(id, "record_result", { actorId: "u-xiaohe", idemKey: key() })
check(!noNote.ok, "登记执行结果必须写明结果")
const done = await db.transitionTask(id, "record_result", { actorId: "u-xiaohe", idemKey: key(), note: "顺丰 SF1234567890 已揽收" })
check(done.ok && done.value.status === "executed", "登记执行结果：已执行，待回访")
const closed = await db.transitionTask(id, "verify", { actorId: "u-xiaolin", idemKey: key(), note: "消费者确认收到" })
check(closed.ok && closed.value.status === "closed", "回访确认：闭环")
const kept = buildFactPack(he.id, db.now(), db.listTasks(he.id))
check(brokenPromises(kept).length === 0 && kept.commitments.every((c) => c.status === "kept"), "闭环后：这项承诺记为已兑现，不再出现在“欠消费者”里")
const reopened = await db.transitionTask(id, "reopen", { actorId: "u-xiaohe", idemKey: key(), note: "消费者反馈收到的还是破的" })
check(reopened.ok && reopened.value.status === "reopened", "新问题：重新打开")
check(brokenPromises(buildFactPack(he.id, db.now(), db.listTasks(he.id))).length === 1, "重新打开后：承诺又回到“欠消费者”")

/* ── rejection never executes ── */
const r1 = await db.proposeTask({ customerId: he.id, action: { kind: "compensation", title: "补偿 300 元券", detail: "—", impact: "—", cost: 300 }, actorId: "u-xiaohe", idemKey: key(), autoSubmit: true })
const rid = r1.ok ? r1.value.id : ""
check(r1.ok && r1.value.approver === "主管", "¥300 补偿需主管")
const rejNoReason = await db.transitionTask(rid, "reject", { actorId: "u-zhao", idemKey: key() })
check(!rejNoReason.ok, "驳回必须写明原因")
const rej = await db.transitionTask(rid, "reject", { actorId: "u-zhao", idemKey: key(), note: "与损失不相称" })
check(rej.ok && rej.value.status === "rejected", "主管驳回")
const exec = await db.transitionTask(rid, "submit", { actorId: "u-xiaohe", idemKey: key() })
check(!exec.ok && !db.getTask(rid)!.ticketId, "驳回的任务不能提交执行")

/* ── persistence: a fresh read sees everything, with the log ── */
const log = db.logFor(he.id)
check(log.some((l) => l.action === "propose") && log.some((l) => l.action === "approve" && l.actor === "王组长") && log.some((l) => l.action === "submit_failed") && log.some((l) => l.action === "submitted"), "操作日志记下了提出、批准、提交失败、提交成功，以及经手人")
check(log.every((l) => l.at && l.demoAt), "每条日志都有真实时间和演示时间")

/* ── risk events: thanks does not close; correction; reopen on new evidence ── */
db.resetDemo()
const c1 = await turn("算了，你们每次都说明天。")
db.recordSignals(he.id, c1.risk.signals)
const evKey = "service:broken_promise:T-2610-0388"
check(db.listEvents(he.id).some((e) => e.eventKey === evKey && e.status === "open"), "分析结果写入看板：失约事件为待处理")
const c2 = await turn("好的，谢谢你")
db.recordSignals(he.id, c2.risk.signals)
check(db.listEvents(he.id).find((e) => e.eventKey === evKey)?.status === "open", "消费者说“谢谢”：事件不会因此关闭")
const closeEv = db.transitionEvent({ customerId: he.id, eventKey: evKey, action: "close", actorId: "u-wang", idemKey: key(), note: "已补寄并回访" })
check(closeEv.ok && closeEv.value.status === "closed", "看板闭环")
const before = db.listEvents(he.id).find((e) => e.eventKey === evKey)!.version
db.recordSignals(he.id, [{ id: "x", category: "service", level: 2, title: "服务承诺逾期", evidence: "忆：补寄的面霜到货时又是破的", origin: "data", turn: 3, eventKey: evKey }])
const reEv = db.listEvents(he.id).find((e) => e.eventKey === evKey)!
check(reEv.status === "open" && reEv.version === before + 1, "闭环后出现新证据：事件重新打开，版本号加一", reEv)

const lin = CUSTOMERS.lin.id
db.recordSignals(lin, [{ id: "y", category: "safety", level: 4, title: "批次 LX2608A 反馈异常集中", evidence: "察：…", origin: "data", turn: 1, eventKey: "safety:batch:LX2608A" }])
const noPerm = db.transitionEvent({ customerId: lin, eventKey: "safety:batch:LX2608A", action: "invalidate", actorId: "u-wang", idemKey: key(), note: "批号识别错误", evidence: "瓶身照片放大后为 LX2608B" })
check(!noPerm.ok && noPerm.status === 403, "产品安全事件：客服组长不能标记无效")
const noEvidence = db.transitionEvent({ customerId: lin, eventKey: "safety:batch:LX2608A", action: "invalidate", actorId: "u-lu", idemKey: key(), note: "批号识别错误" })
check(!noEvidence.ok, "标记无效必须附依据")
const fixed = db.transitionEvent({ customerId: lin, eventKey: "safety:batch:LX2608A", action: "invalidate", actorId: "u-lu", idemKey: key(), note: "批号识别错误", evidence: "瓶身照片放大后为 LX2608B，不在异常批次内" })
check(fixed.ok && fixed.value.status === "invalid" && /LX2608B/.test(fixed.value.invalidReason ?? ""), "质量法规专员附依据纠正：事件标记为无效")
let lt: Insight | undefined
for await (const ev of runPipeline({ messages: [{ id: "m", role: "consumer", text: "批号是 LX2608A，我还是有点担心", at: 0 }], customer: CUSTOMERS.lin, ...caseContext(lin) }, "rules")) if (ev.type === "done") lt = ev.insight
check(!lt!.risk.signals.some((x) => x.eventKey === "safety:batch:LX2608A") && Boolean(lt!.corrections?.some((x) => x.eventKey === "safety:batch:LX2608A")), "纠正之后：同一个批号不再触发 L4，界面列出被纠正的事件和理由", lt!.risk.signals.map((x) => x.eventKey))

const analyse = async (customer: (typeof CUSTOMERS)[keyof typeof CUSTOMERS], text: string) => {
  let out: Insight | undefined
  for await (const ev of runPipeline({ messages: [{ id: "m", role: "consumer", text, at: 0 }], customer, ...caseContext(customer.id) }, "rules")) if (ev.type === "done") out = ev.insight
  return out!
}
const other = await analyse(he, "批号是 LX2608A，我也有点担心")
check(other.risk.signals.some((x) => x.eventKey === "safety:batch:LX2608A"), "林小姐的瓶子不是这个批次，不等于批次没问题：另一位消费者提到同一批号仍会触发", other.risk.signals.map((x) => x.eventKey))

/* ── a correction on the batch alert itself (no consumer) applies to every consumer ── */
db.resetDemo()
const g = db.transitionEvent({ customerId: "*", eventKey: "safety:batch:LX2608A", title: "批次 LX2608A 反馈异常集中", category: "safety", level: 4, action: "invalidate", actorId: "u-lu", idemKey: key(), note: "统计口径错误", evidence: "17 起反馈中 11 起是同一批重复进线，去重后与平日持平" })
check(g.ok, "看板上的批次预警（不属于某位消费者）由质量法规专员纠正")
const lt2 = await analyse(CUSTOMERS.lin, "批号是 LX2608A")
check(!lt2.risk.signals.some((x) => x.eventKey === "safety:batch:LX2608A") && Boolean(lt2.corrections?.some((x) => x.eventKey === "safety:batch:LX2608A")), "批次层面的纠正对所有消费者生效：林小姐的会话里这个批号不再触发，并说明原因", lt2.risk.signals.map((x) => x.eventKey))
const quiet = await analyse(he, "好的，谢谢你")
check(!quiet.corrections?.length, "没提到这个批次的会话，不列出批次层面的纠正", quiet.corrections)

console.log(fail ? `\n${fail} FAILED` : "\ntasks: all pass")
process.exit(fail ? 1 : 0)
