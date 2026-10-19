import type { Attachment, Scenario, ScriptedInsight, VisionFinding } from "./types"
import { CUSTOMERS } from "./data"

/**
 * Rehearsed demo scenarios.
 *
 * A scripted consumer turn pins down only what a language model would judge: intent, the emotion
 * vector, unspoken needs, text-level risk signals, key facts, the whisper, three draft texts and
 * the suggested actions. The pipeline computes everything else live — emotion summary, risk level,
 * batch lookups, the customer-record signals, citations, rubric scores, compliance, the recommended
 * draft, approvers and the huddle case — exactly as it does for free-typed messages.
 *
 * All people, products, orders and batches are invented.
 */

/** Recognition results that ship with the two demo illustrations (shown as 预置 in the UI). */
export const PRESET_VISION: Record<string, Omit<VisionFinding, "source">> = {
  "/demo/cheek.svg": {
    summary: "双颊可见弥漫性红斑，伴轻度脱屑，未见水疱或渗出",
    severity: "moderate",
    findings: [
      { label: "弥漫性红斑", confidence: 0.91, box: [0.18, 0.46, 0.3, 0.26] },
      { label: "轻度脱屑", confidence: 0.74, box: [0.62, 0.56, 0.22, 0.15] },
      { label: "未见水疱或渗出", confidence: 0.88 },
    ],
    privacy: [{ label: "眼部", box: [0.16, 0.155, 0.73, 0.155] }],
    containsFace: true,
  },
  "/demo/batch.svg": {
    summary: "产品包装完好；批号 LX2608A，限用日期 2029-07-14",
    severity: "none",
    findings: [
      { label: "批号 LX2608A", confidence: 0.97, box: [0.3, 0.6, 0.4, 0.09] },
      { label: "限用日期 2029-07-14", confidence: 0.93, box: [0.3, 0.7, 0.4, 0.07] },
      { label: "包装完好", confidence: 0.83 },
    ],
    privacy: [],
    containsFace: false,
  },
}

const img = (id: string, url: string, caption: string): Attachment => ({ id, kind: "image", url, caption })

/* ── 何女士 · “你们每次都说明天” —— 记住经历、兑现承诺 ── */

const heT1: ScriptedInsight = {
  intent: { primary: "complaint", secondary: "logistics", confidence: 0.86, summary: "补寄的面霜三次说“明天”都没发，已不相信承诺" },
  emotion: { anger: 0.34, sadness: 0.66, grievance: 0.58, calm: 0.04 },
  unspoken: [{ surface: "算了，你们每次都说明天", underlying: "不再相信口头承诺，要的是一件真正做到的事", confidence: 0.82 }],
  signals: [],
  keyFacts: ["诉求：破损的面霜补寄一瓶", "已等待：自 10 月 5 日起"],
  whisper: "",
  drafts: { warm: "", professional: "", concise: "" },
  actions: [],
}

const heT2: ScriptedInsight = {
  intent: { primary: "logistics", secondary: "complaint", confidence: 0.8, summary: "要一个能查的凭证，而不是又一个时间" },
  emotion: { anger: 0.18, sadness: 0.3, grievance: 0.32, anticipation: 0.3, calm: 0.2 },
  unspoken: [{ surface: "这次能给我个准话吗", underlying: "想知道这次和前三次有什么不一样", confidence: 0.76 }],
  signals: [],
  keyFacts: ["诉求：可查的进度"],
  whisper: "",
  drafts: { warm: "", professional: "", concise: "" },
  actions: [],
}

/* ── 林小姐 · A 醇刺痛 → 批次异常 → 会诊 → 修复 ── */

