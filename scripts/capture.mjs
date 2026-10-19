// Product screenshots for the deck and the docs. Usage: node scripts/capture.mjs <outDir> [only]
// Needs the app running (BASE_URL, default http://localhost:3100).
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"

const [, , outDir = ".scratch/shots", only] = process.argv
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"
const base = process.env.BASE_URL || "http://localhost:3100"
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(path, w = 1600, h = 1000) {
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
  page.on("pageerror", (e) => console.log("  pageerror:", e.message))
  await page.goto(base + path, { waitUntil: "networkidle2", timeout: 120000 })
  await sleep(1200)
  return page
}
const save = async (page, name, opts = {}) => {
  await page.screenshot({ path: `${outDir}/${name}.png`, ...opts })
  console.log("saved", name)
}
/** Advance the rehearsed conversation one step and wait until the analysis has settled. */
async function step(page, n = 1, wait = 5200) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("ArrowRight")
    await sleep(wait)
  }
}
const clickText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a, [role=tab]")].find((b) => b.textContent?.includes(t))
    el?.click()
    return Boolean(el)
  }, text)
/** Scroll the plugin panel so that the section with this title is at the top. */
const panelTo = (page, title) =>
  page.evaluate((t) => {
    const h = [...document.querySelectorAll("section")].find((s) => s.textContent?.trim().startsWith(t))
    h?.scrollIntoView({ block: "start" })
  }, title)

const jobs = {
  async landing() {
    const page = await open("/", 1600, 1000)
    await sleep(1500)
    await save(page, "landing")
    await page.close()
  },
  async console() {
    const page = await open("/console")
    await step(page, 1, 6500)
    await save(page, "console-1-insight")
    await panelTo(page, "切")
    await sleep(500)
    await save(page, "console-2-risk")
    await panelTo(page, "笔")
    await sleep(500)
    await save(page, "console-3-drafts")
    // plain workbench, for the before/after pair
    await page.evaluate(() => document.querySelector('button[aria-label="收起插件"]')?.click())
    await sleep(500)
    await save(page, "console-0-workbench")
    await page.evaluate(() => document.querySelector('button[aria-label="打开灵犀插件"]')?.click())
    await sleep(400)
    // the type-it-yourself compliance check
    await page.type("textarea", "这肯定是过敏了，绝对不是产品问题，用我们的面霜可以消炎")
    await sleep(900)
    await save(page, "console-4-compliance")
    await page.close()
  },
  async huddle() {
    const page = await open("/console")
    // play until the roundtable step opens the sheet
    for (let i = 0; i < 12; i++) {
      await step(page, 1, 5200)
      if (await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')))) break
    }
    await sleep(9000)
    await save(page, "console-5-huddle")
    await page.close()
  },
  async alerts() {
    const page = await open("/alerts", 1600, 1000)
    await page.evaluate(() => localStorage.removeItem("lingxi-alerts-v1"))
    await page.reload({ waitUntil: "networkidle2" })
    await sleep(800)
    await save(page, "alerts-1")
    // claim the first case and open its tracking log
    await clickText(page, "认领")
    await sleep(500)
    await page.evaluate(() => document.querySelector('button[aria-label="查看跟踪记录"]')?.click())
    await sleep(500)
    await save(page, "alerts-2-tracking")
    await page.evaluate(() => localStorage.removeItem("lingxi-alerts-v1"))
    await page.close()
  },
  async eval() {
    const page = await open("/eval", 1600, 1000)
    await save(page, "eval-1")
    await save(page, "eval-full", { fullPage: true })
    await page.close()
  },
  async agents() {
    const page = await open("/agents", 1600, 1000)
    await sleep(1200)
    await save(page, "agents-1")
    await save(page, "agents-full", { fullPage: true })
    await page.close()
  },
  async knowledge() {
    const page = await open("/knowledge", 1600, 1000)
    await page.type('input[aria-label="检索知识库"]', "假一赔十")
    await sleep(700)
    await page.evaluate(() => [...document.querySelectorAll("li button")].find((b) => b.textContent?.includes("惩罚性赔偿"))?.click())
    await sleep(500)
    await save(page, "knowledge-1")
    await page.close()
  },
  async insights() {
    const page = await open("/insights", 1600, 1000)
    await sleep(1500)
    await save(page, "insights-1")
    await page.close()
  },
  async academy() {
    const page = await open("/academy", 1600, 1000)
    await sleep(1000)
    await save(page, "academy-1")
    await page.close()
  },
}

for (const [name, job] of Object.entries(jobs)) {
  if (only && !only.split(",").includes(name)) continue
  console.log("—", name)
  try {
    await job()
  } catch (e) {
    console.log("  FAILED", name, e.message)
  }
}
await browser.close()
