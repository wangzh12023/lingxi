import type { CustomerProfile, DraftStyle, EmotionKey, EmotionState, EmotionVector, IntentKey, IntentState, NextBestAction, RiskCategory, RiskLevel, RiskSignal, UnspokenNeed, VisionFinding } from "../types"
import { ABUSE_LEXICON } from "../data"
import { policyFor, sanitizeAction, type PolicyContext } from "../policy"
import { EMOTIONS, EMOTION_ORDER } from "../constants"
import { batchStatus, fmtP } from "../insights"
import { shouldHuddle } from "../huddle"

/**
 * The rule track of perception and planning: 闻 (emotion), 问 (intent, facts), 切 (risk), 策 (actions),
 * 笔 (template drafts), 护 (abuse masking). Deterministic and explainable. It is both the guardrail
 * that always runs beside a model and the whole engine when no model is configured.
 *
 * Its limits are real and worth knowing: keyword lexicons miss paraphrase and sarcasm, and the
 * "unspoken need" rules cover only a handful of sentence shapes.
 */

/* ───────────────────────────── 闻 · emotion ───────────────────────────── */

const EMO_LEXICON: Record<EmotionKey, { words: string[]; w: number }> = {
  anger: { words: ["气死", "气人", "垃圾", "什么玩意", "骗", "投诉", "曝光", "12315", "差评", "离谱", "无语", "太过分", "凭什么", "到底", "搞什么", "黑心", "退钱", "赔", "假货", "不接受", "差太多", "废话", "是不是不想", "必须给", "起诉", "找你们领导"], w: 0.22 },
  anxiety: { words: ["怎么办", "会不会", "害怕", "怕", "担心", "着急", "急", "火辣辣", "刺痛", "红肿", "痒", "还没", "赶不上", "来得及", "后天", "搞砸", "烂脸", "没收到", "怎么少了", "怎么回事", "脱皮", "紧绷", "是不是不适合", "肿"], w: 0.2 },
  sadness: { words: ["算了", "失望", "难过", "伤心", "心寒", "不在乎", "再也不", "可惜", "唉", "懒得", "不会再买", "不会管", "最后一次", "白买", "没什么用"], w: 0.22 },
  grievance: { words: ["凭什么", "明明", "又不是", "我也不是", "委屈", "每次都", "从头", "一遍", "不信", "又是这套", "机器人", "为什么", "都说在处理", "看不到吗"], w: 0.2 },
  calm: { words: ["请问", "想了解", "咨询", "麻烦", "好的", "嗯", "了解", "可以"], w: 0.14 },
  anticipation: { words: ["能不能", "什么时候", "希望", "期待", "想要", "推荐", "适合", "优惠", "想送", "想买", "想给", "想试", "补货", "便宜点"], w: 0.17 },
  joy: { words: ["哈哈", "开心", "好用", "喜欢", "爱了", "太棒", "惊喜", "超好", "感动", "好多了", "回购", "满意", "居然还送"], w: 0.2 },
  gratitude: { words: ["谢谢", "感谢", "辛苦", "麻烦你了", "耐心", "贴心", "服务挺好", "好评", "多谢", "谢啦"], w: 0.26 },
}

/**
 * Sentence shapes that no single word carries: a wait counted out loud, praise that turns into a
 * complaint (sarcasm), a worried “是不是…”. Each adds to one emotion.
 */
const EMO_SHAPES: [EmotionKey, RegExp, number][] = [
  ["anger", /根本(不|没)|服了|破(快递|东西|玩意)|八百遍|自己掂量|别跟我|少一分|给我(退|换|赔|解决)|对我的?.{0,3}负责|做主的人|继续拖|阴阳怪气|有完没完|耍我|忽悠|糊弄/, 0.24],
  ["anger", /(太好了|真好|真棒|真不错|真厉害|真行|可真)[^。！？]{0,6}[，,][^。！？]{0,16}(没|不|还)/, 0.34],
  ["grievance", /没(一个)?人(理|管|联系|回)|答应[^，。]{0,10}(到现在|还|也)没|别人[^，。]{0,8}(都|已经)|不让我|催了[^，。]{0,4}(次|遍|回)|说好的|一次次|又要我/, 0.24],
  ["anxiety", /这?正常吗|对不上|查不到|烧得慌|流泪|冒了?好多|过期|被人?拆过|是真的吗|怎么还没|没见着|没有我的件|会留疤吗|严重吗|要紧吗|要不要紧/, 0.22],
  ["anxiety", /是不是[^，。？?]{1,12}[？?]?$/, 0.18],
  ["sadness", /不想(再)?(等|说|解释|计较|折腾)|一点(效果|用)都没有|认准[^，。]{0,6}年|就这样吧|随便吧|无所谓了/, 0.24],
]
const DURATION = /(\d+|[一二两三四五六七八九十半几]|好多|好几)\s*(天|个?礼拜|个?星期|周|个?月|次|遍|回)/
const UNRESOLVED = /还没|没到|没人|都没|没有|不动|没见|没收到|没退|没回|催/
const QUESTION = /吗|呢|[？?]|怎么|哪|多少|几/

/** Platform names contain symptom characters (小红书 → “红”); blank them before matching symptoms. */
export const normalize = (text: string) => text.replace(/小红书|红书|网红|红包|口红/g, "＿")

/**
 * Words for something the body did after a product was used. The first list is rarely said about
 * anything else. The second is also how people describe their skin in general (泛红, 长痘), so it
 * only counts next to a mention of use.
 */
const SYMPTOM_STRONG = ["过敏", "刺痛", "红肿", "灼热", "灼烧", "火辣辣", "烧得慌", "发烫", "起疹", "红疹", "红点", "烂脸", "痒", "疙瘩", "水泡", "水疱", "流泪", "肿了", "肿得", "肿起", "肿胀", "疼得", "很疼", "好疼", "生疼", "地疼", "辣疼"]
const SYMPTOM_CONTEXT = ["泛红", "发红", "脱皮", "起皮", "紧绷", "闷痘", "爆痘", "长痘", "冒痘", "闭口", "干裂", "发炎", "刺刺的", "不舒服"]
const AFTER_USE = /用了|用完|涂完|涂了|抹上|抹了|擦完|擦了|敷完|敷了|洗完|涂上|用过|用着|上脸|刚用|一用|之后|以后|第二天|一会儿/
const symptomWords = (t: string) => [...SYMPTOM_STRONG, ...(AFTER_USE.test(t) ? SYMPTOM_CONTEXT : [])]
const hasSymptom = (t: string) => symptomWords(t).some((w) => t.includes(w))

