// Clicks through the main scenario in a real browser: propose → switch to 组长 → approve → ticket →
// the reply now names the ticket → switch agent → advance the clock → overdue reminder.
// Usage: node scripts/walk-promise.mjs [outDir]   (app running on BASE_URL, default :3100)
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"

const [, , outDir = ".scratch/walk"] = process.argv
const base = process.env.BASE_URL || "http://localhost:3100"
mkdirSync(outDir, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText)
const clickText = (t) => page.evaluate((x) => { const el = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(x)); el?.click(); return Boolean(el) }, t)
const setActor = (id) => page.evaluate((v) => { const s = document.querySelector('select[aria-label="切换当前操作人"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })) }, id)
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` })
let fail = 0
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) fail++ }

await fetch(`${base}/api/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "reset" }) })
await page.goto(`${base}/console`, { waitUntil: "networkidle2" })
await sleep(1500)
await page.keyboard.press("ArrowRight")
await sleep(6500)
let t = await text()
check(t.includes("欠消费者") && t.includes("T-2610-0388"), "第一屏：欠消费者的承诺和工单号")
check(t.includes("已知，不用再问") && t.includes("TM20261003-4471"), "第一屏：已知信息（订单号）")
check(!/已为您提交/.test(t), "批准前：没有“已为您提交”")
await shot("1-first-turn")

check(await clickText("提交组长审批"), "点击“提交组长审批”")
await sleep(4500)
t = await text()
check(t.includes("待审批"), "任务状态：待审批")
check(/申请已经提交给组长|申请已提交组长/.test(t), "重新分析后：草稿说“申请已提交给组长”")
await shot("2-pending")

await setActor("u-wang")
await sleep(600)
check(await clickText("批准"), "切换到王组长，点击“批准”")
await sleep(5000)
t = await text()
const ticket = t.match(/MT-\d{8}-\d{4}/)?.[0]
check(Boolean(ticket), `生成模拟工单 ${ticket ?? "（无）"}`)
check(Boolean(ticket) && new RegExp(`已经为您提交（工单 ${ticket}）|已为您提交（工单 ${ticket}）`).test(t), "推荐回复现在给出工单号")
await shot("3-approved")

await setActor("u-xiaolin")
await page.reload({ waitUntil: "networkidle2" })
await sleep(1500)
await page.keyboard.press("ArrowRight")
await sleep(6500)
t = await text()
check(Boolean(ticket) && t.includes(ticket), "刷新并换坐席（小林）接手：同一工单仍在")
await shot("4-handover")

await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("演示控制"))?.click())
await sleep(400)
await clickText("时钟前进 9 小时")
await sleep(5500)
t = await text()
check(t.includes("到期未兑现"), "时钟前进 9 小时：到期未兑现的提醒出现")
await shot("5-overdue")

console.log(errors.length ? `page errors:\n${errors.slice(0, 6).join("\n")}` : "no page errors")
console.log(fail ? `${fail} FAILED` : "walk: all pass")
await browser.close()
process.exit(fail ? 1 : 0)
