/**
 * Reporting deadlines for cosmetic adverse reactions.
 * 《化妆品不良反应监测管理办法》（国家药监局公告 2022 年第 16 号）第二十三条: counted from the day the
 * reaction was found or learned of — 一般 30 日, 严重 15 日, 可能引发较大社会影响 3 日.
 * Which tier a case falls in is decided by the quality & regulatory team. What this file does is a
 * first screen on the consumer's own words, so the agent knows which clock may be running.
 */
export const ADR_REPORT_DAYS = { general: 30, serious: 15, social: 3 } as const
export type AdrTier = keyof typeof ADR_REPORT_DAYS

export const ADR_TIER_CN: Record<AdrTier, string> = { general: "一般", serious: "严重", social: "可能引发较大社会影响" }
export const ADR_SOURCE = "《化妆品不良反应监测管理办法》第二十三条"

/** The demo brand's own rule (fictional): log the case within 24 hours of first learning of it. */
export const ADR_INTERNAL_HOURS = 24

/** Cues for 第四十四条's "严重" — hospitalisation, systemic harm, lasting disfigurement, threat to life. */
const SERIOUS = /住院|休克|抢救|危及生命|留疤|瘢痕|疤痕|毁容|永久|肝功能|肾功能/

export interface AdrScreen {
  tier: AdrTier
  days: number
  /** the consumer's words that moved the screen to 严重, if any */
  cue?: string
  /** same-batch reports are clustering: the 3-day tier has to be ruled in or out by people */
  clusterReview: boolean
}

export function screenAdr(consumerTexts: string[], opts: { cluster?: boolean } = {}): AdrScreen {
  const cue = consumerTexts.map((t) => t.match(SERIOUS)?.[0]).find(Boolean)
  const tier: AdrTier = cue ? "serious" : "general"
  return { tier, days: ADR_REPORT_DAYS[tier], cue, clusterReview: !!opts.cluster }
}
