import { EMOTION_ORDER } from "./constants"
import type { EmotionKey } from "./types"

/**
 * 察 · Insighter — the data behind the insights cockpit and the sentinel's batch lookup.
 *
 * Everything in this file is SIMULATED: complaint counts, emotion shares, topics and operational
 * counters are invented for the demo (seeded, so every render is identical). What is real is the
 * arithmetic on top of them — the Poisson test, the alert thresholds, the alert time — which is
 * computed here and nowhere typed by hand. The file makes no before/after claims about the product:
 * no pilot has been run, so there is no measured effect to report.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Poisson upper tail P(X ≥ k | λ): how surprising k complaints are when λ is normal. */
export function poissonTail(k: number, lambda: number) {
  let term = Math.exp(-lambda)
  let cdf = term
  for (let i = 1; i < k; i++) {
    term *= lambda / i
    cdf += term
  }
  return Math.max(0, 1 - cdf)
}

/** Smallest k with P(X ≥ k | λ) < α — the count at which a batch becomes statistically unusual. */
export function poissonThreshold(lambda: number, alpha: number) {
  let k = Math.max(1, Math.ceil(lambda))
  while (poissonTail(k, lambda) >= alpha && k < 500) k++
  return k
}

export const ALPHA_WATCH = 0.05
export const ALPHA_ALERT = 0.001

export interface BatchStat {
  batch: string
  product: string
  /** same-symptom complaints in the last 72 hours, and the usual 72-hour count (Poisson λ) */
  complaints72h: number
  baseline: number
  ratio: number
  pValue: number
  status: "anomaly" | "watch" | "normal"
  topSymptom: string
}

export const BATCHES: BatchStat[] = [
  { batch: "LX2608A", product: "AURELLE A 醇精华", complaints72h: 17, baseline: 3.8, topSymptom: "刺痛 / 泛红" },
  { batch: "LX2607C", product: "AURELLE A 醇精华", complaints72h: 5, baseline: 4.1, topSymptom: "轻微刺痛" },
  { batch: "UV2608D", product: "AURELLE 轻透防晒乳", complaints72h: 8, baseline: 3.2, topSymptom: "搓泥" },
  { batch: "MB2609A", product: "MISTRAL B5 修护霜", complaints72h: 2, baseline: 2.4, topSymptom: "闷痘" },
  { batch: "LM2609B", product: "LUMINELLE 柔焦气垫", complaints72h: 4, baseline: 3.6, topSymptom: "色号偏差" },
  { batch: "VD2608C", product: "VERDAN 头皮精华", complaints72h: 1, baseline: 1.2, topSymptom: "气味" },
].map((r) => {
  const pValue = poissonTail(r.complaints72h, r.baseline)
  return { ...r, ratio: Math.round((r.complaints72h / r.baseline) * 10) / 10, pValue, status: pValue < ALPHA_ALERT ? "anomaly" : pValue < ALPHA_WATCH ? "watch" : "normal" }
})

/** The sentinel's data lookup: what do we know about this batch code right now? */
export function batchStatus(code: string): BatchStat | undefined {
  return BATCHES.find((b) => b.batch === code.toUpperCase())
}

