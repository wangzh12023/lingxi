// Records the demo video. Usage: node scripts/record-demo.mjs [outDir]
// Needs the app running (BASE_URL, default http://localhost:3100) and ffmpeg on PATH.
// Output: <outDir>/demo-raw.mp4 at 1920×1080: the app in the top 990 px, captions in a strip below it.
// The captions are drawn in the page, so they cannot drift from the picture. scripts/finish-demo.sh
// then brings the recording back to real-time speed and re-encodes it.
import puppeteer from "puppeteer-core"
import { mkdirSync, writeFileSync } from "node:fs"

const [, , outDir = ".scratch/video"] = process.argv
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"
const base = process.env.BASE_URL || "http://localhost:3100"
mkdirSync(outDir, { recursive: true })
const VW = 1920
const VH = 1080


const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb", `--window-size=${VW},${VH}`] })
const page = await browser.newPage()
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 })
page.on("pageerror", (e) => console.log("pageerror:", e.message))

// full-screen cards for the opening and the close, drawn inside the page so they are part of the recording
await page.evaluateOnNewDocument(() => {
  // The recorder only receives a frame when the page repaints, so a still screen would be shortened
  // in the video and the captions would drift. A two-pixel animation keeps frames coming.
  addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style")
    st.textContent =
      "@keyframes __tick{from{opacity:.4}to{opacity:.6}}#__tick{position:fixed;right:0;bottom:0;width:2px;height:2px;background:#3a3844;z-index:100001;animation:__tick .1s linear infinite alternate}" +
      // the app gives up the bottom strip to the captions
      ".h-dvh{height:calc(100dvh - 90px)!important}.min-h-dvh{min-height:calc(100dvh - 90px)!important}body{padding-bottom:90px}" +
      "#__cap{position:fixed;left:0;right:0;bottom:0;height:90px;z-index:100000;background:#16151c;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 60px;font:500 31px/1.3 'Microsoft YaHei',sans-serif;letter-spacing:.01em;text-align:center}"
    document.head.appendChild(st)
    const d = document.createElement("div")
    d.id = "__tick"
    document.documentElement.appendChild(d)
    const c = document.createElement("div")
    c.id = "__cap"
    c.textContent = sessionStorage.getItem("__cap") ?? ""
    document.documentElement.appendChild(c)
  })
  window.__setCap = (text) => {
    sessionStorage.setItem("__cap", text ?? "")
    const c = document.getElementById("__cap")
    if (c) c.textContent = text ?? ""
  }
  window.__card = (title, sub, small) => {
    let el = document.getElementById("__card")
    if (!title) return el?.remove()
    if (!el) {
      el = document.createElement("div")
      el.id = "__card"
      el.style.cssText = "position:fixed;inset:0 0 90px 0;z-index:99999;background:#faf9f6;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Microsoft YaHei',sans-serif;color:#16151c;text-align:center"
      document.documentElement.appendChild(el)
    }
    el.innerHTML = `<div style="height:6px;width:120px;border-radius:3px;background:linear-gradient(90deg,#d76a95,#8a72e0,#4c9ad8);margin-bottom:36px"></div><div style="font-size:76px;font-weight:700;letter-spacing:.02em">${title}</div><div style="font-size:30px;margin-top:26px;color:#3a3844">${sub ?? ""}</div><div style="font-size:19px;margin-top:44px;color:#6f6c78">${small ?? ""}</div>`
  }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const caps = []
let t0 = 0
/** Start a caption now; it stays until the next one (or `end`). */
const cap = async (text) => {
  const t = Date.now() - t0
  if (caps.length && caps.at(-1).end === undefined) caps.at(-1).end = t
  if (text) caps.push({ start: t, text })
  await page.evaluate((x) => window.__setCap(x), text ?? "")
}
const press = async (key = "ArrowRight") => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press(key)
}
const clickText = (text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a, [role=tab]")].find((b) => b.textContent?.includes(t))
    el?.click()
    return Boolean(el)
  }, text)