const linT1: ScriptedInsight = {
  intent: { primary: "adverse_reaction", secondary: "complaint", confidence: 0.92, summary: "使用 A 醇精华 3 天后面部发红、刺痛" },
  emotion: { anger: 0.38, anxiety: 0.72, sadness: 0.12, grievance: 0.22, calm: 0.05, anticipation: 0.08 },
  unspoken: [
    { surface: "脸又红又刺，现在火辣辣的", underlying: "害怕留下长久的损伤，需要先被安抚", confidence: 0.8 },
    { surface: "你们这个A醇精华", underlying: "对品牌的信任开始动摇，在想还要不要继续用", confidence: 0.6 },
  ],
  signals: [],
  keyFacts: ["产品：AURELLE A 醇精华", "使用时长：3 天", "症状：发红、刺痛、灼热"],
  whisper: "她发照片不是为了索赔，是在问“我的脸会好吗”。先让她安心，再问细节。",
  drafts: {
    warm: "林小姐，看到照片真的很心疼，脸上火辣辣的一定很难受。请先停用这支精华，用清水轻轻冲洗、不要揉搓，暂时也别叠加其他功效型产品。方便告诉我是哪天开始用的、每次用量大概多少吗？我想尽快帮您弄清楚原因，接下来每一步我都会陪您一起处理。",
    professional: "林小姐您好，我们非常重视您反馈的情况。建议您立即停用该产品并用清水冲洗。为了准确评估，想向您了解：1）开始使用的日期与频次；2）同期是否用了酸类或其他功效型产品；3）产品批号（在瓶底或外盒）。如果症状持续或加重，请及时到医院皮肤科就诊，合理的就医费用我们会协助处理。",
    concise: "林小姐，请先立即停用并用清水冲洗，别揉搓。麻烦发我一下批号和开始使用的时间，我马上为您跟进。",
  },
  actions: [
    { kind: "verify", title: "采集五项信息", detail: "批号、开始时间、用法、症状、过敏史", impact: "为研判提供依据", primary: true },
    { kind: "compensation", title: "就医费用协助", detail: "凭病历与票据", cost: 800, impact: "减轻顾虑" },
    { kind: "followup", title: "寄送修护霜，上门取回样品", detail: "舒缓护理，同时回收样品做批次检测", cost: 286, impact: "体验修复 + 质量追溯" },
    { kind: "report", title: "录入不良反应监测", detail: "内部规范 24 小时内录入；法定报告时限一般 30 日、严重 15 日", impact: "合规留痕" },
  ],
}

const linT2: ScriptedInsight = {
  intent: { primary: "adverse_reaction", secondary: "complaint", confidence: 0.9, summary: "母亲用同批次也刺痛；已在小红书发帖，质疑品控" },
  emotion: { anger: 0.71, anxiety: 0.66, sadness: 0.1, grievance: 0.35, calm: 0.02, anticipation: 0.05 },
  unspoken: [
    { surface: "我妈用的也是同一批", underlying: "担心年长的母亲，比担心自己更焦虑", confidence: 0.85 },
    { surface: "你们到底怎么做的品控？？", underlying: "要的是一个机构层面、可以验证的交代，而不只是给她个人的补偿", confidence: 0.78 },
  ],
  signals: [{ category: "safety", level: 2, title: "第二位受影响的人", evidence: "“我妈用的也是同一批，她也说有点刺”", action: "同样关怀她的母亲，建议就医", rule: "疑似不良反应接待规范" }],
  keyFacts: ["第二位使用者：母亲（年长）", "已发布：小红书笔记", "诉求：对品控的交代"],
  whisper: "这已经不只是她一个人的事。先回应她对母亲的担心，再告诉她谁在查、多久有结果。",
  drafts: {
    warm: "林小姐，谢谢您第一时间告诉我阿姨的情况，我特别理解您现在的心情——自己难受，更担心妈妈。请您和阿姨都先停用；阿姨如果刺痛一直不缓解，建议尽快就医，费用我们来协助。您提供的批号 LX2608A 我已经紧急提交给质量部门排查，有结果我会第一时间亲自告诉您，不会让您等一个不明不白的答复。",
    professional: "林小姐，您提供的批号 LX2608A 已收到，我们已启动该批次的质量核查，由质量法规部门专项跟进。请您与阿姨都先停用该产品；如果阿姨出现持续刺痛或红肿，建议及时就医，合理的就医费用由我们协助。核查进展将在 48 小时内同步给您，期间由我专人对接。",
    concise: "林小姐，批号已收到，已紧急提交质量部门排查。请您和阿姨都先停用，阿姨不舒服请及时就医，费用我们协助。48 小时内我亲自给您进展。",
  },
  actions: [
    { kind: "verify", title: "核对订单与批次", detail: "确认林小姐与母亲所用的批号", impact: "确认影响范围" },
    { kind: "compensation", title: "就医费用协助 ×2", detail: "本人与母亲，凭病历与票据", cost: 1600, impact: "超出主管权限" },
    { kind: "report", title: "录入不良反应监测", detail: "内部规范 24 小时内录入；法定报告时限一般 30 日、严重 15 日", impact: "合规留痕" },
  ],
}