/**
 * A symptom word is not always a symptom report. Blank the spans where it is a worry about the
 * future (会不会过敏), a standing trait (我酒精过敏 · 敏感肌容易泛红), a denial (不是过敏) or someone
 * else's story (朋友说她用了过敏); what is left is what happened to this person.
 */
const TRAIT_OR_WORRY = [
  /(会不会|容易|怕|担心|是否会?|有没有可能)[^，。！？]{0,6}(过敏|刺痛|烂脸|致痘|闷痘|爆痘|长痘|泛红|发红|脱皮|刺激|痒)/g,
  /(过敏|刺痛|闷痘|致痘|爆痘|长痘|烂脸|脱皮|泛红)(吗|么|嘛)/g,
  /对[^，。！？]{1,8}过敏|(酒精|香精|花粉|海鲜|芒果|防腐剂|水杨酸|烟酰胺|果酸|激素|紫外线|金属)过敏|过敏(体质|肌|性皮肤|史)|(容易|爱|老是?|经常|总是?|换季)[^，。！？]{0,4}(过敏|泛红|发红|长痘|闷痘|脱皮|起皮)/g,
  /(敏感肌|痘痘肌|油皮|干皮|混油)[^，。！？]{0,6}(泛红|发红|长痘|闷痘|脱皮|起皮)/g,
]
const DENIED_OR_REPORTED = [
  /(不是|没有|没|并非|不算|也不|并不)(过敏|刺痛|红肿|泛红|发红|脱皮|痒|疼)/g,
  /(朋友|同事|闺蜜|同学|别人|网上|有人|听说|评论区?|看到)[^，。！？]{0,12}(过敏|烂脸|红肿|刺痛|爆痘|闷痘|脱皮)/g,
]
export function eventText(raw: string): string {
  let t = normalize(raw)
  for (const re of [...TRAIT_OR_WORRY, ...DENIED_OR_REPORTED]) t = t.replace(re, "＿")
  return t
}
/** The message asks whether a product suits a trait or might cause a reaction — a suitability question. */
const asksSuitability = (raw: string) => TRAIT_OR_WORRY.some((re) => normalize(raw).search(re) >= 0)

const zeroVector = () => Object.fromEntries(EMOTION_ORDER.map((k) => [k, 0])) as EmotionVector

export function emotionVector(text: string): EmotionVector {
  const v = zeroVector()
  for (const k of EMOTION_ORDER) for (const w of EMO_LEXICON[k].words) if (text.includes(w)) v[k] += EMO_LEXICON[k].w
  const bangs = (text.match(/[!！]/g) ?? []).length
  const stacked = (text.match(/[?？]{2,}/g) ?? []).length
  v.anger += Math.min(0.3, bangs * 0.06) + stacked * 0.12
  v.anxiety += Math.min(0.2, bangs * 0.04)
  if (/呵呵|好吧好吧|行吧/.test(text)) {
    v.sadness += 0.2
    v.grievance += 0.15
  }
  for (const [k, shape, w] of EMO_SHAPES) if (shape.test(text)) v[k] += w
  // a wait counted out loud that still has no result
  if (DURATION.test(text) && UNRESOLVED.test(text)) {
    v.anger += 0.2
    v.anxiety += 0.14
  }
  // reported symptoms are worrying even when no worry word is used
  if (hasSymptom(eventText(text))) v.anxiety += 0.18
  // going public, or threatening to, is an angry act however flat the wording
  if (detectPublicity(text)) v.anger += 0.24
  // a plain question with no feeling in it reads as calm, not as eagerness
  if (QUESTION.test(text) && EMOTION_ORDER.every((k) => EMOTIONS[k].valence >= 0 || v[k] === 0)) v.calm += 0.2
  if (EMOTION_ORDER.every((k) => v[k] === 0)) v.calm = 0.3
  for (const k of EMOTION_ORDER) v[k] = Math.min(1, Math.round(v[k] * 100) / 100)
  return v
}

/** How much negative feeling a vector carries: each negative emotion weighted by how negative it is. */
export const heatOf = (v: Partial<EmotionVector>) => EMOTION_ORDER.reduce((s, k) => s + (EMOTIONS[k].valence < 0 ? (v[k] ?? 0) * -EMOTIONS[k].valence : 0), 0)

/**
 * Collapse a vector into the figures the UI shows. This is the only place they are computed,
 * whether the vector came from rules, a script or a model:
 *   dominant   the largest component
 *   intensity  the size of that component
 *   valence    components weighted by each emotion's valence, normalised to −1…+1
 *   trend      change in negative heat since the previous consumer turn (±0.15): rising = heating up
 */
export function summarizeEmotion(raw: Partial<EmotionVector>, prev?: EmotionVector): EmotionState {
  const vector = zeroVector()
  for (const k of EMOTION_ORDER) vector[k] = Math.max(0, Math.min(1, Number(raw[k] ?? 0)))
  let dominant: EmotionKey = "calm"
  for (const k of EMOTION_ORDER) if (vector[k] > vector[dominant]) dominant = k
  const total = EMOTION_ORDER.reduce((s, k) => s + vector[k], 0)
  const valence = total ? Math.round((EMOTION_ORDER.reduce((s, k) => s + vector[k] * EMOTIONS[k].valence, 0) / total) * 100) / 100 : 0
  const delta = prev ? heatOf(vector) - heatOf(prev) : 0
  const trend = delta > 0.15 ? "rising" : delta < -0.15 ? "falling" : "stable"
  return { vector, dominant, intensity: Math.round(vector[dominant] * 100) / 100, valence, trend }
}