const panelTo = (title) =>
  page.evaluate((t) => {
    const h = [...document.querySelectorAll("section")].find((s) => s.textContent?.trim().startsWith(t))
    h?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, title)
const scrollPage = (y) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y)
const waitIdle = async (max = 12000) => {
  // the director button is disabled while an analysis is streaming
  const t = Date.now()
  await sleep(600)
  while (Date.now() - t < max) {
    const busy = await page.evaluate(() => Boolean(document.querySelector('[data-analyzing="true"]')) || [...document.querySelectorAll("span")].some((s) => /^运行中/.test(s.textContent ?? "")))
    if (!busy) break
    await sleep(250)
  }
}

/* ── prepare: clean state, land on the console with the plugin collapsed ── */
await page.goto(base + "/console", { waitUntil: "networkidle2", timeout: 120000 })
await page.evaluate(() => localStorage.removeItem("lingxi-alerts-v1"))
await page.reload({ waitUntil: "networkidle2" })
await sleep(2500)
// collapse the plugin, and make sure the click landed after hydration
for (let i = 0; i < 10; i++) {
  if (await page.evaluate(() => Boolean(document.querySelector('button[aria-label="打开灵犀插件"]')))) break
  await page.evaluate(() => document.querySelector('button[aria-label="收起插件"]')?.click())
  await sleep(400)
}
await page.evaluate(() => window.__card("灵犀 Lingxi", "双向共情的客服副驾", "欧莱雅第二届美妆科技黑客松 · 赛题 1 数据共情者——消费者的 AI 管家"))
await sleep(400)

const recorder = await page.screencast({ path: `${outDir}/demo-raw.mp4`, format: "mp4", fps: 30, quality: 20 })
t0 = Date.now()

/* ── 0 · title ── */
await cap("让每一位坐席，都听得懂没说出口的话。")
await sleep(4200)
await page.evaluate(() => window.__card(null))

/* ── 1 · the workbench as it is today ── */
await cap("这是坐席今天的工作台：队列按进线顺序排，会话区只有消费者的原话。")
await sleep(5200)
await cap("打开灵犀——它是嵌在工作台右侧的一个插件，不改变坐席原有的操作。")
await page.evaluate(() => document.querySelector('button[aria-label="打开灵犀插件"]')?.click())
await sleep(5200)

/* ── 2 · one consumer turn ── */
await cap("林小姐发来一张照片和一句话。望、闻、问、切、忆同时开始工作。")
await press()
await waitIdle()
await sleep(1200)
await cap("灵犀一念：她发照片不是为了索赔，是在问“我的脸会好吗”。先让她安心，再问细节。")
await sleep(6200)
await cap("忆 · 服务轨迹：聊天、订单、工单并成一条时间线。订单号已经查好，不用再向她要。")
await panelTo("忆")
await sleep(6000)
await cap("切 · 风险：疑似不良反应。法定报告时限 30 日、15 日、3 日，来自逐字核对过的法规原文。")
await panelTo("切")
await sleep(7200)
await cap("笔 · 三版草稿：温暖、专业、简洁。评分和合规结论由规则计算，不取自模型。")
await panelTo("笔")
await sleep(6200)

/* ── 3 · the compliance guard on hand-typed text ── */
await cap("坐席自己手写的回复，走的是同一道检查。")
await page.click("textarea")
await page.type("textarea", "这肯定是过敏了，绝对不是产品问题，用我们的面霜可以消炎", { delay: 55 })
await sleep(1200)
await cap("医学诊断、推卸责任、医疗宣称——三处被标出，发送按钮变成“已拦截”。")
await sleep(5600)
await cap("点一下“按建议修正”。")
await clickText("按建议修正")
await sleep(3600)
await page.click("textarea")
await page.keyboard.down("Control")
await page.keyboard.press("KeyA")
await page.keyboard.up("Control")
await page.keyboard.press("Backspace")
await sleep(500)

