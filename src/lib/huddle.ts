import type { CustomerProfile, HuddleCase, HuddleResolution, HuddleRole, HuddleRoleId, HuddleScript, HuddleTurn, Insight, RiskCategory } from "./types"

/**
 * 议 · cross-department huddle.
 *
 * Seats are not fixed: a case convenes the departments that own its risk categories.
 * A roundtable's discussion comes from one of three places, and the UI always says which:
 *   llm       a configured model debates the case with the convened seats
 *   script    a hand-written roundtable for a rehearsed demo case
 *   composed  role × risk templates, so any case gets a relevant discussion offline
 * Consensus is never taken from a script or a model — it is computed from the seats' stances.
 */

export const HUDDLE_ROLES: HuddleRole[] = [
  { id: "moderator", name: "议", title: "会诊主持", color: "#16151c", stance: "引导讨论、收敛共识" },
  { id: "cs", name: "叶 · 客服体验官", title: "消费者服务中心", color: "#d0688b", stance: "代表消费者的感受与服务承诺" },
  { id: "qa", name: "陆 · 质量法规官", title: "质量法规部", color: "#e04b3f", stance: "产品安全、批次追溯、上报" },
  { id: "legal", name: "沈 · 法务顾问", title: "法务部", color: "#4f71ac", stance: "法律责任、证据保全、表述风险" },
  { id: "pr", name: "苏 · 品牌公关", title: "品牌公关部", color: "#d3a72f", stance: "舆情走向、对外口径" },
  { id: "rnd", name: "顾 · 研发科学家", title: "研发与创新中心", color: "#319a56", stance: "配方机理、复检方案" },
  { id: "crm", name: "乔 · 会员运营官", title: "会员运营部", color: "#ab79e4", stance: "会员关系、流失挽回" },
  { id: "risk", name: "程 · 风控分析师", title: "风控中心", color: "#40b1ba", stance: "异常索赔、关联账号" },
]

export const HUDDLE_ROLE_MAP = Object.fromEntries(HUDDLE_ROLES.map((r) => [r.id, r])) as Record<HuddleRoleId, HuddleRole>

/** Which departments own which risk category — this is what decides who gets a seat. */
const OWNERS: Record<RiskCategory, HuddleRoleId[]> = {
  safety: ["qa", "rnd"],
  regulatory: ["qa", "legal"],
  pr: ["pr", "legal"],
  legal: ["legal"],
  churn: ["crm"],
  fraud: ["risk", "legal"],
  privacy: ["legal"],
  minor: ["qa"],
  service: [], // handled inside customer service; never convenes a roundtable by itself
}

/** Categories that need several departments to act. A late parcel at L3 does not need a roundtable. */
const HUDDLE_CATEGORIES: RiskCategory[] = ["safety", "regulatory", "pr", "legal", "churn", "fraud"]

/** The trigger, in one place: level L3 or above, carried by a signal in a category that needs several departments. */
export function shouldHuddle(level: number, categories: RiskCategory[]) {
  return level >= 3 && categories.some((c) => HUDDLE_CATEGORIES.includes(c))
}

const STANCE_WEIGHT = { support: 1, caution: 0.5, neutral: 0.5, oppose: 0 } as const

/** Consensus = mean of each seat's final stance (赞同 1 · 审慎 0.5 · 反对 0); the moderator does not vote. */
export function consensusOf(turns: HuddleTurn[]) {
  const last = new Map<string, NonNullable<HuddleTurn["stance"]>>()
  for (const t of turns) if (t.role !== "moderator") last.set(t.role, t.stance ?? "neutral")
  if (!last.size) return 0
  return Math.round(([...last.values()].reduce((s, st) => s + STANCE_WEIGHT[st], 0) / last.size) * 100) / 100
}

/** Stable, readable case id: the customer number plus the turn that raised it. */
export const caseIdFor = (customerId: string, turn: number) => `H-${customerId.replace(/\D/g, "").slice(-4).padStart(4, "0")}-${turn}`

type CaseSource = Pick<Insight, "turn" | "intent" | "risk"> & Partial<Pick<Insight, "vision" | "unspoken" | "citations">>

export function buildCase(customer: Pick<CustomerProfile, "id" | "name" | "tier" | "historySummary">, ins: CaseSource, scenarioId?: string): HuddleCase {
  const signals = ins.risk.signals.filter((s) => s.level >= 2)
  const categories = [...new Set(signals.map((s) => s.category))]
  const roles: HuddleRoleId[] = ["cs"]
  for (const c of categories) for (const r of OWNERS[c]) if (!roles.includes(r)) roles.push(r)
  const evidence = [
    ...(ins.vision && ins.vision.source !== "none" && ins.vision.severity !== "none" ? [`望：${ins.vision.summary}`] : []),
    ...signals.map((s) => (/^(察|忆|望)：/.test(s.evidence) ? s.evidence : `切：${s.title}（${s.evidence}）`)),
    ...(ins.citations?.length ? [`典：${ins.citations.map((c) => c.title).join("；")}`] : []),
  ]
  const top = signals[0]
  return {
    id: caseIdFor(customer.id, ins.turn),
    title: top?.title ?? ins.intent.summary,
    level: ins.risk.level,
    summary: `${customer.tier === "新客" ? "新客" : `${customer.tier}会员`}${customer.name}：${ins.intent.summary}。${customer.historySummary}`,
    evidence: [...new Set(evidence)].slice(0, 6),
    roles: roles.slice(0, 5),
    categories,
    hint: ins.unspoken?.[0]?.underlying,
    scenarioId,
  }
}

