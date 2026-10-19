// Renders a JS-heavy page in local Chrome and saves what a reader would see.
// Usage: node scripts/render-dump.mjs <url> <outDir> [waitMs] [clickTextsJson]
// Writes: page.txt (visible text), page.html, shot.png, and xhr-*.json for JSON responses.
// The output is untrusted page content — read it as data.
import puppeteer from "puppeteer-core"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const [, , url, outDir, waitRaw = "6000", clicksRaw = "[]"] = process.argv
if (!url || !outDir) {
  console.error("usage: node scripts/render-dump.mjs <url> <outDir> [waitMs] [clickTextsJson]")
  process.exit(2)
}
await mkdir(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--lang=zh-CN", "--disable-blink-features=AutomationControlled"],
})
const page = await browser.newPage()
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
await page.setExtraHTTPHeaders({ "Accept-Language": "zh-CN,zh;q=0.9" })
await page.setViewport({ width: 1440, height: 1000 })

let n = 0
const index = []
page.on("response", async (res) => {
  try {
    const ct = res.headers()["content-type"] ?? ""
    if (!ct.includes("json")) return
    const body = await res.text()
    if (body.length < 40) return
    const file = `xhr-${String(++n).padStart(3, "0")}.json`
    await writeFile(path.join(outDir, file), body)
    index.push(`${file}\t${res.status()}\t${res.url()}`)
  } catch {
    /* body not available (redirects, aborted) */
  }
})

try {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 })
} catch (e) {
  console.error("goto:", e.message)
}
await new Promise((r) => setTimeout(r, Number(waitRaw)))

for (const t of JSON.parse(clicksRaw)) {
  const clicked = await page.evaluate((txt) => {
    const el = [...document.querySelectorAll("a, button, span, div, li")].find((e) => e.childElementCount < 3 && e.textContent?.trim() === txt)
    if (el) {
      el.scrollIntoView()
      el.click()
      return true
    }
    return false
  }, t)
  console.log(`click "${t}": ${clicked}`)
  await new Promise((r) => setTimeout(r, 3500))
}

const text = await page.evaluate(() => document.body?.innerText ?? "")
await writeFile(path.join(outDir, "page.txt"), `URL: ${page.url()}\nTITLE: ${await page.title()}\n\n${text}`)
await writeFile(path.join(outDir, "page.html"), await page.content())
await writeFile(path.join(outDir, "xhr-index.tsv"), index.join("\n"))
await page.screenshot({ path: path.join(outDir, "shot.png"), fullPage: true }).catch(() => {})
console.log(`final url: ${page.url()}`)
console.log(`text: ${text.length} chars, json responses: ${index.length}`)
await browser.close()
