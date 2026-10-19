import { INTENTS } from "../constants"
import type { EmotionState, IntentKey, IntentState, RiskLevel } from "../types"

/**
 * 省 · the router. Before any model is called, the rule engine has already read the turn (it runs
 * anyway, as the guardrail). The router uses that reading to decide how much model the turn needs:
 *
 *   fast  0 calls   small talk — templates are enough
 *   lite  1 call    a low-stakes question the rules read with confidence: the cheaper model checks the
 *                   reading and writes the drafts in one call; if it flags a risk the turn goes up to full
 *   full  1 call    anything with risk, negative feeling, an image, or a reading the rules are not
 *                   sure of: the main model reads and drafts in one call; a second call only when
 *                   verification blocks a draft (generate → verify → repair)
 *
 * The router only ever sends a turn *down* when the rules positively recognise it. Whatever they
 * cannot read goes to the main model — a missed risk costs far more than the tokens saved. And only
 * small talk is kept from every model: the lite route still has a model looking for risk.
 */
export type Route = "fast" | "lite" | "full"

export const ROUTES: Record<Route, { cn: string; calls: number; desc: string }> = {
  fast: { cn: "规则直达", calls: 0, desc: "寒暄、致谢、确认。规则和模板足够，不调用模型" },
  lite: { cn: "轻量", calls: 1, desc: "规则有把握的低风险咨询。快速模型一次完成复核与起草；它发现风险就升级到主模型" },
  full: { cn: "完整", calls: 1, desc: "有风险、有负面情绪、有图片，或规则没有把握。主模型一次完成研判与起草；核验不通过时再修正一次" },
}
export const ROUTE_ORDER: Route[] = ["fast", "lite", "full"]

/** Intents where a wrong reading is cheap and the knowledge base usually holds the answer. */
const LOW_STAKES: IntentKey[] = ["logistics", "usage_guidance", "price_promo", "membership", "pre_sale_consult", "gift_consult", "product_efficacy", "skin_matching"]
/** One strong keyword with no competing reading scores 0.66 (see analyzeIntent). */
export const LITE_CONFIDENCE = 0.66

const ACK = /好的?|嗯+|哦+|噢|ok|行|可以|知道了|明白了?|了解了?|收到了?|谢谢|多谢|感谢|辛苦(了|啦)?|没事了?|你好|您好|在吗|哈+|麻烦(你|您)?了|小姐姐|亲|啦|呀|哒|滴|那|吧|的|了/gi
/** Nothing is left once acknowledgements and punctuation are removed. */
export const isSmallTalk = (text: string) => text.replace(ACK, "").replace(/[\s，。！？~、,.!?…]/g, "").length <= 1

/**
 * A deliberately broad screen. The rules above find risk when it is phrased the way they expect; this
 * finds any mention of the things risk is usually about — a person other than the writer, a body,
 * money owed, a public platform, the law, leaving — however it is phrased. A message that touches any
 * of them goes to the main model even when no risk rule fired. It trades savings for safety on purpose.
 * (Added after the first blind run showed 3 of 49 risky messages taking the lite route; it was written
 * from that single figure, without reading the messages. The first run is kept in eval/router-first.json.)
 */
const SENSITIVE_CUE =
  /孩子|小孩|宝宝|娃|女儿|儿子|侄|外甥|弟弟|妹妹|学生|同学|年级|岁|未成年|孕|哺乳|老人|他的|她的|别人|老公|老婆|前任|脸|皮肤|眼|嘴|唇|痒|红|肿|痛|疼|刺|痘|疹|敏|赔|补偿|损失|费用|医药|钱|网上|平台|发帖|曝光|评论|博主|粉丝|媒体|记者|投诉|举报|律师|法|监管|工商|消协|最后|不再|再也|算了|别家|身份证|地址|电话|手机号/

export interface RouteInput {
  text: string
  /** the rule engine's reading of this turn */
  intent: IntentState
  emotion: EmotionState
  /** highest level among this turn's rule and data signals */
  signalLevel: RiskLevel
  /** risk level carried over from earlier turns */
  priorLevel: RiskLevel
  hasImage: boolean
}

export interface RouteDecision {
  route: Route
  reason: string
}

export function routeTurn(x: RouteInput): RouteDecision {
  const full = (reason: string): RouteDecision => ({ route: "full", reason })
  if (x.hasImage) return full("本轮有图片")
  if (x.signalLevel >= 1) return full("规则或业务数据发现了风险信号")
  if (x.priorLevel >= 2) return full("这次会话此前已有 L2 以上的风险")
  if (x.emotion.valence < -0.15) return full("情绪偏负面")
  if (x.intent.primary === "other") return isSmallTalk(x.text) || x.intent.confidence >= 0.8 ? { route: "fast", reason: "寒暄、致谢或确认" } : full("规则没有读出意图")
  if (!LOW_STAKES.includes(x.intent.primary)) return full(`“${INTENTS[x.intent.primary].cn}”一律完整研判`)
  if (SENSITIVE_CUE.test(x.text)) return full("提到了人、身体、钱、平台或法律，交给主模型把关")
  if (x.intent.confidence < LITE_CONFIDENCE) return full("规则对意图的把握不足")
  return { route: "lite", reason: "规则有把握的低风险咨询" }
}
