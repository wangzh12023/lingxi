import type { ComplianceIssue, Product, ReplyScore, RubricCheck } from "../types"

/**
 * 检 · Auditor — the rule track. Pure functions, no network: the composer runs them on every
 * keystroke, the pipeline runs them on every draft, the academy runs them on every trainee reply.
 *
 * Two things live here:
 *   checkCompliance / applyFixes   what must not be said, and a safe rewrite where one exists
 *   scoreReply                     a transparent rubric — each point traces back to a named check
 */

interface Rule {
  id: string
  pattern: RegExp
  /** a hit is ignored when the text before it in the same clause matches this (e.g. a negation) */
  unlessBefore?: RegExp
  reason: string
  suggestion: string
  /** safe replacement: a fixed string, or computed from the matched phrase */
  fix?: string | ((phrase: string) => string)
  /** replace just the phrase (default) or the whole clause it sits in */
  scope?: "phrase" | "clause"
  severity: "warn" | "block"
  /** do not flag when the sentence around the match denies, quotes or conditions the statement */
  unlessSentence?: RegExp
}

const NEGATION = /(不|没|无|未|别|非|勿|避免|不要|不能|不得|不可)[^，。；！？\n]{0,6}$/

const MEDICAL_SWAP: Record<string, string> = {
  治疗: "护理",
  治愈: "改善",
  根治: "改善",
  疗效: "效果",
  消炎: "舒缓",
  抗炎: "舒缓",
  杀菌: "清洁",
  抑菌: "清洁",
  药妆: "护肤品",
  医学护肤: "专业护肤",
  处方: "配方",
}

const SUPERLATIVE_SWAP: Record<string, string> = {
  最好: "很好",
  最佳: "很好",
  最强: "很强",
  最有效: "有效",
  最安全: "安全性良好",
  顶级: "高品质",
  顶尖: "高品质",
  万能: "多用途",
  无敌: "出色",
  独一无二: "独特",
  全网最低: "优惠",
}