export const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`)

/**
 * The anomalous batch in detail: complaints per 4-hour bucket over 7 days, and the rolling 72-hour
 * total the Poisson test runs on. The last rolling total equals the batch's `complaints72h` by
 * construction (asserted below), so the chart and the table can never disagree.
 */
export const FOCUS_BATCH = BATCHES[0]
export const BATCH_BASELINE = FOCUS_BATCH.baseline
export const BATCH_WATCH = poissonThreshold(BATCH_BASELINE, ALPHA_WATCH)
export const BATCH_ALERT = poissonThreshold(BATCH_BASELINE, ALPHA_ALERT)

const TIMELINE_START = new Date(2026, 9, 5) // 2026-10-05 00:00
const BUCKET_HOURS = 4

export const BATCH_TIMELINE = (() => {
  const warmUp = [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0] // the 3 days before the chart
  const shown = [
    0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, // 10/5 – 10/8: usual level
    0, 1, 0, 1, 1, 1, 1, 2, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, // 10/9 – 10/11: the surge
  ]
  const all = [...warmUp, ...shown]
  return shown.map((count, i) => {
    const at = new Date(TIMELINE_START.getTime() + i * BUCKET_HOURS * 3600000)
    const rolling = all.slice(i + 1, i + 19).reduce((a, b) => a + b, 0) // 18 buckets = 72 h
    return {
      t: `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, "0")}:00`,
      count,
      rolling,
      p: poissonTail(rolling, BATCH_BASELINE),
      state: (rolling >= BATCH_ALERT ? "alert" : rolling >= BATCH_WATCH ? "watch" : "normal") as "alert" | "watch" | "normal",
    }
  })
})()

if (BATCH_TIMELINE.at(-1)!.rolling !== FOCUS_BATCH.complaints72h) throw new Error("insights: timeline and batch table disagree")

export const BATCH_ALERT_AT = BATCH_TIMELINE.findIndex((d) => d.state === "alert")

/**
 * How much earlier the automatic alert fires than a weekly manual review would.
 * The comparison point is an assumption, stated in the UI: a quality review every Monday at 10:00.
 */
export const WEEKLY_REVIEW_AT = new Date(2026, 9, 12, 10, 0)
export const BATCH_LEAD_HOURS = Math.round((WEEKLY_REVIEW_AT.getTime() - (TIMELINE_START.getTime() + BATCH_ALERT_AT * BUCKET_HOURS * 3600000)) / 3600000)

/** Share of each emotion across all conversations, per day for 14 days. */
export const EMOTION_WEATHER = (() => {
  const rand = mulberry32(1011)
  const days: ({ day: string } & Record<EmotionKey, number>)[] = []
  for (let i = 13; i >= 0; i--) {
    const date = new Date(2026, 9, 11 - i)
    const surge = i < 3 ? (3 - i) * 0.035 : 0
    const base: Record<EmotionKey, number> = {
      anger: 0.07 + surge * 0.8 + rand() * 0.02,
      anxiety: 0.15 + surge + rand() * 0.03,
      sadness: 0.06 + rand() * 0.02,
      grievance: 0.06 + rand() * 0.02,
      calm: 0.34 - surge * 1.2 + rand() * 0.04,
      anticipation: 0.15 + rand() * 0.03,
      joy: 0.09 + rand() * 0.02,
      gratitude: 0.08 + rand() * 0.02,
    }
    const sum = EMOTION_ORDER.reduce((s, k) => s + base[k], 0)
    const row = { day: `${date.getMonth() + 1}/${date.getDate()}` } as { day: string } & Record<EmotionKey, number>
    for (const k of EMOTION_ORDER) row[k] = Math.round((base[k] / sum) * 1000) / 10
    days.push(row)
  }
  return days
})()

/** Preset topics. No clustering algorithm runs in this build — this is what its output would look like. */
export const TOPICS = [
  { topic: "A 醇耐受期刺痛", volume: 482, sentiment: -0.58, trend: [12, 14, 13, 18, 22, 41, 66], owner: "研发 · 质量" },
  { topic: "双 11 预售物流", volume: 1240, sentiment: -0.31, trend: [80, 92, 110, 140, 170, 190, 220], owner: "供应链" },
  { topic: "防晒搓泥", volume: 356, sentiment: -0.22, trend: [40, 44, 46, 48, 50, 52, 55], owner: "研发" },
  { topic: "气垫色号偏差", volume: 298, sentiment: -0.18, trend: [48, 46, 45, 42, 40, 39, 38], owner: "产品" },
  { topic: "会员顾问交接", volume: 164, sentiment: -0.44, trend: [10, 12, 15, 18, 22, 25, 30], owner: "会员运营" },
  { topic: "礼盒手写卡", volume: 410, sentiment: 0.72, trend: [30, 34, 40, 48, 55, 60, 70], owner: "品牌" },
]

/** Risk handling this week, as ordered stages. */
export const RISK_FUNNEL = [
  { stage: "风险信号", value: 1284 },
  { stage: "L2 预警", value: 312 },
  { stage: "L3 及以上", value: 37 },
  { stage: "发起会诊", value: 6 },
  { stage: "决议闭环", value: 5 },
]

/** Operational counters a live deployment would track. Simulated; none of them measures an effect of the product. */
export const COUNTERS = {
  conversations: 12846,
  highRisk: RISK_FUNNEL[2].value,
  huddles: RISK_FUNNEL[3].value,
  draftsAdopted: 0.83, // share of replies that started from a draft
  draftsEdited: 0.41, // of those, share the agent edited before sending
  blockedBeforeSend: 219,
}

export const HEAT = (() => {
  const rand = mulberry32(77)
  const rows: { day: string; hour: number; value: number }[] = []
  for (const [di, day] of ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].entries()) {
    for (let h = 8; h <= 23; h++) {
      const peak = Math.exp(-((h - 21) ** 2) / 8) * 0.9 + Math.exp(-((h - 12) ** 2) / 6) * 0.5
      rows.push({ day, hour: h, value: Math.round((0.12 + peak + (di >= 5 ? 0.25 : 0) + rand() * 0.25) * 100) / 100 })
    }
  }
  return rows
})()

/** 护 · emotional load of the team on shift (the agent side of 双向共情). */
export const TEAM_LOAD = [
  { name: "南栀", stress: 74, hard: 9, shielded: 31 },
  { name: "青柠", stress: 58, hard: 6, shielded: 18 },
  { name: "知夏", stress: 44, hard: 3, shielded: 9 },
  { name: "阿澈", stress: 38, hard: 3, shielded: 11 },
  { name: "一诺", stress: 29, hard: 1, shielded: 5 },
]

/** The figures the weekly brief is written from — also what is sent to the model when one is configured. */
export function briefFacts() {
  const n = EMOTION_WEATHER.length
  const sorted = [...TOPICS].sort((a, b) => a.sentiment - b.sentiment)
  return {
    batch: FOCUS_BATCH,
    alertAt: BATCH_TIMELINE[BATCH_ALERT_AT].t,
    anxietyRise3d: Math.round((EMOTION_WEATHER[n - 1].anxiety - EMOTION_WEATHER[n - 4].anxiety) * 10) / 10,
    calmDrop3d: Math.round((EMOTION_WEATHER[n - 4].calm - EMOTION_WEATHER[n - 1].calm) * 10) / 10,
    worstTopic: sorted[0],
    bestTopic: sorted.at(-1)!,
    watch: BATCHES.filter((b) => b.status === "watch"),
  }
}

/** The weekly brief assembled from the figures above by a template. A configured model can rewrite it. */
export function buildBrief() {
  const f = briefFacts()
  return [
    `**本周最大风险**：${f.batch.product}批次 **${f.batch.batch}** 近 72 小时同类反馈 ${f.batch.complaints72h} 起，是平日水平的 **${f.batch.ratio} 倍**（泊松检验 ${fmtP(f.batch.pValue)}），${f.alertAt} 触发预警。${f.watch.length ? `另有 ${f.watch.map((b) => b.batch).join("、")} 反馈偏高，列入关注。` : ""}`,
    `**情绪变化**：全渠道“焦虑”占比 3 天内上升 **${f.anxietyRise3d} 个百分点**，“平静”同期下降 ${f.calmDrop3d} 个百分点。情绪最低的话题是“${f.worstTopic.topic}”（效价 ${f.worstTopic.sentiment}），最高的是“${f.bestTopic.topic}”（效价 +${f.bestTopic.sentiment}）。`,
    "**建议**",
    `1. **研发**：复检 ${f.batch.batch} 时，把耐受期的正常反应与异常反应分开统计，并核查包材密封。`,
    "2. **产品**：在 A 醇产品的详情页与包装上增加“建立耐受”的图示。",
    "3. **供应链**：预售期间优先发出带“生日 / 纪念日”备注的订单。",
  ].join("\n")
}