/* ───────────────────────────── 问 · intent, facts, unspoken ───────────────────────────── */

/**
 * Intent by weighted evidence. `strong` words name the intent outright (退款, 假货) and count 2;
 * `weak` words merely lean that way (没到, 哪个) and count 1; `shape` is a sentence pattern that
 * counts 2 (先…还是先… is a usage question whatever the nouns are).
 * Tuned on eval/dataset.ts; the blind set in eval/blind/ is never read while tuning.
 */
const INTENT_RULES: { key: IntentKey; strong: string[]; weak: string[]; shape?: RegExp; summary: string }[] = [
  { key: "adverse_reaction", strong: ["过敏", "刺痛", "红肿", "火辣辣", "烂脸", "起疹", "红疹", "红点", "疙瘩", "水泡", "水疱", "发烫", "灼热", "灼烧", "烧得慌", "流泪", "肿了", "肿得", "肿起"], weak: ["泛红", "发红", "痒", "闷痘", "长痘", "爆痘", "紧绷", "疼", "闭口", "起皮", "脱皮", "不舒服"], shape: /(用|涂|抹|擦|敷)[^。！？]{0,14}(冒|起|长|爆)了?[^，。]{0,4}(闭口|痘|疹|包|粉刺)|对我的?脸负责|睁不开|眼睛进了|进了?眼睛/, summary: "反馈使用后皮肤不适" },
  { key: "authenticity", strong: ["假货", "真假", "正品", "假的", "防伪", "鉴定", "高仿", "假一赔", "过期", "生产日期", "保质期"], weak: ["批号", "换配方", "专柜", "质地不一样", "味道不一样", "塑封", "放太久"], shape: /被人?拆过|对不上|比(上次|以前|之前)[^，。]{0,4}(深|浅|稀|稠|淡|浓|小|少)|和(上次|以前|之前)[^，。]{0,8}不一样|二次销售/, summary: "质疑商品真伪或品质" },
  { key: "logistics", strong: ["发货", "物流", "快递", "包裹", "派送", "签收", "中转", "没收到货", "驿站"], weak: ["没到", "到货", "顺丰", "还没到", "送到", "配送"], shape: /指定[^，。]{0,8}(送|到)|(今天|明天|后天|周[一二三四五六日末])[^，。]{0,6}(能|可以)?(送到|到吗|发吗)/, summary: "查询物流进度" },
  { key: "return_refund", strong: ["退货", "退款", "退钱", "换货", "退掉", "退了", "换个色号", "换个", "取消订单", "拒收"], weak: ["不要了", "到账", "换成", "不想要了"], shape: /钱[^，。]{0,6}(没|还没)(退|到)|(给我|帮我)退/, summary: "申请退换或退款" },
  { key: "complaint", strong: ["投诉", "曝光", "12315", "差评", "起诉", "找你们领导", "不接受", "评评理", "太气人", "机器人", "废话", "消协", "避雷", "阴阳怪气"], weak: ["态度", "失望", "不在乎", "品控", "话术", "垃圾", "算了", "不会管", "不想说", "不会再买", "每次都", "重新说", "说法", "博主", "次电话", "什么服务", "记者", "负责"], shape: /找[^，。]{0,4}(领导|主管|负责人|上级|经理)|能做主|没(一个)?人(理|管|回)|答应[^，。]{0,12}(没|不)|别跟我讲|不想再(解释|说)|最后一次|服了|自己掂量|继续拖|(太好了|真好|真棒)[^。]{0,6}[，,][^。]{0,16}(没|不)|就这样吧|懒得(计较|说|管)/, summary: "表达不满或投诉" },
  { key: "product_efficacy", strong: ["功效", "有用吗", "管用", "祛斑", "美白", "淡纹", "抗老", "防水", "见效", "有效果"], weak: ["效果", "能祛", "淡化", "真的能", "够不够", "好用吗", "细纹", "痘印", "毛孔", "不含", "含不含"], shape: /能(不能)?(淡|祛|去|改善|提亮|缩|消|变白|紧致)|多久(能)?(见效|有效|看到)|真的(不含|没有|能)/, summary: "咨询产品功效" },
  { key: "usage_guidance", strong: ["怎么用", "用法", "使用顺序", "哪个先", "先用", "可以直接", "一起用", "叠加", "搭配"], weak: ["顺序", "早晚", "用量", "多久用", "用完"], shape: /先[^，。]{1,6}还是先|几(泵|滴|下|遍|颗)|一次(按|用|挤|涂|抹)|(一天|每天|一周|每周)[^，。]{0,3}(几次|几回|用几)|(早上|晚上|白天)[^，。]{0,6}(可以|能)用|停留|要不要(洗|冲)/, summary: "咨询使用方法" },
  { key: "skin_matching", strong: ["敏感肌", "油皮", "干皮", "混油", "痘痘肌", "肤质", "孕妇", "哺乳", "备孕", "医美", "术后"], weak: ["适合我", "能用吗", "可以用吗", "岁", "偏黄", "温和", "痘痘", "孩子", "宝宝"], shape: /刚(做完|打完|刷完)|(孩子|宝宝|小孩|学生|男生|老人)[^，。]{0,6}(能|可以)?(用|涂|擦)|我(这种|这样的)?(皮肤|肤质)/, summary: "咨询肤质适配" },
  { key: "price_promo", strong: ["优惠", "折扣", "满减", "差价", "划算", "降价", "保价", "赠品", "便宜点"], weak: ["便宜", "券", "活动", "贵", "价格", "包邮", "凑单"], summary: "咨询价格优惠" },
  { key: "membership", strong: ["会员", "积分", "黑金", "金卡", "专属顾问", "生日礼"], weak: ["顾问", "权益", "等级"], summary: "咨询会员权益" },
  { key: "gift_consult", strong: ["礼物", "送人", "送给", "贺卡", "礼盒", "送他", "送她"], weak: ["女朋友", "男朋友", "老婆", "婆婆", "生日", "想送", "当面给"], summary: "送礼相关咨询" },
  { key: "pre_sale_consult", strong: ["推荐", "哪款", "想买", "补货"], weak: ["哪个", "有没有", "区别", "色号", "有吗", "有货"], shape: /什么时候(有货|上架|到货|补)|选哪(个|款|种)/, summary: "售前咨询" },
]