const RULES: Rule[] = [
  {
    id: "diagnosis",
    pattern: /(这|您|你|应该|肯定|明显|估计|看起来|属于)[^，。；！？\n]{0,6}(就是|是|属于)[^，。；！？\n]{0,4}(过敏|皮炎|湿疹|感染|激素脸|烂脸|荨麻疹|痤疮|毛囊炎|真菌|玫瑰痤疮|癣|疱疹)|(看着|看起来|看上去|看样子|像是?|典型的?|应该是|估计是|多半是|八成是)[^，。；！？\n]{0,4}(过敏|皮炎|湿疹|感染|激素脸|烂脸|荨麻疹|痤疮|毛囊炎|真菌|玫瑰痤疮|癣|疱疹)|(不是|没有|并非)过敏|(涂|抹|擦|吃|用)点?[^，。；！？\n]{0,4}(药膏|激素|抗过敏药|消炎药|抗生素)/g,
    unlessSentence: /是否|是不是|(不能|无法|没法|不好|不便)(判断|确定|诊断|下结论)|(您|你)(说|提到|反馈|描述)|医生(说|诊断|判断|认为)|如果|若/,
    reason: "坐席不做医学判断",
    suggestion: "只描述看到的情况，建议停用并咨询皮肤科医生",
    fix: "您描述的情况我们非常重视，建议先停用并咨询皮肤科医生",
    scope: "clause",
    severity: "block",
  },
  {
    id: "shift-blame",
    pattern: /(不是|并非|绝不是|不属于)[^，。；！？\n]{0,6}(我们|产品|品牌|质量)[^，。；！？\n]{0,4}(问题|原因|责任)|(与|和|跟)(我们|产品|品牌)[^，。；！？\n]{0,4}(无关|没关系)|(我们|产品|东西|货|品牌)[^，。；！？\n]{0,8}(不可能|不会)有(任何)?(质量)?问题/g,
    unlessSentence: /核(查|验|实)(结果)?(出来)?(之)?前|(不能|无法|没法|不会)(判断|确定|下结论|断言)|如果|若/,
    reason: "核查之前不下结论，更不推卸责任",
    suggestion: "承诺核查，结论以核查结果为准",
    fix: "我们会认真核查产品与批次，给您一个负责任的答复",
    scope: "clause",
    severity: "block",
  },
  {
    id: "blame-customer",
    pattern: /(你|您)[^，。；！？\n]{0,5}(用错|用法不对|方法不对|方式不对|使用不当|操作不当|没看说明|自己的问题|自身原因)|(?<![不非])是(你|您)[^，。；！？\n]{0,4}(问题|原因)|(肯定|一定|应该|估计|多半|明显)是(你|您)[^，。；！？\n]{0,14}(才|导致|造成|引起)|(因为|由于)(你|您)[^，。；！？\n]{0,10}(才|导致|所以)|是(你|您)(自己|个人|自身)?的?(肤质|体质)/g,
    unlessSentence: /不是(你|您)|并非(你|您)|不怪(你|您)|(不能|无法|没法)(判断|确定|下结论)/,
    reason: "不指责消费者，先关怀后核实",
    suggestion: "改为一起查找原因",
    fix: "我们一起来看看使用的情况，帮您找到原因",
    scope: "clause",
    severity: "block",
  },
  {
    id: "absolute-safety",
    pattern: /(绝对|百分百|百分之百|100%|完全|肯定|一定|保证)[^，。；！？\n]{0,4}(安全|没问题|无刺激|不刺激|不会过敏|不过敏|无副作用|没有副作用|有效|见效|没事)|零刺激|无任何副作用|没有任何副作用|保证[^，。；！？\n]{0,6}(没有|不会|无|没)[^，。；！？\n]{0,6}(副作用|问题|过敏|刺激)|不可能过敏|用了(也)?(完全|绝对|肯定)?没事/g,
    unlessSentence: /(不能|无法|没法|不敢|不可以|不会)(向您|跟您|给您|对您)?(保证|承诺|担保|说)|没有(任何)?产品(能|可以)/,
    reason: "不作绝对化的安全或效果承诺",
    suggestion: "说明产品经过安全评估，同时每个人的肌肤状况不同",
    fix: "产品经过安全评估，但每个人的肌肤状况不同",
    scope: "clause",
    severity: "block",
  },
  {
    id: "medical-claim",
    pattern: /治疗|治愈|根治|疗效|消炎|抗炎|杀菌|抑菌|药妆|医学护肤|处方/g,
    unlessBefore: NEGATION,
    reason: "化妆品不得明示或暗示医疗作用",
    suggestion: "改用“舒缓”“改善肌肤状态”等表述",
    fix: (p) => MEDICAL_SWAP[p] ?? "",
    severity: "block",
  },
  {
    id: "delete-review",
    pattern: /(删|撤|改|下)[^。；！？\n]{0,4}(评价|差评|帖子|笔记|投诉|视频)[^。；！？\n]{0,14}(退|赔|补偿|送|券|就|才)|(评价|差评|帖子|笔记|投诉|视频)[^。；！？\n]{0,4}(删|撤|改|下架)[^。；！？\n]{0,14}(退|赔|补偿|送|券|就|才)|(退|赔|补偿|送|券)[^。；！？\n]{0,14}(删|撤|改)[^。；！？\n]{0,4}(评价|差评|帖子|笔记|投诉|视频)|(好评|五星|晒图)[^，。；！？\n]{0,8}(返现|返|红包|送|赠|券|礼)/g,
    unlessSentence: /不会要求|不要求|不需要|无需|不用|无关|不影响|不以|不作为/,
    unlessBefore: /(不会|不需要|无需|不用|绝不|不以)[^，。；！？\n]{0,10}$/,
    reason: "不以补偿为条件要求删除评价或撤回投诉",
    suggestion: "去掉这个条件，补偿与评价无关",
    fix: "处理方案与您的评价无关，我们会按流程为您办理",
    scope: "clause",
    severity: "block",
  },
  {
    id: "superlative",
    // 永久性 describes a consumer's fear (“永久性损伤”), not a claim
    pattern: /最好|最佳|最强|最有效|最安全|第一|顶级|顶尖|史上|永久(?!性)|万能|无敌|独一无二|全网最低/g,
    unlessBefore: /(不是|并非|没有|不会|不留)[^，。；！？\n]{0,6}$/,
    reason: "不使用绝对化用语",
    suggestion: "改用“很受欢迎”“口碑不错”等可以核实的表述",
    fix: (p) => SUPERLATIVE_SWAP[p] ?? "",
    severity: "warn",
  },
  {
    id: "delivery-promise",
    pattern: /(保证|一定|肯定|绝对|百分百|必定)[^，。；！？\n]{0,8}(到|送达|收到|发出|签收)|(今天|明天|后天|今晚|明早|\d+\s*[点号日])[^，。；！？\n]{0,6}(一定|肯定|保证|必定)[^，。；！？\n]{0,2}(到|送达|收到)/g,
    reason: "送达时间只说“预计”，不承诺具体时刻",
    suggestion: "说明预计时间，并以物流信息为准",
    fix: (p) => p.replace(/保证|一定|肯定|绝对|百分百|必定/, "预计").replace(/预计([^，。；！？\n]*)预计/, "预计$1"),
    severity: "warn",
  },
  {
    id: "phone",
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    reason: "疑似明文手机号，存在隐私泄露风险",
    suggestion: "使用脱敏格式，如 138****5678",
    fix: (p) => `${p.slice(0, 3)}****${p.slice(7)}`,
    severity: "warn",
  },
]