const linT3: ScriptedInsight = {
  intent: { primary: "adverse_reaction", confidence: 0.86, summary: "不求赔偿，想确定批次是否安全，并保障母亲的健康" },
  emotion: { anger: 0.22, anxiety: 0.74, sadness: 0.3, grievance: 0.38, calm: 0.15, anticipation: 0.32 },
  unspoken: [
    { surface: "我也不是要钱……", underlying: "不想被当成索赔的人，希望被当作一个担心妈妈的女儿", confidence: 0.8 },
    { surface: "我真的挺怕的", underlying: "需要看得见的进度和有时间点的承诺", confidence: 0.76 },
  ],
  signals: [],
  keyFacts: ["诉求：批次是否安全", "关注：母亲的健康", "已放下戒备"],
  whisper: "她把戒备放下了。别谈补偿，给她确定性：谁在查、什么时候有结果、阿姨怎么办。",
  drafts: {
    warm: "林小姐，我懂，您不是为了钱，是为了阿姨和您自己的安心。跟您同步一下我们正在做的事：质量部门已经调取这个批次的留样在复检，研发也在同步复核配方和包材，48 小时内会有结论，我第一时间告诉您。今天下午我们的皮肤健康顾问会专门给阿姨打个电话，了解她的情况；如果需要就医，费用我们来协助。有任何不舒服随时找我，我一直在。",
    professional: "林小姐，理解您的担忧。目前的进展如下：1）质量法规部已对批次 LX2608A 启动留样复检；2）研发同步复核配方稳定性与包材密封性；3）复检结论将在 48 小时内由我同步给您。另外，今天 18:00 前我们的皮肤健康顾问会致电阿姨了解情况，合理的就医费用由我们承担。",
    concise: "明白您的担心。批次正在复检，48 小时内我给您结论；今天 18:00 前会有专人致电阿姨，就医费用我们承担。",
  },
  actions: [
    { kind: "followup", title: "同步会诊决议的进展", detail: "复检 48 小时出结论，专人回访母亲", impact: "给出确定性", primary: true },
    { kind: "followup", title: "皮肤健康顾问致电母亲", detail: "今天 18:00 前完成", impact: "照顾第二位受影响的人" },
    { kind: "followup", title: "设置 48 小时结果提醒", detail: "到点提醒坐席主动告知", impact: "兑现承诺" },
  ],
}

const linT4: ScriptedInsight = {
  intent: { primary: "other", confidence: 0.8, summary: "接受处理方案，等待后续结果" },
  emotion: { anxiety: 0.18, calm: 0.55, anticipation: 0.48, joy: 0.12, gratitude: 0.72, grievance: 0.06, anger: 0.03 },
  unspoken: [{ surface: "有结果一定要告诉我哦", underlying: "仍需要确定性：希望被主动告知，而不是自己去追问", confidence: 0.72 }],
  signals: [],
  keyFacts: ["承诺：48 小时内告知复检结论", "承诺：今天 18:00 前回访母亲"],
  whisper: "情绪已经从焦虑转向信任。现在最重要的是兑现承诺——把 48 小时的回访写进日程。",
  drafts: {
    warm: "一定会的，林小姐！结果出来我第一时间告诉您，阿姨那边下午也会有专人联系。这几天脸上要是还有不舒服，随时找我。也谢谢您这么信任我们，祝您和阿姨都早日舒服起来。",
    professional: "好的，林小姐。复检结论会在 48 小时内由我主动同步给您，阿姨的回访今天 18:00 前完成。期间如有任何不适，请随时联系我。感谢您的理解与信任。",
    concise: "一定第一时间告诉您！有不舒服随时找我，祝早日恢复。",
  },
  actions: [
    { kind: "followup", title: "生成服务小结与回访任务", detail: "写入工单和日程", impact: "承诺不落空", primary: true },
    { kind: "followup", title: "满意度邀请延后 24 小时", detail: "不在情绪恢复期打扰", impact: "评价更真实" },
    { kind: "education", title: "推荐为优秀案例", detail: "沉淀到共情学院", impact: "经验可复制" },
  ],
}

/* ── 周先生 · 生日礼物与物流焦虑 ── */

const zhouT1: ScriptedInsight = {
  intent: { primary: "logistics", secondary: "gift_consult", confidence: 0.9, summary: "礼盒还没发货，需要在后天女友生日前送到" },
  emotion: { anger: 0.35, anxiety: 0.7, anticipation: 0.5, grievance: 0.1, calm: 0.05 },
  unspoken: [
    { surface: "你们别给我搞砸了", underlying: "在意的不是快递，是女朋友的生日惊喜不能出岔子", confidence: 0.86 },
    { surface: "后天是我女朋友生日", underlying: "需要一个确定能赶上的方案，最好还能补一点心意", confidence: 0.74 },
  ],
  signals: [{ category: "churn", level: 1, title: "节日订单若延误，可能退款", evidence: "近一年 6 单都是节日礼盒；本单若赶不上生日可能退款", action: "先锁定送达方案，再补一点心意", rule: "客户档案" }],
  keyFacts: ["订单：臻颜礼盒 ¥1,580", "关键时间：后天（女友生日）", "当前状态：仓库待发"],
  whisper: "他在意的不是快递，是女朋友的生日。先把时间稳住，再给一个让惊喜不打折的办法。",
  drafts: {
    warm: "周先生，生日礼物可一点都不能耽误！我现在就为您申请仓库加急出库，并改派顺丰，运费由我们承担，提交成功后我把工单号发给您，物流我会一直盯着。另外我们可以免费帮您写一张手写贺卡放进礼盒，您想写什么话可以告诉我。",
    professional: "周先生您好，我将为您的订单申请仓库加急出库并改派顺丰，运费由品牌承担；提交后告知工单号，送达时间以物流信息为准。如需手写贺卡，请告诉我们祝福语，会随礼盒一同寄出。",
    concise: "我马上申请加急并改派顺丰，运费我们承担，提交后发您工单号。需要手写贺卡吗？",
  },
  actions: [
    { kind: "followup", title: "仓库加急并改派顺丰", detail: "运费由品牌承担，预计明天送达", cost: 23, impact: "争取生日前送到", primary: true },
    { kind: "recommend", title: "免费手写贺卡", detail: "把焦虑变成惊喜", impact: "提升心意" },
    { kind: "compensation", title: "随单附赠同系列小样", detail: "补偿等待", cost: 45, impact: "表达歉意" },
  ],
}

