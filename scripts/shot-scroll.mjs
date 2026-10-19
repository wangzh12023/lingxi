// Like shot.mjs, but after the actions scrolls a container (CSS selector) by N pixels before capturing.
// Usage: node scripts/shot-scroll.mjs <path> <out.png> <actions-json> <selector> <scrollTop> [clip "x,y,w,h"]
import puppeteer from "puppeteer-core"
const [, , path, out, actionsRaw, selector, top, clipRaw] = process.argv
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto((process.env.BASE_URL || "http://localhost:3100") + path, { waitUntil: "networkidle2", timeout: 120000 })
await new Promise((r) => setTimeout(r, 1200))
for (const a of JSON.parse(actionsRaw)) {
  if (a.key) await page.keyboard.press(a.key)
  if (a.clickText) await page.evaluate((t) => [...document.querySelectorAll("button, a")].find((b) => b.textContent?.includes(t))?.click(), a.clickText)
  if (a.wait) await new Promise((r) => setTimeout(r, a.wait))
}
await page.evaluate(([sel, y]) => { const els = [...document.querySelectorAll(sel)]; const el = els.find((e) => e.scrollHeight > e.clientHeight) ?? els[0]; if (el) el.scrollTop = +y }, [selector, top])
await new Promise((r) => setTimeout(r, 700))
const clip = clipRaw ? (([x, y, w, h]) => ({ x, y, width: w, height: h }))(clipRaw.split(",").map(Number)) : undefined
await page.screenshot({ path: out, clip })
console.log("saved", out, errors.length ? `ERRORS: ${errors.join(" | ")}` : "")
await browser.close()
