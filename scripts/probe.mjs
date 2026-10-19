// Debug helper: run actions, then report what is rendered at given points and the rects of given selectors.
// Usage: node scripts/probe.mjs <path> <actions-json> <points-json> [width] [height]
import puppeteer from "puppeteer-core"

const [, , path = "/", actionsRaw = "[]", pointsRaw = "[]", w = "1600", h = "900"] = process.argv
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"
const base = process.env.BASE_URL || "http://localhost:3100"

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await browser.newPage()
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
await page.goto(base + path, { waitUntil: "networkidle2", timeout: 120000 })
await new Promise((r) => setTimeout(r, 1200))
for (const a of JSON.parse(actionsRaw)) {
  if (a.click) await page.click(a.click)
  if (a.clickText) await page.evaluate((t) => { [...document.querySelectorAll("button, a")].find((b) => b.textContent?.includes(t))?.click() }, a.clickText)
  if (a.key) await page.keyboard.press(a.key)
  if (a.type) await page.type(a.type[0], a.type[1])
  if (a.wait) await new Promise((r) => setTimeout(r, a.wait))
}
const report = await page.evaluate((points) => {
  const describe = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]`
  }
  const out = { scroll: { docY: window.scrollY, docH: document.documentElement.scrollHeight, vh: window.innerHeight }, points: {}, scrolled: [] }
  for (const [x, y] of points) out.points[`${x},${y}`] = describe(document.elementFromPoint(x, y))
  for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) out.scrolled.push(`${describe(el)} scrollTop=${el.scrollTop}`)
  return out
}, JSON.parse(pointsRaw))
console.log(JSON.stringify(report, null, 2))
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 12).join("\n"))
await browser.close()