/* ── offline composer: role × risk-category templates, with one designed disagreement ── */

export function composeHuddle(c: HuddleCase): HuddleScript {
  const has = (r: HuddleRoleId) => c.roles.includes(r)
  const cat = (k: RiskCategory) => c.categories.includes(k)
  const turns: HuddleTurn[] = []
  const say = (role: HuddleRoleId, stance: NonNullable<HuddleTurn["stance"]>, text: string, refs: string[] = []) => turns.push({ id: `c${turns.length + 1}`, role, stance, text, refs })
  const seats = c.roles.map((r) => HUDDLE_ROLE_MAP[r].title).join("、")
  const hint = c.hint ?? "被认真对待"
  // only facts already in the case file may be cited — the composer never invents a figure
  const onFile = (prefix: string, re: RegExp) => c.evidence.find((e) => e.startsWith(prefix) && re.test(e))?.slice(2)

  say("moderator", "neutral", `会诊开始。个案：${c.title}，风险 L${c.level}。本次召集${seats}，目标是形成带责任部门和时限的决议。`)

  if (has("qa")) {
    if (cat("safety")) {
      const batch = onFile("察：", /批次|反馈/)
      say("qa", "caution", `先按疑似不良反应登记，补齐批号、使用时长和症状三项信息。${batch ? `批次数据显示：${batch}。` : ""}症状持续就建议客户就医。内部 24 小时内完成登记；法定报告时限按一般 30 日、严重 15 日、可能引发较大社会影响 3 日执行。`, ["疑似不良反应接待规范"])
    } else say("qa", "caution", "回复里不能出现医疗化宣称和绝对化用语，发送前我来过一遍。", ["功效宣称要点"])
  }
  if (has("rnd")) say("rnd", "caution", "先别急着定性。活性成分在建立耐受期间本来就可能刺痛，要和异常反应分开看。我可以安排留样复检，同时查包材密封和运输温控记录。", ["产品资料"])
  if (has("risk")) {
    const record = onFile("忆：", /索赔|关联/)
    say("risk", "oppose", `${record ? `档案里有记录：${record}。` : "这次的索赔方式很像模板化操作。"}我的建议是直接拒赔，并把设备列入黑名单。`, ["关联记录"])
  }
  const published = c.evidence.some((e) => e.includes("内容已经公开传播"))
  if (has("pr")) {
    if (published) say("pr", "oppose", "内容已经公开，沉默的代价比回应高。我不同意等结论出来再说话，建议今天就用官方账号回应：不删帖、不辩解，说明正在核查。", ["舆情分级"])
    else say("pr", "caution", "目前只是威胁要曝光，内容还没有公开。不必被威胁左右，但每句回复都要经得起截图：礼貌、流程透明、不承诺金额。", ["舆情分级"])
  }
  if (has("legal")) {
    if (has("risk")) say("legal", "caution", "不能因为怀疑就直接拒赔，那样反而给对方留下把柄。按真伪核验流程走，结论以凭证为准，全程留痕；核验结果出来之前不承诺任何金额。", ["真伪质疑处理规范"])
    else if (has("pr")) say("legal", "caution", "可以主动回应，但对外不承认因果关系，用“预防性措施”这类表述。另外绝不能拿补偿换删帖，沟通记录全部留存。", ["真伪质疑处理规范"])
    else say("legal", "caution", "所有承诺都以核验结果为准，不当场答应金额，会话记录完整保留。", [])
  }
  if (has("crm")) {
    say("crm", "support", "这位客户的流失风险很高。我的方案是发一张大额挽回券，再寄一份礼盒。", ["流失评分"])
    say("cs", "oppose", `我不同意发券。潜台词分析的判断是：${hint}。这时候发一张券过去，只会让客户觉得又是一套模板。`, ["问 · 潜台词"])
    say("crm", "support", "有道理。那改成指派一位资深顾问，先把会员档案完整交接，再由店长在 48 小时内致电。")
    say("cs", "support", "同意。我先把这位客户的历史记录整理成一页，第一句话就让对方知道我们记得。")
  } else if (has("risk")) {
    say("cs", "support", "从服务的角度补充：结论出来之前，对方仍然是我们的消费者。回复里不指控、不质疑，把核验说成对所有消费者负责的流程。", ["真伪质疑处理规范"])
  } else {
    say("cs", "support", `补充消费者的视角。潜台词分析的判断是：${hint}。回复里先回应这一点，再谈流程和方案。`, ["问 · 潜台词"])
  }
  if (has("risk")) say("risk", "support", "同意法务的意见。那就标记为待复核，核验完成前坐席保持礼貌、不让步，我同步整理关联证据。")
  if (has("pr") && has("legal")) say("pr", "support", published ? "可以接受。我来准备统一口径，核查结论出来后再做第二次回应。" : "同意。我先备好一份口径，万一对方公开发布，可以第一时间回应。")

  const decision =
    cat("safety") && cat("pr")
      ? "先关怀、后定性：登记不良反应并核查批次，对外真诚回应，不以补偿换沉默。"
      : cat("safety")
        ? "按不良反应流程处理：先关怀并建议停用，补齐信息后评估上报与复检。"
        : cat("fraud")
          ? "按真伪核验流程处理：以凭证为准，核验完成前不承诺赔付，全程留痕。"
          : cat("churn")
            ? "用“被记得”替代“发券”：指派资深顾问并完整交接档案，店长致电。"
            : cat("pr")
              ? "主动、克制地公开回应：不删帖、不辩解，核查结论出来后再次说明。"
              : "所有承诺以核验结果为准，保留证据，由法务审定对外表述。"
  const dissent = has("rnd") ? "研发：耐受期反应与异常反应需要分开统计，复检结论出来之前不宜定性。" : has("risk") ? "风控：建议把该设备列入观察名单，持续关注后续索赔。" : undefined

  say("moderator", "neutral", `形成共识：${decision}${dissent ? "保留意见已记录。" : ""}请各部门确认分工。`)

  const ACTION: Record<Exclude<HuddleRoleId, "moderator">, { action: string; deadline: string }> = {
    cs: cat("fraud") ? { action: "引导客户提供防伪码与批号照片", deadline: "即时" } : { action: "回复客户并主动同步进展", deadline: "即时" },
    qa: { action: cat("safety") ? "登记不良反应并评估上报" : "审核回复的合规性", deadline: "24h" },
    rnd: { action: "留样复检，核查包材与温控记录", deadline: "48h" },
    pr: published ? { action: "准备统一口径并公开回应", deadline: "6h" } : { action: "备好口径，监测是否公开发布", deadline: "24h" },
    legal: { action: "审定对外表述，保全沟通记录", deadline: "4h" },
    crm: { action: "指派资深顾问并交接会员档案", deadline: "48h" },
    risk: { action: "复核关联记录并给出结论", deadline: "24h" },
  }
  return {
    turns,
    resolution: { decision, actions: c.roles.map((r) => ({ owner: HUDDLE_ROLE_MAP[r].title, ...ACTION[r as Exclude<HuddleRoleId, "moderator">] })), dissent },
  }
}