const zhouT2: ScriptedInsight = {
  intent: { primary: "logistics", confidence: 0.88, summary: "确认顺丰能否明天送到，以此决定是否退款" },
  emotion: { anxiety: 0.42, anticipation: 0.7, calm: 0.25, anger: 0.08 },
  unspoken: [{ surface: "要是能到我就不退了", underlying: "已经给出了留下的条件，需要一个可信的时间预期", confidence: 0.82 }],
  signals: [],
  keyFacts: ["客户条件：明天送到就不退款"],
  whisper: "他给出了留下的条件。说预计时间，但别承诺具体时刻；顺手把贺卡定下来。",
  drafts: {
    warm: "顺丰已经揽收啦，系统预计明天下午送到，我会一直盯着，有任何变化第一时间告诉您！贺卡想写什么呢？我帮您安排上。",
    professional: "顺丰已揽收，预计明天下午送达，具体以物流信息为准。我们会持续跟踪并及时同步。请告诉我贺卡的祝福语。",
    concise: "已揽收，预计明天下午到，我盯着！贺卡写什么？",
  },
  actions: [{ kind: "followup", title: "设置物流异常提醒", detail: "节点超时就提醒坐席", impact: "防止二次失约", primary: true }],
}

const zhouT3: ScriptedInsight = {
  intent: { primary: "gift_consult", confidence: 0.84, summary: "提供贺卡祝福语，对服务表示满意" },
  emotion: { gratitude: 0.62, joy: 0.52, anticipation: 0.4, calm: 0.35 },
  unspoken: [{ surface: "服务挺好的", underlying: "对品牌有了好感，可以顺势把关系走近一步", confidence: 0.68 }],
  signals: [],
  keyFacts: ["贺卡：愿你被这个世界温柔以待"],
  whisper: "情绪从焦虑转成了满意。可以轻轻提一句会员的生日礼遇，但不要推销。",
  drafts: {
    warm: "好的周先生，贺卡的祝福语我记下了：“愿你被这个世界温柔以待”，真的很温柔，会随礼盒一起寄出。也悄悄告诉您，如果您女朋友是我们的会员，生日月会有专属礼遇。祝你们生日快乐！",
    professional: "贺卡祝福语已记录：“愿你被这个世界温柔以待”，会随礼盒一同寄出。感谢您的认可，如有其他需要随时联系我们。",
    concise: "祝福语记下了，会随礼盒寄出，祝生日快乐！",
  },
  actions: [{ kind: "recommend", title: "告知会员生日礼遇", detail: "只告知，不推销", impact: "加深关系", primary: true }],
}

/* ── 陈女士 · 黑金会员的“算了” ── */

const chenT1: ScriptedInsight = {
  intent: { primary: "complaint", secondary: "membership", confidence: 0.86, summary: "专属顾问离职后服务断档，表达失望" },
  emotion: { sadness: 0.72, grievance: 0.6, anger: 0.25, calm: 0.1 },
  unspoken: [
    { surface: "没人记得我用什么", underlying: "怀念被记得的感觉——要的是关系，不是折扣", confidence: 0.86 },
    { surface: "算了", underlying: "放弃的信号：这可能是告别前的最后一句话", confidence: 0.8 },
  ],
  signals: [],
  keyFacts: ["6 年黑金会员", "常用：臻颜面霜、眼霜", "前任顾问：小雅（8 月离职）"],
  whisper: "“算了”是告别前的最后一句话。不要发券——告诉她你记得她：她的肤质，她常用的那支面霜。",
  drafts: {
    warm: "陈女士，您说“没人记得”，我看了挺难过的。您是我们 6 年的黑金会员，我这边能看到您一直用臻颜面霜和眼霜，也知道您秋冬容易干。小雅离开后交接没做好，是我们的问题，郑重向您道歉。我想为您重新安排一位资深顾问，并请她先熟悉您这 6 年的记录再联系您，您看可以吗？",
    professional: "陈女士您好，对于专属顾问交接期间给您带来的不好体验，我们深表歉意。我们会为您指派一位资深专属顾问，完整交接您的会员档案与护肤偏好，确保服务连续；店长也会亲自与您联系。",
    concise: "陈女士，抱歉交接没做好。我马上为您安排资深顾问，并把您的完整档案交接过去。",
  },
  actions: [
    { kind: "escalate", title: "指派资深专属顾问", detail: "先交接 6 年档案，再联系", impact: "重建被记得的感觉", primary: true },
    { kind: "followup", title: "店长致电致歉", detail: "48 小时内", impact: "体现重视" },
    { kind: "recommend", title: "寄送秋冬护理小样", detail: "按干性熟龄肌挑选，不是折扣", cost: 120, impact: "用“懂你”代替“给钱”" },
  ],
}