/** Phrases that contain a flagged word but mean something harmless. */
const SAFE_PHRASES = /第一时间|第一步|第一句|第一位|第一次|第一天/g

/** Efficacy words a reply might use → the filed efficacy category that would have to cover them. */
const EFFICACY: { pattern: RegExp; category: string; word: string }[] = [
  { pattern: /祛痘|去痘|治痘|消痘|抗痘|战痘|祛闭口|去闭口/g, category: "祛痘", word: "祛痘" },
  { pattern: /美白|祛斑|淡斑|去斑/g, category: "祛斑美白", word: "美白祛斑" },
  { pattern: /防脱|生发|育发|增发/g, category: "防脱发", word: "防脱生发" },
]

export interface AuditContext {
  /** the catalogue product under discussion — efficacy words are checked against its filed claims */
  product?: Product
}

const BREAKS = ["，", "。", "；", "！", "？", "\n"]
const clauseStart = (text: string, i: number) => Math.max(0, ...BREAKS.map((p) => text.lastIndexOf(p, i - 1) + 1))
const clauseEnd = (text: string, i: number) => {
  const nexts = BREAKS.map((p) => text.indexOf(p, i)).filter((x) => x !== -1)
  return nexts.length ? Math.min(...nexts) : text.length
}

export function checkCompliance(text: string, ctx: AuditContext = {}): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  const safe = [...text.matchAll(SAFE_PHRASES)].map((m) => [m.index, m.index + m[0].length] as const)
  const inSafe = (i: number) => safe.some(([a, b]) => i >= a && i < b)
  const before = (i: number) => text.slice(clauseStart(text, i), i)
  const sentence = (i: number) => {
    const ends = ["。", "；", "！", "？", "\n"]
    const a = Math.max(0, ...ends.map((p) => text.lastIndexOf(p, i - 1) + 1))
    const nexts = ends.map((p) => text.indexOf(p, i)).filter((x) => x !== -1)
    return text.slice(a, nexts.length ? Math.min(...nexts) : text.length)
  }

  for (const r of RULES) {
    for (const m of text.matchAll(r.pattern)) {
      if (inSafe(m.index) || r.unlessBefore?.test(before(m.index)) || r.unlessSentence?.test(sentence(m.index))) continue
      const replace = typeof r.fix === "function" ? r.fix(m[0]) || undefined : r.fix
      issues.push({ id: `${r.id}@${m.index}`, ruleId: r.id, phrase: m[0], index: m.index, reason: r.reason, suggestion: r.suggestion, replace, scope: r.scope ?? "phrase", severity: r.severity })
    }
  }

  // Efficacy beyond what the product is filed for. Negated mentions (“不建议用它来祛痘”) are fine.
  for (const e of EFFICACY) {
    for (const m of text.matchAll(e.pattern)) {
      if (NEGATION.test(before(m.index))) continue
      const p = ctx.product
      if (p?.claims.includes(e.category)) continue
      issues.push({
        id: `efficacy@${m.index}`,
        ruleId: "efficacy",
        phrase: m[0],
        index: m.index,
        reason: p ? `${p.name.split(" ")[0]}的备案功效是${p.claims.join("、")}，不含“${e.category}”` : `“${e.word}”属于特殊功效宣称，需要与产品备案一致`,
        suggestion: "不宣称未备案的功效；可以说明产品的备案功效，或建议咨询皮肤科医生",
        scope: "phrase",
        severity: "block",
      })
    }
  }

  return issues.sort((a, b) => a.index - b.index)
}

/**
 * Apply every available safe replacement. Spans are computed on the original text and merged
 * when they overlap (a clause replacement swallows any phrase inside it), then applied right to
 * left. The result is re-checked, so `remaining` is what is actually still wrong.
 */
