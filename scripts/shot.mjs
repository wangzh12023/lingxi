// Usage: node scripts/shot.mjs <path> <out.png> [width] [height] [actions-json]
// actions: [{"click":"selector"} | {"key":"ArrowRight"} | {"wait":ms} | {"type":["selector","text"]} | {"eval":"js"}]
import puppeteer from "puppeteer-core"

const [, , path = "/", out = ".scratch/shot.png", w = "1600", h = "900", actionsRaw = "[]"] = process.argv
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"
const base = process.env.BASE_URL || "http://localhost:3100"

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"] })
const page = await browser.newPage()
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
await page.goto(base + path, { waitUntil: "networkidle2", timeout: 120000 })
await new Promise((r) => setTimeout(r, 1200))
for (const a of JSON.parse(actionsRaw)) {
  if (a.click) await page.click(a.click)
  if (a.clickText) {
    await page.evaluate((t) => { const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent?.includes(t)); el?.click() }, a.clickText)
  }
  if (a.key) await page.keyboard.press(a.key)
  if (a.type) await page.type(a.type[0], a.type[1])
  if (a.eval) await page.evaluate(a.eval)
  if (a.wait) await new Promise((r) => setTimeout(r, a.wait))
}
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" })
console.log("saved", out)
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 12).join("\n"))
await browser.close()