const chenT2: ScriptedInsight = {
  intent: { primary: "complaint", confidence: 0.8, summary: "不想再重复解释，在看品牌是否真的记得她" },
  emotion: { grievance: 0.55, sadness: 0.4, anticipation: 0.35, anger: 0.15, calm: 0.2 },
  unspoken: [{ surface: "别每次都让我从头讲一遍", underlying: "她在给第二次机会：希望被证明不用再讲一遍", confidence: 0.84 }],
  signals: [],
  keyFacts: ["条件：不再重复解释"],
  whisper: "她在给你第二次机会。用客户记忆里的信息回应她——证明她不用再讲一遍。",
  drafts: {
    warm: "您说得对，不该让您一遍遍地讲。我已经把您这 6 年的记录整理好了：干性熟龄肌、秋冬容易干、常用臻颜面霜和眼霜、不喜欢香味太重的产品。这份档案会交给新顾问，她联系您之前会全部看过。",
    professional: "理解。您的会员档案（肤质、偏好、购买与服务记录）已完整整理，将同步给新顾问，确保之后的沟通不需要您重复说明。",
    concise: "明白，档案已经整理好交给新顾问，以后不用您再讲一遍。",
  },
  actions: [{ kind: "followup", title: "生成会员档案交接卡", detail: "汇总 6 年记录", impact: "证明我们记得", primary: true }],
}

const chenT3: ScriptedInsight = {
  intent: { primary: "membership", confidence: 0.82, summary: "同意新顾问周末联系" },
  emotion: { anticipation: 0.58, calm: 0.5, sadness: 0.15, gratitude: 0.3 },
  unspoken: [{ surface: "那行吧", underlying: "愿意再给一次机会，但会用周末的体验来验证", confidence: 0.76 }],
  signals: [],
  keyFacts: ["约定：新顾问周末联系"],
  whisper: "挽回的窗口打开了。周末之前把档案交到新顾问手里——第一句话就叫出她常用的那支面霜。",
  drafts: {
    warm: "好的陈女士，新顾问周末会联系您，她会先把您的档案看一遍。谢谢您愿意再给我们一次机会。",
    professional: "好的，我这就为您申请指派新顾问，本周末联系您，档案交接会在此之前完成。感谢您的信任。",
    concise: "好的，周末新顾问联系您，档案提前交接好。",
  },
  actions: [{ kind: "followup", title: "预约周末顾问联系", detail: "7 天后评估挽回效果", impact: "形成闭环", primary: true }],
}

/* ── 许同学 · 未成年人咨询 A 醇 ── */

const xuT1: ScriptedInsight = {
  intent: { primary: "product_efficacy", secondary: "skin_matching", confidence: 0.88, summary: "高二学生询问 A 醇能否改善闭口" },
  emotion: { anticipation: 0.7, joy: 0.3, anxiety: 0.32, calm: 0.15 },
  unspoken: [{ surface: "小红书说你们家A醇祛痘超好用", underlying: "对皮肤有焦虑，想找一个快速见效的捷径", confidence: 0.7 }],
  signals: [],
  keyFacts: ["自述：高二", "诉求：闭口", "来源：小红书笔记"],
  whisper: "她可能还未成年，在找捷径。别推荐 A 醇，也别跟着说“祛痘”——建议温和清洁，问题明显就请家长陪着看皮肤科。",
  drafts: {
    warm: "同学你好呀，闭口确实挺让人烦恼的，特别理解！不过 A 醇是比较强的功效成分，不太建议在青春期自己尝试。可以先从温和清洁和规律作息开始；如果闭口比较多或者反复，建议在家长陪同下去医院皮肤科看看，医生会给你更合适的方案。",
    professional: "您好。A 醇属于强活性成分，不建议未成年人自行使用。日常建议温和清洁、注意保湿；如果闭口较多或反复出现，建议在监护人陪同下咨询皮肤科医生。",
    concise: "A 醇不太适合青春期自己用，建议先温和清洁；比较严重的话和家长一起去看皮肤科。",
  },
  actions: [
    { kind: "education", title: "温和护肤建议", detail: "推荐基础清洁，不推荐强活性成分", impact: "保护未成年人", primary: true },
    { kind: "verify", title: "标记疑似未成年", detail: "之后的会话自动启用沟通规范", impact: "合规" },
  ],
}

