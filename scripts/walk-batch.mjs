// Walks the 林小姐 batch scenario: L2 send passes, L4 send needs a team lead offline, roundtable has a brief,
// and a correction on the board (by the quality & regulatory specialist) keeps the batch out of the next analysis.
// Usage: node scripts/walk-batch.mjs [outDir]
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"

const [, , outDir = ".scratch/walk-batch"] = process.argv
const base = process.env.BASE_URL || "http://localhost:3100"
mkdirSync(outDir, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText)
const clickText = (t) => page.evaluate((x) => { const el = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(x)); el?.click(); return Boolean(el) }, t)
const setSelect = (label, v) => page.evaluate(([l, val]) => { const s = document.querySelector(`select[aria-label="${l}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, val); s.dispatchEvent(new Event("change", { bubbles: true })) }, [label, v])
let fail = 0
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) fail++ }

await fetch(`${base}/api/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "reset" }) })
await page.goto(`${base}/console`, { waitUntil: "networkidle2" })
await sleep(1500)
await setSelect("选择演示场景", "lin-retinol")
await sleep(800)
const press = async (wait = 5500) => { await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await page.keyboard.press("ArrowRight"); await sleep(wait) }
await press(6500) // s1 consumer
await press(800) // adopt draft
await press(3000) // send (L2) → should pass
let t = await text()
check(!t.includes("需组长过目") && (t.match(/林小姐，/g) ?? []).length >= 1, "L2 回复：通过发送前审查并发出")
await press(7000) // s3 consumer (L4)
await press(800) // adopt
await press(3500) // send → needs_human offline
t = await text()
check(t.includes("需组长过目") || t.includes("需组长或以上过目"), "L4 回复、没有模型：发送前审查要求组长过目")
await page.screenshot({ path: `${outDir}/1-needs-review.png` })
await setSelect("切换当前操作人", "u-wang")
await sleep(600)
check(await clickText("已过目，发送"), "切换到王组长，点击“已过目，发送”")
await sleep(3500)
t = await text()
check(!t.includes("需组长过目"), "组长过目后发出")
await press(9000) // huddle step opens the sheet
t = await text()
check(t.includes("决策简报") && t.includes("多角色模拟"), "会诊面板：先给决策简报，并说明讨论是模拟")
await sleep(9000)
await page.screenshot({ path: `${outDir}/2-huddle.png` })
t = await text()
check(t.includes("模拟立场一致度") && t.includes("转为任务"), "决议：显示“模拟立场一致度”和“转为任务”")

/* ── correction on the board: one alert at a time, and only 质量法规部 may correct a product-safety one ── */
await page.goto(`${base}/alerts`, { waitUntil: "networkidle2" })
await sleep(1500)
const BATCH = "safety:batch:LX2608A"
const row = () => page.evaluateHandle(() => [...document.querySelectorAll("li")].find((li) => li.textContent?.includes("林小姐") && li.textContent?.includes("批次 LX2608A 反馈异常集中") && li.querySelector('button[aria-label="查看跟踪记录"]')))
const alerts = async () => (await (await fetch(`${base}/api/board`)).json()).alerts
const linBatch = (as) => as.find((a) => a.customer?.id === "C-88021" && a.eventKey === BATCH)
const pressInvalid = async () => (await row()).evaluate((el) => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("标记无效")).click())
await (await row()).evaluate((el) => el.querySelector('button[aria-label="查看跟踪记录"]').click())
await sleep(500)
await (await row()).evaluate((el) => { el.querySelector("details").open = true })
const [reason, basis] = await (await row()).$$("details input")
await reason.type("批号识别错误")
await basis.type("瓶身照片放大后为 LX2608B，不在异常批次内")
await (await row()).evaluate((el, key) => {
  const s = el.querySelector('select[aria-label="要纠正的预警"]')
  if (!s) return
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, key)
  s.dispatchEvent(new Event("change", { bubbles: true }))
}, BATCH)
await setSelect("切换当前操作人", "u-wang")
await sleep(400)
await pressInvalid()
await sleep(1500)
check(linBatch(await alerts())?.status !== "invalid", "客服组长不能把产品安全预警标为无效")
await setSelect("切换当前操作人", "u-lu")
await sleep(400)
await pressInvalid()
await sleep(1500)
let as = await alerts()
check(linBatch(as)?.status === "invalid", "切换到陆工（质量法规部），附原因和依据：林小姐这条批次预警标记为无效")
check(as.filter((a) => a.customer?.id === "C-88021" && a.eventKey !== BATCH).every((a) => a.status !== "invalid"), "只纠正选中的那一条：同一个案里的其他预警不受影响")
check(as.find((a) => !a.customer && a.eventKey === BATCH)?.status !== "invalid", "她的瓶子不是这个批次，不等于批次异常不存在：批次预警仍在看板上")
await page.screenshot({ path: `${outDir}/3-board-correction.png` })

/* ── the next analysis of her case leaves the batch out and says who corrected it, and why ── */
await setSelect("切换当前操作人", "u-xiaohe")
await page.goto(`${base}/console`, { waitUntil: "networkidle2" })
await sleep(1500)
await setSelect("选择演示场景", "lin-retinol")
await sleep(800)
await clickText("自由模式")
await sleep(300)
await page.type('input[aria-label="以消费者身份输入"]', "批号是 LX2608A，我还是有点担心")
await clickText("以消费者身份发送")
await sleep(7000)
t = await text()
const line = t.split(/\n/).find((l) => l.includes("已按人工纠正排除")) ?? ""
check(line.includes("批次 LX2608A") && line.includes("陆工") && !line.includes("内容已经公开传播"), "回到工作台：同一批号不再进入分析，并列出谁、因为什么纠正")
await page.screenshot({ path: `${outDir}/4-after-correction.png` })

console.log(errors.length ? `page errors:\n${errors.slice(0, 6).join("\n")}` : "no page errors")
console.log(fail ? `${fail} FAILED` : "walk-batch: all pass")
await browser.close()
process.exit(fail ? 1 : 0)