export function applyFixes(text: string, ctx: AuditContext = {}): { text: string; fixed: number; remaining: ComplianceIssue[] } {
  const issues = checkCompliance(text, ctx)
  const spans = issues
    .filter((it) => it.replace !== undefined)
    .map((it) => ({
      start: it.scope === "clause" ? clauseStart(text, it.index) : it.index,
      end: it.scope === "clause" ? clauseEnd(text, it.index + it.phrase.length) : it.index + it.phrase.length,
      replace: it.replace!,
    }))
    .sort((a, b) => a.start - b.start)

  const merged: typeof spans = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (!last || s.start >= last.end) {
      merged.push({ ...s })
      continue
    }
    const sIsWider = s.end - s.start > last.end - last.start
    const parts = [...new Set(sIsWider ? [s.replace, last.replace] : [last.replace, s.replace])]
    last.start = Math.min(last.start, s.start)
    last.end = Math.max(last.end, s.end)
    last.replace = parts.length > 1 && (s.end - s.start > 4 || last.end - last.start > 4) ? parts.join("，") : parts[0]
  }

  let out = text
  for (const s of [...merged].reverse()) out = out.slice(0, s.start) + s.replace + out.slice(s.end)
  out = out.replace(/([，。；！？])[，。；]+/g, "$1").replace(/^[，。；]+/, "")
  return { text: out, fixed: merged.length, remaining: checkCompliance(out, ctx) }
}

/* ───────────────────────────── rubric ───────────────────────────── */

const has = (text: string, re: RegExp) => re.test(text)

/**
 * Scores a reply on four dimensions, 0–100 each. Deliberately simple and fully inspectable:
 *   empathy / professional   40, plus 15 for each of four behaviours present
 *   compliance               100, minus 45 per blocking issue and 15 per warning
 *   efficiency               by length: 40–160 characters is the comfortable range
 * The overall score cannot exceed the compliance score. The rubric checks behaviours, not the
 * quality of the wording — it cannot tell a moving sentence from a flat one.
 */
export function scoreReply(text: string, ctx: AuditContext & { issues?: ComplianceIssue[] } = {}): ReplyScore {
  const t = text.trim()
  const issues = ctx.issues ?? checkCompliance(t, ctx)
  const opening = t.slice(0, 40)

  const checks: RubricCheck[] = [
    { dim: "empathy", label: "开头先回应感受", pass: has(opening, /理解|抱歉|对不起|心疼|难受|难过|遗憾|着急|担心|辛苦|不好意思|谢谢|感谢|别急|别担心|开心|高兴|放心|我懂|明白您/) },
    { dim: "empathy", label: "承认对方的处境", pass: has(t, /一定很|肯定很|确实|换作是我|您说得对|你说得对|是我们(做得)?不|我们的问题|没做好|让您|让你|不该让|道歉/) },
    { dim: "empathy", label: "表达会跟进到底", pass: has(t, /我会|我来|我在|陪您|陪你|一直在|随时找我|随时联系|跟进|盯着|第一时间/) },
    { dim: "empathy", label: "称呼对方", pass: has(t, /[一-龥](小姐|女士|先生|同学)|阿姨|您/) },
    { dim: "professional", label: "给出明确的下一步", pass: has(t, /请先|请您|建议|麻烦您|可以先|我们会|我会|(为您|帮您)(重新)?(安排|指派|办理|提交|申请)|已(经)?(为您|帮您)?(安排|提交|申请|联系|登记|启动|收到|揽收)/) },
    { dim: "professional", label: "说明时间或节点", pass: has(t, /\d+\s*(小时|分钟|天|个工作日)|今天|明天|今晚|本周|周末|预计|尽快|马上|立即|第一时间/) },
    { dim: "professional", label: "采集或核对信息", pass: has(t, /批号|订单号|防伪码|照片|截图|哪天|什么时候|多久|用量|频次|方便告诉|方便提供|麻烦提供|请提供|档案/) },
    { dim: "professional", label: "方案具体可执行", pass: has(t, /停用|冲洗|就医|皮肤科|退款|退货|换货|顺丰|加急|核验|复检|回访|顾问|小样|贺卡|洁面/) },
  ]

  const dim = (d: RubricCheck["dim"]) => 40 + 15 * checks.filter((c) => c.dim === d && c.pass).length
  const compliance = Math.max(0, 100 - issues.reduce((s, i) => s + (i.severity === "block" ? 45 : 15), 0))
  const n = [...t].length
  const efficiency = n < 12 ? 40 : n < 40 ? 70 : n <= 160 ? 95 : n <= 220 ? 80 : 60

  const empathy = dim("empathy")
  const professional = dim("professional")
  const overall = Math.min(compliance, Math.round(empathy * 0.35 + professional * 0.3 + compliance * 0.25 + efficiency * 0.1))
  return { empathy, professional, compliance, efficiency, overall, checks }
}