const xuT2: ScriptedInsight = {
  intent: { primary: "price_promo", confidence: 0.84, summary: "询问学生优惠" },
  emotion: { anticipation: 0.55, sadness: 0.2, calm: 0.3, joy: 0.2 },
  unspoken: [{ surface: "可是好贵哦", underlying: "预算有限，容易被“划算”的说法带着走", confidence: 0.68 }],
  signals: [],
  keyFacts: ["预算有限"],
  whisper: "引导理性消费：一支温和的洁面就够了，不用为了优惠买用不上的东西。",
  drafts: {
    warm: "理解理解！其实现阶段一支温和的洁面加基础保湿就够啦，不用买很多。我们的氨基酸洁面 138 元可以用两三个月，新客还可以先领小样试试，合适再买也不迟。",
    professional: "建议现阶段以基础清洁与保湿为主。新客可以申领试用装，确认合适后再购买正装。",
    concise: "基础洁面就够啦，先领个小样试试。",
  },
  actions: [{ kind: "recommend", title: "发放新客试用装", detail: "一线权限内", cost: 25, impact: "理性消费", primary: true }],
}

/* ── 王先生 · 索赔与核验 ── */

const wangT1: ScriptedInsight = {
  intent: { primary: "authenticity", secondary: "complaint", confidence: 0.86, summary: "称防晒是假货，要求十倍赔偿，否则投诉并曝光" },
  emotion: { anger: 0.55, calm: 0.32, grievance: 0.2, anxiety: 0.05 },
  unspoken: [{ surface: "假一赔十，不然就去12315", underlying: "诉求集中在赔偿金额，而不是把问题弄清楚", confidence: 0.64 }],
  signals: [],
  keyFacts: ["订单：轻透防晒乳（京东自营）", "诉求：十倍赔偿", "未提供任何凭证"],
  whisper: "保持礼貌，按真伪核验流程走——用事实说话，不指控、也不让步。",
  drafts: {
    warm: "王先生您好，理解您对商品真伪的担心，我们会认真核实。麻烦您提供一下外包装防伪码、瓶身批号的照片，我们通过品牌溯源系统核验后，第一时间给您明确的答复。",
    professional: "王先生您好，我们重视您对商品真伪的疑问。为了核实，请您提供：1）外包装防伪码的照片；2）瓶身批号的照片。订单 JD20261008-7710 我们这边已经看到了。核验后尽快回复您，结论以核验结果为准。",
    concise: "请发防伪码和批号的照片，核验后尽快答复您。",
  },
  actions: [
    { kind: "verify", title: "发起溯源核验", detail: "防伪码、批号与订单三方比对", impact: "用事实回应", primary: true },
    { kind: "escalate", title: "转风控中心复核", detail: "附上关联记录", impact: "识别异常索赔" },
  ],
}

const wangT2: ScriptedInsight = {
  intent: { primary: "complaint", confidence: 0.82, summary: "拒绝提供凭证，坚持要求直接赔付" },
  emotion: { anger: 0.62, calm: 0.3 },
  unspoken: [{ surface: "你们直接赔就行了", underlying: "回避核验流程，这本身就是一个需要留意的信号", confidence: 0.72 }],
  signals: [],
  keyFacts: ["拒绝提供凭证"],
  whisper: "拒绝提供凭证是关键信号。坚持流程、全程留痕，转风控复核——语气始终礼貌。",
  drafts: {
    warm: "理解您时间宝贵。不过为了对您和其他消费者都负责，真伪核验需要以凭证为依据，拍两张照片大概只要一分钟。您方便的时候发给我就好，我随时在。",
    professional: "理解。按照品牌的真伪核验流程，需要以防伪码与批号凭证为依据进行核验。您提供后我们会第一时间处理并答复。",
    concise: "核验需要凭证，您方便时发我两张照片就好，我随时在。",
  },
  actions: [{ kind: "escalate", title: "风控复核并留痕", detail: "会话全文与关联记录归档", impact: "守住规则", primary: true }],
}

