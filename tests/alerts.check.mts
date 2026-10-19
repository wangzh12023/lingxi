// Prints what the alert rules find in the service dataset, and checks the planted patterns are all found.
import { ALERT_ORDER, ALERT_TYPES, STATUS_CN, detectAlerts } from "../src/lib/alerts"
import { ALL_CUSTOMERS, CONTACTS, ORDERS, TICKETS } from "../src/lib/dataset"

const alerts = detectAlerts()
console.log(`dataset: ${ALL_CUSTOMERS.length} customers · ${ORDERS.length} orders · ${TICKETS.length} tickets · ${CONTACTS.length} contacts`)
console.log(`alerts: ${alerts.length}`)
for (const t of ALERT_ORDER) {
  const list = alerts.filter((a) => a.type === t)
  const by = (s: string) => list.filter((a) => a.status === s).length
  console.log(`  ${ALERT_TYPES[t].cn.padEnd(6, "　")} ${String(list.length).padStart(2)}  (${STATUS_CN.open} ${by("open")} · ${STATUS_CN.processing} ${by("processing")} · ${STATUS_CN.closed} ${by("closed")})`)
}
for (const a of alerts.slice(0, 6)) console.log(`  e.g. L${a.level} ${ALERT_TYPES[a.type].cn} · ${a.customer?.name ?? "—"} · ${a.title} · ${a.evidence.slice(0, 40)}`)

// planted in dataset.ts: 6 repeat-contact, 4 repeat-refund, 3 pr, 3 adverse customers; plus 陈女士's overdue promise
const want = { repeat_contact: 6, repeat_refund: 4, pr: 3, adverse: 3, promise: 1 } as const
let bad = 0
for (const [k, n] of Object.entries(want)) {
  const got = alerts.filter((a) => a.type === k).length
  if (got < n) {
    bad++
    console.log(`MISSED: ${k} expected ≥ ${n}, found ${got}`)
  }
}
const normals = ALL_CUSTOMERS.filter((c) => c.id.startsWith("G-")).slice(16)
const falsePos = alerts.filter((a) => a.customer && normals.some((c) => c.id === a.customer!.id))
if (falsePos.length) console.log(`alerts on customers planted as normal: ${falsePos.map((a) => `${a.type}/${a.customer!.name}/${a.evidence.slice(0, 24)}`).join(" | ")}`)
console.log(bad ? `${bad} planted pattern(s) missed` : "all planted patterns found")
process.exit(bad ? 1 : 0)
