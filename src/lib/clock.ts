import { DEMO_NOW } from "./dataset"

/**
 * Time, in one place. Two clocks exist and are never mixed up:
 *   · the demo clock — the "now" of the service data (pinned to 2026-10-11 10:00) plus however far an
 *     operator has advanced it to show deadlines passing; every SLA, due date and reminder uses it
 *   · the wall clock — when an operator actually clicked; written into the operation log
 * Functions that depend on "now" take it as a parameter, so tests can inject any moment.
 */
export const DEMO_EPOCH = DEMO_NOW

export const demoNow = (offsetMs = 0) => new Date(DEMO_EPOCH.getTime() + offsetMs)

const pad = (n: number) => String(n).padStart(2, "0")
/** Local wall time without a zone, the format the dataset uses: 2026-10-11T10:00. */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const addHours = (at: string | Date, hours: number) => new Date(new Date(at).getTime() + hours * 3600000)

export const hoursBetween = (from: string | Date, to: string | Date) => (new Date(to).getTime() - new Date(from).getTime()) / 3600000

/** 10 月 11 日 18:00 */
export const fmtDemo = (at: string | Date) => {
  const d = new Date(at)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