const SEEKING = /哪款|哪个|推荐|适合|有没有|能用吗|可以用吗/
const THANKS = /谢谢|多谢|感谢|辛苦|谢啦/
const SETTLED = /已经收到|收到了|解决了|找到了|没事了|搞定|弄好了|可以了/
const BUT = /但|可是|不过|却|漏|坏|破|少了|错了|不对/

export function analyzeIntent(raw: string): IntentState {
  const text = normalize(raw)
  // symptom words only count when they describe something that happened (see eventText)
  const happened = eventText(raw)
  // thanks for something already settled is small talk, whatever business words it repeats
  if (THANKS.test(text) && SETTLED.test(text) && !QUESTION.test(text) && !BUT.test(text)) return { primary: "other", confidence: 0.8, summary: "致谢或确认" }
  const scores = INTENT_RULES.map((r) => {
    const t = r.key === "adverse_reaction" ? happened : text
    let sc = r.strong.reduce((a, w) => a + (t.includes(w) ? 2 : 0), 0) + r.weak.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0) + (r.shape?.test(t) ? 2 : 0)
    // a symptom word inside a "which one suits me" question describes a skin type, not a reaction
    if (r.key === "adverse_reaction" && sc > 0 && SEEKING.test(text) && !AFTER_USE.test(text)) sc = 0
    // a reaction reported after use outranks whatever else the sentence mentions
    if (r.key === "adverse_reaction" && sc >= 2 && AFTER_USE.test(text)) sc += 2
    // a standing trait or a worry about the future is a suitability question
    if (r.key === "skin_matching" && asksSuitability(raw)) sc += 2
    return { r, s: sc }
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  if (!scores.length) return { primary: "other", confidence: 0.4, summary: "一般性沟通" }
  const [a, b] = scores
  // how decisively the evidence points one way — not a calibrated probability
  const confidence = Math.round(Math.min(0.9, 0.5 + a.s * 0.08 - (b ? b.s * 0.04 : 0)) * 100) / 100
  return { primary: a.r.key, secondary: b?.r.key, confidence, summary: a.r.summary }
}

export const BATCH_CODE = /(?<![A-Za-z0-9])[A-Z]{2}\d{4}[A-Z](?![A-Za-z0-9])/

/** Batch codes in the text, or read off the package by 望. */
export function findBatchCodes(text: string, vision?: VisionFinding): string[] {
  const codes = new Set<string>()
  const t = text.match(BATCH_CODE)?.[0]
  if (t) codes.add(t)
  for (const f of vision?.findings ?? []) {
    const m = f.label.match(BATCH_CODE)?.[0]
    if (m) codes.add(m)
  }
  return [...codes]
}

export function extractFacts(text: string, vision?: VisionFinding): string[] {
  const facts: string[] = []
  const norm = normalize(text)
  for (const code of findBatchCodes(text, vision)) facts.push(`批号：${code}`)
  const days = text.match(/(用了|才用|使用)(了)?([一二三四五六七八九十两\d]+)(天|周|次|个月)/)
  if (days) facts.push(`使用时长：${days[3]}${days[4]}`)
  const sym = ["红", "刺痛", "痒", "脱皮", "起疹", "疙瘩", "灼热", "闭口", "痘"].filter((s) => norm.includes(s))
  if (sym.length) facts.push(`症状 / 诉求：${sym.join("、")}`)
  const when = text.match(/今天|明天|后天|周末|下周/)
  if (when) facts.push(`时间节点：${when[0]}`)
  if (vision && vision.source !== "none") facts.push("已附图片")
  return facts
}

/** A few sentence shapes only. Reading what is not said is a model's job; these are the obvious cases. */
export function inferUnspoken(text: string, intent: IntentKey): UnspokenNeed[] {
  const out: UnspokenNeed[] = []
  const add = (re: RegExp, underlying: string, confidence: number) => {
    const m = text.match(re)
    if (m) out.push({ surface: m[0], underlying, confidence })
  }
  add(/[^，。！？]*(我妈|我爸|妈妈|爸爸|老人|孩子|女儿|儿子)[^，。！？]*/, "对家人安全的担心，往往比对自己更强烈", 0.7)
  add(/[^，。！？]*(算了|没人|不在乎|懒得说)[^，。！？]*/, "放弃的信号：想要的是被重视、被记得", 0.7)
  add(/[^，。！？]*(生日|纪念日|礼物|送人)[^，。！？]*/, "在意的是这份心意能否按时送到", 0.7)
  add(/[^，。！？]*(不是要钱|不是为了钱)[^，。！？]*/, "不想被当成索赔的人，希望被真诚对待", 0.75)
  add(/[^，。！？]*(机器人|这套话术|模板)[^，。！？]*/, "希望对面是一个真的在听的人", 0.7)
  if (!out.length && intent === "adverse_reaction") {
    const m = text.match(/[^，。！？]*(红|刺|痒|肿|疙瘩|脱皮|灼热)[^，。！？]*/)
    if (m) out.push({ surface: m[0], underlying: "最担心的是皮肤会不会留下长久的问题，需要先被安抚", confidence: 0.6 })
  }
  return out.slice(0, 2)
}

/* ───────────────────────────── 切 · risk ───────────────────────────── */

interface RiskRule {
  cat: RiskCategory
  level: RiskLevel
  words: string[]
  /** a sentence pattern that counts like a word hit */
  shape?: RegExp
  title: string
  action: string
  rule: string
}

const RISK_RULES: RiskRule[] = [
  { cat: "safety", level: 2, words: SYMPTOM_STRONG, shape: /(用|涂|抹|擦|敷)[^。！？]{0,14}(冒|起|长|爆)了?[^，。]{0,4}(闭口|痘|疹|包|粉刺)|对我的?脸负责|眼睛进了|进了?眼睛/, title: "疑似化妆品不良反应", action: "先关怀并建议停用，采集报告所需信息，症状持续建议就医", rule: "疑似不良反应接待规范" },
  { cat: "safety", level: 3, words: ["去医院", "住院", "急诊", "水疱", "水泡", "渗出", "流脓", "肿得", "睁不开", "呼吸", "休克", "留疤"], title: "可能为较严重的不良反应", action: "立即升级质量法规部，启动上报评估", rule: "疑似不良反应接待规范 · 第五条" },
  { cat: "legal", level: 2, words: ["12315", "起诉", "法院", "消协", "市场监管", "市监", "工商", "消法", "律师函", "举报", "打官司", "告你们", "走法律"], shape: /(找|请|咨询|联系|问过?)[^，。]{0,3}律师|(做|去|送)[^，。]{0,3}(鉴定|检测)|按(规定|法律|消法)[^，。]{0,6}(赔|退)|退一赔三|假一赔/, title: "提及投诉或法律途径", action: "礼貌坚持流程，承诺以核验结果为准，留存记录", rule: "真伪质疑处理规范" },
  { cat: "churn", level: 2, words: ["再也不", "不买了", "不会再买", "取关", "退会员", "换牌子", "不在乎", "懒得说", "最后一次", "拉黑", "卸载", "换别家", "去别家"], shape: /算了(?![一下算])|懒得(计较|说|管|理)|不想再(解释|说|等|买|折腾)|以后不(会|再)|认准[^，。]{0,6}年|就这样吧/, title: "出现放弃或离开的表述", action: "由更高层级挽回，先让对方感到被记得", rule: "流失信号词" },
  { cat: "fraud", level: 2, words: ["假一赔十", "假一赔三", "退一赔三", "十倍", "三倍赔", "直接赔", "赔偿金", "精神损失"], shape: /赔[^，。]{0,2}[三十3]|(赔|退|补)[^，。]{0,6}[0-9一二两三四五六七八九十]+倍|[0-9一二两三四五六七八九十]+倍[^，。]{0,4}(赔|补偿)|少一分都不行/, title: "索赔话术", action: "不争论法条、不承诺倍数；按真伪核验流程处理，结论以凭证为准", rule: "真伪质疑处理规范 · 惩罚性赔偿的出处" },
  { cat: "minor", level: 2, words: ["高一", "高二", "高三", "初一", "初二", "初三", "初中", "未成年", "小学", "幼儿园", "中学生", "小学生"], shape: /(给|帮)?[^，。]{0,3}(孩子|小孩|宝宝|娃|小朋友)[^，。]{0,10}(用|涂|擦|抹|买|洗)|我今年\s*(1[0-7]|[1-9])(?![0-9月年号日])/, title: "疑似未成年消费者", action: "不推荐含强活性成分的产品；皮肤问题建议监护人陪同就医", rule: "未成年消费者沟通规范" },
  { cat: "privacy", level: 2, words: ["身份证号", "银行卡号"], shape: /(把|发|给|查)[^，。]{0,8}(他|她|别人|其他人|前任|那个人)[^，。]{0,6}(电话|手机号|地址|住址|订单|信息)/, title: "涉及他人或高度敏感的个人信息", action: "不提供他人信息；提醒不要在对话中发送证件号码", rule: "《个人信息保护法》· 敏感个人信息" },
  { cat: "privacy", level: 1, words: ["身份证", "住址", "家庭地址"], title: "涉及敏感个人信息", action: "最小化收集，脱敏展示", rule: "《个人信息保护法》· 敏感个人信息" },
]

type NewSignal = Omit<RiskSignal, "id" | "turn">

/**
 * Publicity is about tense, not vocabulary: “我已经发小红书了” has happened, “再不处理我就发小红书”
 * is a threat. Word lists cannot tell them apart, so this is matched on the markers of completion
 * (已经 / 了 / 评论区) versus intention (就 / 要 / 去 / 再不…).
 */
const PLATFORM = "(小红书|微博|抖音|黑猫|朋友圈|B站|知乎|贴吧)"
const PUBLISHED = new RegExp(`(已经?|早就)[^，。！？]{0,10}(发到|发在|发了|发帖|发小红书|发微博|发抖音|曝光)[^，。！？]{0,8}(了|过)|(发|写|拍)的?[^，。！？]{0,8}(帖|笔记|视频|避雷)[^，。！？]{0,12}(赞|转发|评论|浏览|播放|收藏|热度|火了)|全网都在(说|传|骂)|都在(传|转)|发了${PLATFORM}|${PLATFORM}[^，。！？]{0,8}(发了|发过|发帖了|上发帖了|已经发)|评论区|跟帖|上热搜了|热搜`)
const THREAT = new RegExp(`(就|要|去|会|准备|打算|别怪我)[^，。！？]{0,6}(发${PLATFORM}|曝光|找媒体|找记者|发帖|挂出来|发出去|发出来)|(博主|自媒体)[^，。！？]{0,14}(发|曝光)|(认识|联系|找)[^，。！？]{0,6}(记者|媒体|电视台|报社)|让大家(都)?看看|曝光你们|找媒体|找记者`)

export function detectPublicity(text: string): NewSignal | undefined {
  const pub = text.match(PUBLISHED)
  if (pub) return { category: "pr", level: 3, title: "内容已经公开传播", evidence: `文本命中：“${pub[0]}”`, rule: "舆情分级：已公开", action: "公关介入统一口径；不要求删帖", origin: "rule" }
  const thr = text.match(THREAT)
  if (thr) return { category: "pr", level: 2, title: "威胁公开曝光", evidence: `文本命中：“${thr[0]}”`, rule: "舆情分级：扬言公开", action: "保持礼貌与透明，不被威胁左右，所有承诺以核验为准", origin: "rule" }
}

export interface RiskContext {
  vision?: VisionFinding
  customer?: Pick<CustomerProfile, "tier" | "ltv" | "churnRisk" | "claims">
  valence: number
  /** batch codes seen so far in the conversation, including this turn */
  batchCodes: string[]
}

/** Text rules plus data lookups for one consumer turn. Merging across turns is `mergeRisk`. */
export function detectRisk(text: string, ctx: RiskContext): NewSignal[] {
  const norm = normalize(text)
  const out: NewSignal[] = []

  // symptom words count only where they describe something that happened to this person
  const happened = eventText(text)
  for (const r of RISK_RULES) {
    const symptoms = r.cat === "safety" && r.level === 2
    const t = symptoms ? happened : norm
    const hit = (symptoms ? symptomWords(t) : r.words).filter((w) => t.includes(w))
    const shaped = r.shape ? t.match(r.shape)?.[0] : undefined
    if (shaped && !hit.some((h) => shaped.includes(h))) hit.push(shaped)
    if (hit.length) out.push({ category: r.cat, level: r.level, title: r.title, evidence: `文本命中：${hit.map((h) => `“${h}”`).join("、")}`, rule: r.rule, action: r.action, origin: "rule" })
  }

  const publicity = detectPublicity(text)
  if (publicity) out.push(publicity)

  // an explicit age under 18 — the school-year word list above cannot cover “我女儿 12 岁”
  const age = text.match(/(\d{1,2})\s*周?岁/)
  if (age && Number(age[1]) < 18 && !out.some((o) => o.category === "minor")) {
    out.push({ category: "minor", level: 2, title: "疑似未成年消费者", evidence: `文本命中：“${age[0]}”`, rule: "未成年消费者沟通规范", action: "不推荐含强活性成分的产品；皮肤问题建议监护人陪同就医", origin: "rule" })
  }
  // 12 and under is the age range of 《儿童化妆品监督管理规定》第三条
  const minor = out.find((o) => o.category === "minor")
  if (minor && ((age && Number(age[1]) <= 12) || /小学|幼儿园|宝宝/.test(text))) {
    minor.title = "使用者可能是 12 岁及以下儿童"
    minor.rule = "《儿童化妆品监督管理规定》第三条"
    minor.action = "只推荐包装上有儿童化妆品标志的产品；祛痘、抗皱、祛斑美白不在儿童化妆品的功效范围内"
  }

  // 望 → 切: what the image shows raises or confirms a safety signal
  const v = ctx.vision
  if (v && v.source !== "none" && v.severity !== "none") {
    out.push({
      category: "safety",
      level: (v.severity === "severe" ? 3 : 2) as RiskLevel,
      title: `图片显示${{ mild: "轻度", moderate: "中度", severe: "重度" }[v.severity]}皮肤反应`,
      evidence: `望：${v.summary}`,
      rule: "图文交叉验证",
      action: "结合图片评估严重程度，不做医学判断",
      origin: v.source === "model" ? "model" : "script",
    })
  }

  // 察 → 切: a batch code in the conversation is looked up against complaint data
  for (const code of ctx.batchCodes) {
    const b = batchStatus(code)
    if (!b || b.status === "normal") continue
    out.push({
      category: "safety",
      level: b.status === "anomaly" ? 4 : 2,
      title: b.status === "anomaly" ? `批次 ${b.batch} 反馈异常集中` : `批次 ${b.batch} 反馈偏高`,
      evidence: `察：近 72 小时同类反馈 ${b.complaints72h} 起，平日约 ${b.baseline} 起（${b.ratio} 倍，泊松检验 ${fmtP(b.pValue)}）`,
      rule: `批次预警：${b.status === "anomaly" ? "p < 0.001" : "p < 0.05"}`,
      action: b.status === "anomaly" ? "发起跨部门会诊，评估对该批次采取预防性措施" : "提醒质量法规部关注该批次",
      origin: "data",
    })
  }

  // 忆 → 切: what the customer record already says
  const c = ctx.customer
  if (c?.claims && c.claims.last90d >= 3) {
    out.push({ category: "fraud", level: 2, title: "档案显示多次关联索赔", evidence: `忆：同设备关联 ${c.claims.accounts} 个账号，近 90 天索赔 ${c.claims.last90d} 次`, rule: "风控关联记录", action: "按流程核验，转风控中心复核", origin: "data" })
  }
  if (c && c.churnRisk >= 0.6 && ctx.valence < -0.3) {
    out.push({
      category: "churn",
      level: 3,
      title: `${c.tier === "新客" ? "" : c.tier}会员流失风险高`,
      evidence: `忆：流失评分 ${c.churnRisk}，累计消费 ¥${c.ltv.toLocaleString()}；本轮情绪效价 ${ctx.valence}`,
      rule: "流失评分 ≥ 0.6 且本轮情绪为负",
      action: "由资深顾问或店长挽回",
      origin: "data",
    })
  }

  return out
}

/** Refusing to provide proof after being asked is itself a signal — but only in a claim conversation. */
export function detectRefusal(text: string, prior: RiskSignal[]): NewSignal | undefined {
  if (!prior.some((s) => s.category === "fraud")) return
  const m = text.match(/没空[^，。]*拍|不拍|不提供|凭什么给你|直接赔|不用核验|懒得拍/)
  if (!m) return
  return { category: "fraud", level: 3, title: "拒绝提供凭证并坚持赔付", evidence: `文本命中：“${m[0]}”；此前已出现索赔信号`, rule: "真伪质疑处理规范", action: "坚持以凭证为准，全程留痕，转风控中心复核", origin: "rule" }
}

/**
 * Risk is cumulative: a signal raised earlier stays open until an agent deals with it, so the level
 * never drops just because the consumer's next message is calmer. Same category + same title is
 * the same signal; the higher level wins.
 */
/**
 * Risk accumulates per event: signals about the same problem (same `eventKey`) merge into one —
 * highest level wins, every piece of evidence is kept — so a model calling the same thing by a
 * different title does not count it twice. An event raised once stays until a person closes or
 * corrects it; a calmer tone does not make it go away.
 */
export function mergeRisk(prior: RiskSignal[], fresh: NewSignal[], turn: number): { level: RiskLevel; signals: RiskSignal[] } {
  const keyOf = (s: Pick<RiskSignal, "category" | "title" | "eventKey">) => s.eventKey ?? `${s.category}|${s.title}`
  const byKey = new Map<string, RiskSignal>()
  for (const s of prior) byKey.set(keyOf(s), { ...s, evidenceList: s.evidenceList ?? [s.evidence] })
  for (const s of fresh) {
    const key = keyOf(s)
    const old = byKey.get(key)
    if (!old) {
      byKey.set(key, { ...s, id: `${s.category}-${turn}-${byKey.size}`, turn, evidenceList: [s.evidence] })
      continue
    }
    const evidenceList = old.evidenceList!.includes(s.evidence) ? old.evidenceList! : [...old.evidenceList!, s.evidence].slice(-4)
    // a verified signal at the same level replaces an unverified one; a higher level replaces a lower one
    const upgrade = s.level > old.level || (s.level === old.level && old.unverified && !s.unverified)
    byKey.set(key, upgrade ? { ...old, ...s, id: old.id, turn: old.turn, evidenceList } : { ...old, evidenceList })
  }
  const rank = { data: 0, model: 1, script: 2, rule: 3 } as const
  const signals = [...byKey.values()].sort((a, b) => b.level - a.level || rank[a.origin] - rank[b.origin] || a.turn - b.turn)
  return { level: (signals[0]?.level ?? 0) as RiskLevel, signals }
}

/* ───────────────────────────── 护 · abuse masking ───────────────────────────── */

export function maskAbuse(text: string): { masked: string; hits: string[] } {
  const hits: string[] = []
  let masked = text
  for (const w of ABUSE_LEXICON) {
    if (masked.includes(w)) {
      hits.push(w)
      masked = masked.split(w).join("▢".repeat(w.length))
    }
  }
  return { masked, hits }
}

/* ───────────────────────────── 笔 · template drafts ───────────────────────────── */

const OPENERS: Record<EmotionKey, string> = {
  anger: "真的非常抱歉让您有这样的体验，您的不满我完全理解。",
  anxiety: "先别着急，我在这里，我们一起尽快把这件事处理好。",
  sadness: "看到您这么说，我心里挺不是滋味的，是我们做得不够好。",
  grievance: "您说得对，这件事不该让您受委屈。",
  calm: "很高兴为您服务。",
  anticipation: "好的，我来帮您看看。",
  joy: "听到您这么说真开心！",
  gratitude: "谢谢您的理解和信任！",
}

const BODY: Partial<Record<IntentKey, Record<DraftStyle, string>>> = {
  adverse_reaction: {
    warm: "请先停用这款产品，用清水轻轻冲洗，暂时别叠加其他功效型护肤品。方便告诉我开始使用的时间、用量，以及产品批号吗？如果不适持续或加重，建议尽快去医院皮肤科看看，合理的就医费用我们会协助处理，每一步我都会陪您一起。",
    professional: "建议您立即停用并用清水冲洗。为了准确评估，请提供：1）开始使用的日期与频次；2）同期使用的其他产品；3）产品批号。如症状持续，请及时就医，合理的就医费用我们会协助处理。",
    concise: "请先停用并用清水冲洗，麻烦发我批号和开始使用的时间，我马上跟进。",
  },
  logistics: {
    warm: "我马上帮您查物流，并联系仓库加急处理。如果时间紧，可以为您改派顺丰，运费由我们承担，有任何进展我第一时间告诉您。",
    professional: "已为您查询订单的物流状态，并申请仓库加急。如需改派顺丰，运费由品牌承担；送达时间为预计，以物流信息为准。",
    concise: "我马上查物流并加急，可以改派顺丰，运费我们承担。",
  },
  return_refund: {
    warm: "完全理解，我这就帮您办理。请问方便告诉我订单号和退货的原因吗？我确认之后马上为您提交申请。",
    professional: "可以为您办理。请提供订单号与退货原因，核对后为您提交退款申请，进度我会同步给您。",
    concise: "可以办理，麻烦发我订单号和退货原因。",
  },
  authenticity: {
    warm: "理解您的担心，我们会认真核实。麻烦您提供一下防伪码和批号的照片，还有订单号，我们通过品牌溯源系统核验后尽快给您明确的答复。",
    professional: "请提供外包装防伪码与瓶身批号的照片，以及订单号。我们将通过品牌溯源系统核验，结论以核验结果为准。",
    concise: "请发防伪码、批号的照片和订单号，核验后尽快答复您。",
  },
  complaint: {
    warm: "您反馈的问题我已经详细记下，会由专人跟进到底，处理的进展我会主动同步给您，不让您反复来催。",
    professional: "您的反馈已记录并转交专人跟进，我们会主动向您同步处理进展。",
    concise: "已记录并转专人跟进，有进展我主动告诉您。",
  },
}

const FALLBACK: Record<DraftStyle, string> = {
  warm: "我来帮您仔细看看这个问题，方便再多告诉我一些具体情况吗？有任何需要随时告诉我，我一直在。",
  professional: "已收到您的问题。为了准确答复，请补充一下具体情况，我们核实后尽快回复您。",
  concise: "收到，麻烦再说一下具体情况，我马上处理。",
}

/**
 * A template must not ask for what the record already has. The order number is replaced by naming the
 * order the turn is about; photos, batch codes and “what happened” already given are acknowledged
 * instead of requested. With several orders and no way to tell which one, the reply asks which order
 * — that is a question the record cannot answer, not a re-ask.
 */
export interface KnownForDraft {
  order?: { id: string; product?: string }
  ambiguous?: { id: string; product: string }[]
  photos?: boolean
  batch?: string
  story?: boolean
}
function withoutReask(t: string, k: KnownForDraft = {}): string {
  let out = t
  if (k.photos) out = out.replace(/麻烦您提供一下(外包装)?防伪码(、|和)(瓶身)?批号的照片(和订单号)?/, "您发来的照片我这边已经看到了").replace(/请提供(外包装)?防伪码(与|和)(瓶身)?批号的照片(，以及订单号)?/, "您之前发来的照片已收到").replace(/请发防伪码(、|和)批号的照片(和订单号)?/, "照片已收到")
  if (k.batch) out = out.replace(/(以及|和)?产品批号/, "").replace(/麻烦发我批号和/, "麻烦说一下").replace(/(？|，)3）产品批号/, "$1")
  if (k.story) out = out.replace(/方便再多告诉我一些具体情况吗？/, "您之前说的情况我都看到了。").replace(/请补充一下具体情况，/, "").replace(/麻烦再说一下具体情况，/, "")
  const order = k.order
  if (!order) {
    if (k.ambiguous && k.ambiguous.length > 1 && /订单号/.test(out)) {
      const which = k.ambiguous.slice(0, 3).map((o) => o.product).join("还是")
      return out.replace(/请问方便告诉我订单号和退货的原因吗？|请提供订单号与退货原因，|麻烦发我订单号和退货原因。/, `您说的是${which}？`)
    }
    return out
  }
  return out
    .replace(/请问方便告诉我订单号和退货的原因吗？/, `订单 ${order.id} 我这边已经看到了，方便说一下退货的原因吗？`)
    .replace(/请提供订单号与退货原因，/, `订单 ${order.id} 已核对，请补充退货原因，`)
    .replace(/麻烦发我订单号和退货原因。/, `订单 ${order.id} 已看到，麻烦说下退货原因。`)
    .replace(/，还有订单号，/, `（订单 ${order.id} 我这边已经看到了），`)
    .replace(/，以及订单号。/, `；订单 ${order.id} 已核对。`)
    .replace(/和订单号，/, "，")
}

/** Opener for the emotion + body for the intent. Covers the common intents; anything else gets a holding reply. */
export function draftReplies(intent: IntentKey, emotion: EmotionKey, customerName?: string, known: KnownForDraft = {}): Record<DraftStyle, string> {
  const body = BODY[intent] ?? FALLBACK
  const call = customerName ? `${customerName}，` : ""
  return {
    warm: withoutReask(`${call}${OPENERS[emotion]}${body.warm}`, known),
    professional: withoutReask(`${customerName ? `${customerName}您好，` : "您好，"}${body.professional}`, known),
    concise: withoutReask(`${call}${body.concise}`, known),
  }
}

/* ───────────────────────────── 策 · actions & whisper ───────────────────────────── */

export function planActions(intent: IntentKey, level: RiskLevel, categories: RiskCategory[]): Omit<NextBestAction, "id">[] {
  const acts: Omit<NextBestAction, "id">[] = []
  if (shouldHuddle(level, categories)) acts.push({ kind: "escalate", title: "发起跨部门会诊", detail: "按风险归属召集相关部门", impact: "形成带责任部门的决议" })
  if (intent === "adverse_reaction" || categories.includes("safety")) {
    acts.push({ kind: "verify", title: "采集五项信息", detail: "批号、开始时间、用法、症状、过敏史", impact: "为研判提供依据" })
    acts.push({ kind: "compensation", title: "就医费用协助", detail: "凭病历与票据", cost: 800, impact: "减轻顾虑" })
    acts.push({ kind: "report", title: "录入不良反应监测", detail: "内部规范 24 小时内录入；法定报告时限一般 30 日、严重 15 日", impact: "合规留痕" })
  }
  if (intent === "logistics") acts.push({ kind: "followup", title: "加急并改派顺丰", detail: "运费由品牌承担", cost: 23, impact: "争取时效" })
  if (intent === "return_refund") acts.push({ kind: "verify", title: "核对订单并提交退款", detail: "确认订单号与原因", impact: "减少来回" })
  if (intent === "authenticity" || categories.includes("fraud")) acts.push({ kind: "verify", title: "溯源核验", detail: "防伪码、批号与订单比对", impact: "以凭证为准" })
  if (categories.includes("churn")) acts.push({ kind: "escalate", title: "资深顾问挽回", detail: "先交接档案，再联系", impact: "让对方感到被记得" })
  if (categories.includes("minor")) acts.push({ kind: "education", title: "启用未成年人沟通规范", detail: "不推荐强活性成分，建议监护人陪同", impact: "保护未成年人" })
  if (!acts.length) acts.push({ kind: "followup", title: "直接解答", detail: "答完再问一句还有什么可以帮忙", impact: "一次说清" })
  return acts.slice(0, 4)
}

/**
 * Fill in what policy decides for every action: approver and basis come from policy.ts and nothing
 * else — whatever a model, a script or a client put in `approver` is discarded with the other
 * unknown fields. Exactly one action is primary.
 */
export function finalizeActions(acts: unknown[], ctx: PolicyContext = {}): NextBestAction[] {
  const clean = acts.map(sanitizeAction).filter((a): a is Omit<NextBestAction, "id"> => a !== null).slice(0, 4)
  const primaryIdx = Math.max(0, clean.findIndex((a) => a.primary))
  return clean.map((a, i) => {
    const p = policyFor(a, ctx)
    return { ...a, id: `a${i}`, approver: p.approver, policy: { basis: p.basis, blocked: p.blocked }, primary: i === primaryIdx }
  })
}

const WHISPER_HINT: Record<EmotionKey, string> = {
  anger: "先让对方感到被认真对待，再谈方案。",
  anxiety: "给确定性：谁在处理、什么时候有结果。",
  sadness: "别急着补偿，先让对方感到被重视。",
  grievance: "先承认对方的委屈，再解释。",
  calm: "信息清楚、一次说全，就是最好的服务。",
  anticipation: "给出明确的节点，同时守住承诺的边界。",
  joy: "顺势把关系走近一步，但不要推销。",
  gratitude: "信任在恢复，接下来兑现承诺就好。",
}

export function composeWhisper(emotion: EmotionKey, unspoken: UnspokenNeed[], level: RiskLevel, huddle: boolean): string {
  const u = unspoken[0]
  if (huddle) return `风险已到 L${level}${u ? `：${u.underlying}` : ""}。先稳住情绪，同时发起跨部门会诊。`
  if (u && u.confidence >= 0.7) return `${u.underlying}。${WHISPER_HINT[emotion]}`
  return WHISPER_HINT[emotion]
}