export const SCENARIOS: Scenario[] = [
  {
    id: "he-promise",
    title: "“每次都说明天” · 承诺失约",
    subtitle: "查出三次失约 → 不再口头承诺 → 申请并批准补救 → 生成工单 → 换坐席接手 → 到期回访",
    channel: "tmall",
    tags: ["服务轨迹", "承诺跟踪", "审批", "换坐席"],
    customer: CUSTOMERS.he,
    orders: [
      { id: "TM20261003-4471", product: "MISTRAL B5 修护舒缓霜 50ml", sku: "p-mistral-b5", price: 268, date: "2026-10-03", status: "已签收", channel: "tmall" },
      { id: "TM20260712-0815", product: "MISTRAL 氨基酸温和洁面 120ml", sku: "p-mistral-cleanser", price: 138, date: "2026-07-12", status: "已完成", channel: "tmall" },
    ],
    highlight: "主线演示",
    waitingSec: 96,
    script: [
      { id: "s1", role: "consumer", text: "算了，你们每次都说明天。", insight: heT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "这次能给我个准话吗？别再让我等了。", insight: heT2 },
      { id: "s4", role: "agent" },
    ],
  },
  {
    id: "lin-retinol",
    title: "A 醇刺痛 · 批次风险",
    subtitle: "看图 → 读出批号 → 发现批次异常 → 跨部门会诊 → 情绪修复",
    channel: "tmall",
    tags: ["图片识别", "不良反应", "批次预警", "会诊"],
    customer: CUSTOMERS.lin,
    orders: [
      { id: "TM20260928-8812", product: "AURELLE 臻颜紧致 A 醇精华 30ml", sku: "p-aurelle-a-serum", price: 680, date: "2026-09-28", status: "已签收", channel: "tmall" },
      { id: "TM20260702-1150", product: "AURELLE 轻透防晒乳 SPF50+", sku: "p-aurelle-uv", price: 320, date: "2026-07-02", status: "已完成", channel: "tmall" },
    ],
    highlight: "批次与图片",
    waitingSec: 38,
    script: [
      { id: "s1", role: "consumer", text: "你们这个A醇精华我才用了三天，脸又红又刺，现在火辣辣的！！", attachments: [img("img-cheek", "/demo/cheek.svg", "面部照片")], insight: linT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "我妈用的也是同一批，她也说有点刺。我已经发小红书了，评论区好多人说也这样！你们到底怎么做的品控？？", attachments: [img("img-batch", "/demo/batch.svg", "产品批号")], insight: linT2 },
      { id: "s4", role: "agent" },
      { id: "s5", role: "huddle" },
      { id: "s6", role: "consumer", text: "我也不是要钱……就是想知道这东西到底有没有问题。我妈年纪大了，我真的挺怕的。", insight: linT3 },
      { id: "s7", role: "agent" },
      { id: "s8", role: "consumer", text: "好的，谢谢你这么耐心。那我等你消息，有结果一定要告诉我哦。", insight: linT4 },
      { id: "s9", role: "agent" },
    ],
    huddle: {
      turns: [
        { id: "h1", role: "moderator", stance: "neutral", text: "会诊开始。个案：同一批次 72 小时内反馈集中，客户母亲也受影响，小红书上已经有人跟帖。目标是尽快形成处置决议。先请质量法规。" },
        { id: "h2", role: "qa", stance: "caution", text: "批次数据显示近 72 小时同类反馈 17 起，平日约 3.8 起，泊松检验 p 小于 0.001，不像偶然。我建议立即对 LX2608A 预防性暂停发货，调取留样复检，同时把本例录入不良反应监测，内部时限 24 小时。", refs: ["察 · 批次预警", "疑似不良反应接待规范"] },
        { id: "h3", role: "rnd", stance: "caution", text: "先别急着定性。A 醇在建立耐受期间本来就会刺痛，17 起里要区分耐受期反应和异常反应。不过 72 小时内集中出现，我更怀疑包材密封或运输温控让活性物降解了，复检建议同时测 pH、视黄醇含量和内塞密封性。", refs: ["A 醇成分与使用须知"] },
        { id: "h4", role: "pr", stance: "oppose", text: "我不同意等复检结果再回应。笔记已经有跟帖，沉默 48 小时等于默认。建议今天就主动为这个批次开放无忧退换，口径是“主动排查、为您负责”，而不是“产品没问题”。", refs: ["舆情分级"] },
        { id: "h5", role: "legal", stance: "caution", text: "主动退换可以，但对外表述要克制：不承认因果，不说“质量问题”，用“预防性措施”。另外绝不能以补偿为条件要求客户删帖，所有沟通记录完整留存。" },
        { id: "h6", role: "cs", stance: "support", text: "补充消费者的视角：林小姐最担心的是她母亲，要的是确定性。补偿给多了反而像封口费。我建议给她明确的时间点，再安排专人回访她母亲，就医费用照常协助。", refs: ["问 · 潜台词"] },
        { id: "h7", role: "qa", stance: "support", text: "同意客服的判断。那就把预防性暂停发货和开放无忧退换作为质量动作，不对外定性，48 小时内给出复检结论。" },
        { id: "h8", role: "pr", stance: "support", text: "可以接受。我来准备统一口径，评论区由官方账号真诚回应，不删帖、不辩解，复检结论出来后再发一次。" },
        { id: "h9", role: "moderator", stance: "neutral", text: "形成共识：先关怀、后定性；主动排查、不封口。研发对耐受期反应的占比保留意见，复检时一并验证。请各部门确认分工。" },
      ],
      resolution: {
        decision: "对 LX2608A 采取预防性措施：暂停发货、开放无忧退换、48 小时内完成留样复检；对客户以确定性与关怀为先，不以补偿换沉默。",
        actions: [
          { owner: "质量法规部", action: "暂停 LX2608A 发货，录入不良反应监测", deadline: "2h" },
          { owner: "研发与创新中心", action: "留样复检：pH、视黄醇含量、内塞密封", deadline: "48h" },
          { owner: "品牌公关部", action: "发布统一口径，在评论区真诚回应", deadline: "6h" },
          { owner: "消费者服务中心", action: "回访客户母亲，协助两人的就医费用", deadline: "今天 18:00" },
          { owner: "法务部", action: "审定对外表述，保全沟通记录", deadline: "4h" },
        ],
        dissent: "研发：17 起中可能包含部分耐受期的正常反应，复检时应分开统计，避免过度定性。",
      },
    },
  },
  {
    id: "zhou-gift",
    title: "生日礼物 · 物流焦虑",
    subtitle: "读懂“别给我搞砸了”背后的心意",
    channel: "douyin",
    tags: ["物流", "送礼", "潜台词"],
    customer: CUSTOMERS.zhou,
    orders: [{ id: "DY20261010-5521", product: "AURELLE 臻颜礼盒", sku: "p-aurelle-gift", price: 1580, date: "2026-10-10", status: "仓库待发", channel: "douyin" }],
    highlight: "潜台词",
    waitingSec: 21,
    script: [
      { id: "s1", role: "consumer", text: "我昨天下单的礼盒怎么还没发货？？后天是我女朋友生日，你们别给我搞砸了", insight: zhouT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "顺丰的话明天能到吗？要是能到我就不退了。", insight: zhouT2 },
      { id: "s4", role: "agent" },
      { id: "s5", role: "consumer", text: "行，那帮我写张卡片：“愿你被这个世界温柔以待”。谢谢啊，服务挺好的。", insight: zhouT3 },
      { id: "s6", role: "agent" },
    ],
  },
  {
    id: "chen-churn",
    title: "黑金会员 · 沉默流失",
    subtitle: "“算了”可能是告别前的最后一句话",
    channel: "wechat",
    tags: ["流失预警", "客户记忆", "会诊"],
    customer: CUSTOMERS.chen,
    orders: [{ id: "WX20260815-0931", product: "AURELLE 臻颜礼盒", sku: "p-aurelle-gift", price: 1580, date: "2026-08-15", status: "已完成", channel: "wechat" }],
    highlight: "放弃信号",
    waitingSec: 112,
    script: [
      { id: "s1", role: "consumer", text: "算了，你们现在也不在乎我们这些老客户了。小雅走了以后，没人记得我用什么。", insight: chenT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "你们要是真有心，就别每次都让我从头讲一遍。", insight: chenT2 },
      { id: "s4", role: "agent" },
      { id: "s5", role: "consumer", text: "那行吧，让新顾问周末联系我。", insight: chenT3 },
      { id: "s6", role: "agent" },
    ],
  },
  {
    id: "xu-minor",
    title: "未成年人 · 功效咨询",
    subtitle: "售前也要守住边界",
    channel: "xiaohongshu",
    tags: ["未成年人", "功效宣称", "合规"],
    customer: CUSTOMERS.xu,
    orders: [],
    highlight: "合规",
    waitingSec: 9,
    script: [
      { id: "s1", role: "consumer", text: "姐姐！小红书说你们家A醇祛痘超好用，我高二，闭口好多，能用吗？", insight: xuT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "可是好贵哦，有没有学生优惠呀", insight: xuT2 },
      { id: "s4", role: "agent" },
    ],
  },
  {
    id: "wang-claim",
    title: "索赔 · 核验与风控",
    subtitle: "不指控、不让步，用事实说话",
    channel: "jd",
    tags: ["索赔", "关联记录", "会诊"],
    customer: CUSTOMERS.wang,
    orders: [{ id: "JD20261008-7710", product: "AURELLE 轻透防晒乳 SPF50+", sku: "p-aurelle-uv", price: 320, date: "2026-10-08", status: "已签收", channel: "jd" }],
    highlight: "风控",
    waitingSec: 64,
    script: [
      { id: "s1", role: "consumer", text: "你们这个防晒是假货！我要求按照法律假一赔十，不然我就去12315投诉，还要找媒体曝光。", insight: wangT1 },
      { id: "s2", role: "agent" },
      { id: "s3", role: "consumer", text: "我没空给你拍照，你们直接赔就行了。", insight: wangT2 },
      { id: "s4", role: "agent" },
    ],
  },
]

export const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<string, Scenario>