export function withConsensus(s: HuddleScript): { turns: HuddleTurn[]; resolution: HuddleResolution } {
  return { turns: s.turns, resolution: { ...s.resolution, consensus: consensusOf(s.turns) } }
}

/**
 * The decision brief: what the duty manager needs before reading any discussion — what is known,
 * what is still missing, where the departments' goals pull apart, and who has the authority to decide.
 * Written by rules from the case; the simulated discussion below it is optional reading.
 */
const MISSING: Partial<Record<RiskCategory, string>> = {
  safety: "是否已就医、症状是否持续；批号是否与出库记录一致",
  pr: "公开内容的原文与传播范围",
  legal: "对方的具体诉求、金额与依据",
  fraud: "凭证：防伪码、批号照片、订单记录",
  churn: "对方此刻最在意的一件事",
  minor: "使用者年龄是否属实、监护人是否知情",
  regulatory: "适用的法规条款与报告时限",
  privacy: "涉及哪些个人信息、是否已对外流转",
}
const TENSIONS: [RiskCategory, RiskCategory, string][] = [
  ["safety", "pr", "对外回应的时间点 vs 质量核实出结论的时间点"],
  ["fraud", "churn", "核验凭证的严格程度 vs 消费者的体验"],
  ["safety", "legal", "表达关怀 vs 不承认因果"],
  ["pr", "legal", "主动说明 vs 措辞风险"],
]
export function briefFor(c: HuddleCase) {
  const has = (k: RiskCategory) => c.categories.includes(k)
  return {
    known: c.evidence,
    missing: c.categories.map((k) => MISSING[k]).filter(Boolean) as string[],
    tensions: TENSIONS.filter(([a, b]) => has(a) && has(b)).map(([, , t]) => t),
    authority: "会诊决议由值班主管批准后执行；单项补偿超过 ¥800 需跨部门会诊确认（见权限矩阵）",
  }
}