/* ── 4 · the conversation goes on, the risk rises ── */
await cap("坐席采用推荐的草稿，发出回复。")
await page.evaluate(() => document.querySelector("section")?.closest(".overflow-y-auto, [class*=overflow]")?.scrollTo({ top: 0, behavior: "smooth" }))
await press()
await sleep(1800)
await press()
await sleep(2200)
await cap("第二句话：她妈妈用的是同一批，也有点刺；而且她已经发了小红书。")
await press()
await waitIdle()
await sleep(1500)
await cap("察：这个批次近 72 小时的同类反馈明显高于平日，泊松检验显著。风险升到 L4。")
await panelTo("切")
await sleep(7000)
await press()
await sleep(1600)
await press()
await sleep(2000)
await cap("达到会诊条件，灵犀按风险归属召集相关部门的角色智能体。")
await press()
await sleep(6500)
await cap("质量、法务、公关、客户体验各自从本部门的立场发言，形成带责任部门和时限的决议。")
await sleep(11000)
await cap("会诊只给出建议，由值班主管确认后执行。")
await sleep(4500)
await page.keyboard.press("Escape")
await sleep(800)

/* ── 5 · the risk board ── */
await cap(null)
await page.goto(base + "/alerts", { waitUntil: "networkidle2" })
await sleep(500)
await cap("第二个产出物：风险预警跟踪看板。刚才那通会话，已经自动出现在这里。")
await sleep(6500)
await cap("舆情投诉、重复进线、情绪升级、重复退款……每一类写明责任部门和处理时限。")
await sleep(6000)
await cap("认领一个个案。")
await clickText("认领")
await sleep(2200)
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "闭环")?.click())
await sleep(1200)
await cap("闭环必须写下处理结果。每一步都留痕。")
const note = await page.$("textarea")
if (note) {
  await note.click()
  await note.type("已致电消费者并安排上门取件送检，对方确认。", { delay: 50 })
  await sleep(900)
  await clickText("标记闭环")
}
await sleep(4200)

/* ── 6 · evaluation and token cost ── */
await cap(null)
await page.goto(base + "/eval", { waitUntil: "networkidle2" })
await cap("判得准不准，用盲测集说话：调规则的人没有读过这些题。")
await sleep(7000)
await cap("规则在含蓄表达和反讽上会失手——这是大模型该做的事。没有实测过的数，我们不填。")
await scrollPage(420)
await sleep(7500)
await cap("省 token：规则先读一遍，再决定这一轮用多少模型。只有寒暄不经过模型，有风险的消息没有一条被漏掉。")
await scrollPage(1050)
await sleep(8500)

/* ── 7 · the regulations ── */
await cap(null)
await page.goto(base + "/knowledge", { waitUntil: "networkidle2" })
await cap("知识库里的法规文档逐字摘自官方文本，附出处。比如“假一赔十”：它出自食品安全法。")
await page.type('input[aria-label="检索知识库"]', "假一赔十", { delay: 90 })
await sleep(900)
await page.evaluate(() => [...document.querySelectorAll("li button")].find((b) => b.textContent?.includes("惩罚性赔偿"))?.click())
await sleep(7500)

/* ── 8 · close ── */
await page.evaluate(() => window.__card("心有灵犀一点通", "灵犀不替坐席回答。它帮人把人照顾好。", "灵犀 Lingxi · 赛题 1"))
await cap("谢谢观看。")
await sleep(4500)
await cap(null)
const wallMs = Date.now() - t0

await recorder.stop()
await browser.close()

writeFileSync(`${outDir}/captions.json`, JSON.stringify({ wallMs, caps }, null, 2), "utf8")
console.log(`recorded ${Math.round(wallMs / 1000)} s, ${caps.length} captions → ${outDir}`)
