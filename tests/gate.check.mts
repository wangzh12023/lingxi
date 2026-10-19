// The send gate (review P0-6): the server checks the exact text at send time — rules, facts and
// policy, and a human review path when no model is configured. Run: npx tsx tests/gate.check.mts
process.env.LINGXI_DB = ":memory:"
process.env.LINGXI_MODE = "offline"
const db = await import("../src/lib/server/db")
const { reviewReply, verdictFor, textHash } = await import("../src/lib/server/gate")
const { CUSTOMERS } = await import("../src/lib/data")

let fail = 0
const check = (ok: boolean, label: string, got?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || got === undefined ? "" : `\n     → ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) fail++
}
const he = CUSTOMERS.he.id
const lin = CUSTOMERS.lin.id
const v = (text: string, level = 2, extra: Partial<Parameters<typeof reviewReply>[0]> = {}) => reviewReply({ customerId: he, text, level, ...extra })

/* ── facts, policy and authority ── */
check((await v("已为您安排今天 18:00 前补寄，工单马上就出。")).status === "blocked", "没有工单就说“已为您安排”+ 具体时间 → 拦截")
check((await v("再给您 100 元补偿，您看可以吗？")).status === "blocked", "未经批准的补偿 → 拦截")
check((await v("订单 TM20260928-8812 我已经核对过了。")).status === "blocked", "别人的订单号（事实错误）→ 拦截")
check((await v("已拆封的也可以全额退款，无需寄回剩余产品。")).status === "blocked", "把“皮肤不适无忧退”用在破损补寄（错用政策）→ 拦截")
check((await v("您把差评改一下，我这边马上给您处理退款。")).status === "blocked", "“改差评就处理退款”的变体 → 拦截")
check((await v("您好评之后我们会返现 20 元。")).status === "blocked", "好评返现 → 拦截")

/* ── near misses: lawful sentences that look risky ── */
const ok1 = await v("我们不会要求您删除或修改评价，退款会照常办理。")
check(ok1.status === "pass", "说明规则本身（不会要求删评）→ 放行", ok1.summary)
const ok2 = await v("这不是您的问题，是我们三次都没有做到。")
check(ok2.status === "pass", "否定句“这不是您的问题”→ 放行", ok2.summary)
const ok3 = await v("我现在为您申请加急补寄，批准后把工单号发给您。")
check(ok3.status === "pass", "“为您申请……批准后告知”→ 放行", ok3.summary)

/* ── bound to the exact text: edit after review ── */
const good = "我现在为您申请加急补寄，批准后把工单号发给您。"
const bad = good.replace("我现在为您申请", "已为您安排")
await v(good)
check(verdictFor(he, good)?.status === "pass" && verdictFor(he, bad) === undefined, "审查结果绑定文本哈希：改过的文本没有审查结果，必须重审")
check(textHash(he, good) !== textHash(he, bad) && textHash(he, good) !== textHash(lin, good), "哈希随文本和消费者变化")
check((await v(bad)).status === "blocked", "改成“已为您安排”后重审 → 拦截")

/* ── after the task exists, the same promise is allowed ── */
const p = await db.proposeTask({ customerId: he, action: { kind: "followup", title: "加急补寄并给出工单号", detail: "", cost: 23, impact: "", commitment: "今天 18:00 前加急发出补寄的面霜", dueInHours: 8, resolves: "T-2610-0388" }, actorId: "u-xiaohe", idemKey: "gate-0001", autoSubmit: true })
if (p.ok) await db.transitionTask(p.value.id, "approve", { actorId: "u-wang", idemKey: "gate-0002" })
const t = db.listTasks(he)[0]
const promised = await v(`加急补寄已经为您提交（工单 ${t.ticketId}），今天 18:00 前加急发出。`)
check(promised.status === "pass", "工单批准并提交后，同样的承诺 → 放行", promised.summary)

/* ── L3+ without a model: a person has to read it ── */
const hi = await reviewReply({ customerId: lin, text: "林小姐，请先停用并用清水冲洗，我马上为您跟进。", level: 4 })
check(hi.status === "needs_human" && hi.layers.semantic === "skipped", "L4 会话、未配置模型：规则和事实都过了，但需要人工过目", hi.summary)
const notLead = await reviewReply({ customerId: lin, text: "林小姐，请先停用并用清水冲洗，我马上为您跟进。", level: 4, reviewedBy: "u-xiaolin" })
check(notLead.status === "needs_human" && /没有这个权限/.test(notLead.summary), "一线坐席不能替自己过目", notLead.summary)
const lead = await reviewReply({ customerId: lin, text: "林小姐，请先停用并用清水冲洗，我马上为您跟进。", level: 4, reviewedBy: "u-wang" })
check(lead.status === "pass" && /王组长已过目/.test(lead.summary), "组长过目后放行，并写明是谁", lead.summary)
check(db.logFor(lin).some((l) => l.action === "send_reviewed" && l.actor === "王组长"), "人工过目写入操作日志")
check((await reviewReply({ customerId: lin, text: "这肯定是过敏了，不是产品问题。", level: 4, reviewedBy: "u-wang" })).status === "blocked", "组长过目也不能放行命中红线的回复")

console.log(fail ? `\n${fail} FAILED` : "\ngate: all pass")
process.exit(fail ? 1 : 0)
