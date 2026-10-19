// Builds the sheets for human reviewers from the frozen final set. Usage: node eval/human-review/export.mjs
// Writes CSV files (UTF-8 with BOM, so Excel opens them correctly) into eval/human-review/sheets/.
// Reviewers label independently; the first annotator's labels are NOT included in the sheets.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const final = path.join(here, "..", "final")
const out = path.join(here, "sheets")
mkdirSync(out, { recursive: true })
const read = (prefix) => readdirSync(final).filter((f) => f.startsWith(prefix)).sort().flatMap((f) => JSON.parse(readFileSync(path.join(final, f), "utf8")))
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
const csv = (rows) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")

const messages = read("f-messages-")
writeFileSync(path.join(out, "1-消费者消息.csv"), csv([["编号", "消息", "主意图（填一个英文键）", "主导情绪（填一个英文键）", "风险（可多个，用 | 分隔，没有就留空）", "备注"], ...messages.map((m) => [m.id, m.text, "", "", "", ""])]))

const replies = read("f-replies-")
writeFileSync(path.join(out, "2-坐席回复.csv"), csv([["编号", "坐席准备发送的回复", "是否必须拦下（是/否）", "理由（可选）"], ...replies.map((r) => [r.id, r.text, "", ""])]))

const sessions = read("sessions-")
const rows = [["会话", "轮次", "消费者这一轮说", "服务记录摘要", "好的回复必须承认的逾期承诺（工单号，可多个）", "不该再问的信息（订单号|照片|批号|经过）", "这一轮说的是哪笔订单", "有没有什么已经安排好了可以说“已安排”（有/没有）", "备注"]]
for (const s of sessions) {
  const summary = [
    ...s.orders.map((o) => `订单 ${o.id}：${o.product} ¥${o.price} ${o.status}`),
    ...s.tickets.map((t) => `工单 ${t.id}（${t.type}，${t.status}${t.dueAt ? `，约定 ${t.dueAt}` : ""}）：${t.summary}${t.promiseLog?.length ? `；答应过 ${t.promiseLog.length} 次` : ""}`),
    ...s.contacts.map((c) => `进线 ${c.at}：${c.lines.join(" / ")}${c.evidence?.length ? `（已提供 ${c.evidence.join("、")}）` : ""}`),
  ].join("\n")
  s.turns.forEach((t, k) => rows.push([s.id, k + 1, t.text, k === 0 ? summary : "（同上）", "", "", "", "", ""]))
}
writeFileSync(path.join(out, "3-多轮会话.csv"), csv(rows))
console.log(`写入 ${out}：消息 ${messages.length} 条、回复 ${replies.length} 条、会话轮次 ${rows.length - 1} 个`)
