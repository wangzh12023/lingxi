import type { AgentDef, AgentId, Channel, DraftStyle, EmotionKey, IntentKey, Origin, RiskCategory, RiskLevel } from "./types"

/** Fill in before submitting. The deck builder (docs/ppt/build_ppt.py) prints it on the cover; blanks are left when empty. */
export const TEAM = { name: "", members: [] as string[], school: "" }

export const BRAND = {
  name: "灵犀",
  en: "Lingxi · Empathy Copilot",
  poem: "身无彩凤双飞翼，心有灵犀一点通",
  poet: "李商隐《无题》",
}

/**
 * Eight emotions in a fixed order. The order is part of the colour design: adjacent hues were
 * validated for colour-vision-deficiency separation, so charts must keep it.
 * `valence` weights each emotion when a vector is collapsed into a single −1…+1 figure.
 */
export const EMOTIONS: Record<EmotionKey, { cn: string; en: string; color: string; soft: string; valence: number; hint: string }> = {
  anger: { cn: "愤怒", en: "Anger", color: "#e04b3f", soft: "#fde8e5", valence: -1, hint: "需要被认真对待" },
  anxiety: { cn: "焦虑", en: "Anxiety", color: "#e89a2c", soft: "#fdf0dc", valence: -0.6, hint: "需要确定性与安全感" },
  sadness: { cn: "失落", en: "Disappointment", color: "#4f71ac", soft: "#e6ecf6", valence: -0.8, hint: "需要被挽回与重视" },
  grievance: { cn: "委屈", en: "Grievance", color: "#ab79e4", soft: "#f0eaf8", valence: -0.7, hint: "需要被理解与承认" },
  calm: { cn: "平静", en: "Calm", color: "#40b1ba", soft: "#e4f2f5", valence: 0.1, hint: "信息与效率优先" },
  anticipation: { cn: "期待", en: "Anticipation", color: "#d3a72f", soft: "#faf1d9", valence: 0.4, hint: "需要明确的承诺与节点" },
  joy: { cn: "愉悦", en: "Joy", color: "#ec6a8c", soft: "#fde7ee", valence: 0.9, hint: "适合深化关系" },
  gratitude: { cn: "感激", en: "Gratitude", color: "#319a56", soft: "#e0f4ec", valence: 1, hint: "信任已修复" },
}

export const EMOTION_ORDER: EmotionKey[] = ["anger", "anxiety", "sadness", "grievance", "calm", "anticipation", "joy", "gratitude"]

export const INTENTS: Record<IntentKey, { cn: string }> = {
  pre_sale_consult: { cn: "售前咨询" },
  product_efficacy: { cn: "功效咨询" },
  usage_guidance: { cn: "使用指导" },
  skin_matching: { cn: "肤质匹配" },
  authenticity: { cn: "真伪鉴别" },
  logistics: { cn: "物流查询" },
  return_refund: { cn: "退换退款" },
  adverse_reaction: { cn: "不良反应" },
  complaint: { cn: "投诉" },
  price_promo: { cn: "价格优惠" },
  membership: { cn: "会员权益" },
  gift_consult: { cn: "送礼咨询" },
  other: { cn: "一般沟通" },
}

/** `ink` is the level colour darkened for use as text; `color` is for marks and fills only. */
export const RISK_LEVELS: Record<RiskLevel, { cn: string; en: string; color: string; ink: string; soft: string; desc: string }> = {
  0: { cn: "平稳", en: "L0", color: "#8c8a96", ink: "#5f5d69", soft: "#f1f0ee", desc: "无显著风险" },
  1: { cn: "关注", en: "L1", color: "#6e8bb0", ink: "#42618a", soft: "#e8eef6", desc: "存在潜在不满，保持关注" },
  2: { cn: "预警", en: "L2", color: "#e89a2c", ink: "#8a5306", soft: "#fdf0dc", desc: "需坐席重点处理" },
  3: { cn: "高危", en: "L3", color: "#e04b3f", ink: "#a32626", soft: "#fde8e5", desc: "按风险归属发起跨部门会诊" },
  4: { cn: "紧急", en: "L4", color: "#a3133d", ink: "#8c1034", soft: "#f9e1e8", desc: "立即升级，启动应急预案" },
}

export const RISK_CATEGORIES: Record<RiskCategory, { cn: string; owner: string }> = {
  safety: { cn: "产品安全", owner: "质量法规部" },
  regulatory: { cn: "监管合规", owner: "质量法规部" },
  pr: { cn: "舆情公关", owner: "品牌公关部" },
  legal: { cn: "法律纠纷", owner: "法务部" },
  churn: { cn: "客户流失", owner: "会员运营部" },
  fraud: { cn: "异常退款索赔", owner: "风控中心" },
  privacy: { cn: "隐私安全", owner: "法务部" },
  minor: { cn: "未成年人", owner: "质量法规部" },
  service: { cn: "服务异常", owner: "客服运营" },
}

export const ORIGINS: Record<Origin, { cn: string; desc: string }> = {
  rule: { cn: "规则", desc: "确定性规则命中文本" },
  data: { cn: "数据", desc: "业务数据查询结果" },
  model: { cn: "模型", desc: "大模型判断" },
  script: { cn: "演示", desc: "演示脚本，代替大模型的判断" },
}

export const DRAFT_STYLES: Record<DraftStyle, { cn: string }> = {
  warm: { cn: "温暖共情" },
  professional: { cn: "专业严谨" },
  concise: { cn: "简洁高效" },
}

export const CHANNELS: Record<Channel, { cn: string; mark: string; color: string }> = {
  tmall: { cn: "天猫旗舰店", mark: "猫", color: "#ff2e4d" },
  douyin: { cn: "抖音小店", mark: "抖", color: "#16151c" },
  wechat: { cn: "微信小程序", mark: "微", color: "#1aad19" },
  jd: { cn: "京东自营", mark: "京", color: "#e1251b" },
  hotline: { cn: "400 热线", mark: "热", color: "#4f71ac" },
  xiaohongshu: { cn: "小红书店铺", mark: "红", color: "#ff2442" },
}

/**
 * The thirteen agents. `description` is the role each plays in the design; `impl` says what
 * actually runs behind it in this build, so nothing on the agents page claims more than exists.
 * `budget` is a latency target for a production deployment — nothing here was measured.
 */
export const AGENTS: AgentDef[] = [
  {
    id: "vision",
    glyph: "望",
    cn: "望 · 视觉感知",
    en: "Vision",
    role: "看见消费者发来的每一张图",
    description: "理解消费者上传的图片：皮肤上可见的红斑、脱屑等特征，包装上的批号与日期，订单截图，外观破损。只描述看得见的特征，不做医学判断；并标出需要遮盖的隐私区域。",
    color: "#c56b8a",
    phase: "perceive",
    model: "vision",
    inputs: ["图片", "消费者附言"],
    outputs: ["可见特征", "严重程度", "批号与日期", "需遮盖的隐私区域"],
    tools: ["视觉大模型"],
    budget: 1800,
    impl: "接入视觉大模型后实时识别上传的图片。两张演示插画附带预置的识别结果，界面上标注为“预置”。未识别前图片整体模糊，识别失败时提示坐席人工查看。",
  },
  {
    id: "empath",
    glyph: "闻",
    cn: "闻 · 情绪共情",
    en: "Empath",
    role: "听出语气背后的情绪",
    description: "用八种情绪的光谱代替“正面 / 负面”二分，结合标点、语气词与上文识别情绪的构成、强度与走势，留意“算了”“呵呵”这类放弃与反讽信号。",
    color: "#e89a2c",
    phase: "perceive",
    model: "hybrid",
    inputs: ["消息文本", "对话上文"],
    outputs: ["情绪向量", "主导情绪", "强度", "走势"],
    tools: ["情绪词典", "大模型"],
    budget: 600,
    impl: "规则轨是一部情绪词典，加上标点线索和若干句式（数着日子的等待、先夸后贬的反讽）。接入大模型后与「问」「切」合并为一次调用，由模型给出情绪向量；主导情绪、强度、效价与走势始终由向量计算得出，不采信模型自报的数字。",
  },
  {
    id: "intent",
    glyph: "问",
    cn: "问 · 意图洞察",
    en: "Intent",
    role: "问清真正想要什么",
    description: "识别主次意图与关键事实（产品、批号、使用时长、症状），并推断潜台词——消费者没有说出口的真实诉求。",
    color: "#40b1ba",
    phase: "perceive",
    model: "hybrid",
    inputs: ["消息文本", "对话上文", "客户记忆"],
    outputs: ["主次意图", "关键事实", "潜台词"],
    tools: ["意图规则", "事实抽取", "大模型"],
    budget: 1200,
    impl: "规则轨按加权的关键词与句式判定意图，并用正则抽取批号、时长与症状；它的读数同时用于路由——规则有把握的低风险咨询不再调用主模型。潜台词的规则只覆盖少数句式，这一项主要依靠大模型；演示脚本中的潜台词是人工撰写的。",
  },
  {
    id: "sentinel",
    glyph: "切",
    cn: "切 · 风险哨兵",
    en: "Sentinel",
    role: "切中风险的脉搏",
    description: "从产品安全、监管合规、舆情、法律、流失、异常索赔、隐私与未成年人八个类别研判风险，给出 L0–L4 分级、证据与处置建议。风险在一次会话中只增不减，由坐席处置后关闭。",
    color: "#e04b3f",
    phase: "perceive",
    model: "hybrid",
    inputs: ["消息文本", "视觉发现", "批次数据", "客户档案"],
    outputs: ["风险等级", "风险信号（含来源）", "上报时钟"],
    tools: ["风险规则库", "批次反馈查询", "大模型"],
    budget: 900,
    impl: "规则轨匹配词表与句式（症状词只在描述已经发生的事时才算；舆情区分“已经发了”和“扬言要发”），并查询数据：识别到批号时查该批次近 72 小时的反馈并做泊松检验，查客户档案中的流失评分与关联索赔记录，以及服务轨迹里的重复进线、重复退款与逾期承诺。大模型的信号与规则信号取并集、等级取高者——模型可以调高风险，不能调低规则命中的风险。",
  },
  {
    id: "memory",
    glyph: "忆",
    cn: "忆 · 客户记忆",
    en: "Memory",
    role: "记得她上一次说过什么",
    description: "汇聚会员档案、订单与过往服务记录，让坐席一眼读懂这位客户，不让客户把说过的话再讲一遍。",
    color: "#ab79e4",
    phase: "perceive",
    model: "rule",
    inputs: ["会员档案", "订单", "历史会话"],
    outputs: ["客户摘要", "沟通偏好", "历史记录"],
    tools: ["客户数据平台"],
    budget: 200,
    impl: "把进线记录、订单和售后工单按消费者排成一条服务轨迹，再跨数据源比对出重复进线、重复退款、承诺逾期和情绪逐次升级。数据是按赛题描述的三类结构自建的合成数据；尚未对接真实的客户数据平台，也没有跨渠道的身份合并。",
  },
  {
    id: "scholar",
    glyph: "典",
    cn: "典 · 知识智库",
    en: "Scholar",
    role: "每个建议都有出处",
    description: "从作业规范、售后政策、法规要点、产品资料与案例库中检索依据。没有命中依据时，草稿不陈述任何政策、金额或时限。",
    color: "#7c8a5a",
    phase: "fuse",
    model: "embed",
    inputs: ["消息文本", "意图", "风险信号"],
    outputs: ["引用片段", "命中的检索词"],
    tools: ["BM25 检索", "标签加权"],
    budget: 300,
    impl: "对知识库文档做中文二元分词的 BM25 检索，并按意图标签加权。没有使用向量检索；界面上显示命中的检索词，而不是一个相关度分数。",
  },
  {
    id: "strategist",
    glyph: "策",
    cn: "策 · 辨证策略",
    en: "Strategist",
    role: "给出下一步最佳行动",
    description: "综合感知结果与知识依据，给出可执行的下一步行动，并用“灵犀一念”一句话点出这一轮最要紧的事。行动的审批人按补偿金额对照权限矩阵得出。",
    color: "#3d6fb6",
    phase: "fuse",
    model: "hybrid",
    inputs: ["感知层输出", "知识依据", "补偿权限矩阵"],
    outputs: ["下一步行动", "灵犀一念", "会诊个案"],
    tools: ["行动规则", "权限矩阵", "大模型"],
    budget: 1500,
    impl: "规则轨按意图与风险类别生成行动清单。接入大模型后与「笔」合并为一次调用。是否会诊、请哪些部门入席、每项行动由谁审批，始终由规则决定。",
  },
  {
    id: "scribe",
    glyph: "笔",
    cn: "笔 · 执笔起草",
    en: "Scribe",
    role: "替你写下有温度的话",
    description: "按温暖、专业、简洁三种语气起草回复。坐席可以采用、修改或不用；灵犀不直接面对消费者。",
    color: "#c58b2b",
    phase: "decide",
    model: "hybrid",
    inputs: ["策略", "情绪", "知识依据", "客户偏好"],
    outputs: ["三版回复草稿"],
    tools: ["回复模板", "大模型"],
    budget: 1500,
    impl: "规则轨按“情绪开场白 + 意图正文”拼接模板，覆盖常见意图。接入大模型后由模型起草。草稿的评分不由起草者给出，统一交给「检」的评分量表。",
  },
  {
    id: "auditor",
    glyph: "检",
    cn: "检 · 合规质检",
    en: "Auditor",
    role: "发送前的最后一道闸",
    description: "检查每一句即将发出的话：医学判断、医疗化宣称、超出产品备案的功效、绝对化用语、越权承诺、推卸责任、以补偿换删评、隐私泄露。同一套量表也给草稿和陪练回复打分。",
    color: "#2f8f6f",
    phase: "guard",
    model: "hybrid",
    inputs: ["待发送的回复", "对话语境", "涉及的产品"],
    outputs: ["合规问题", "替换建议", "四维评分"],
    tools: ["合规规则库", "产品宣称备案", "评分量表", "大模型"],
    budget: 150,
    impl: "规则在浏览器内逐字运行，不经过网络；严重问题会拦住发送。量表的每一分都能拆回到命中的检查项。接入大模型后，点击“深度审查”可以让模型复核并改写，改写结果会再过一遍规则。",
  },
  {
    id: "guardian",
    glyph: "护",
    cn: "护 · 坐席守护",
    en: "Guardian",
    role: "也照顾屏幕这一端的人",
    description: "双向共情的另一半：遮盖攻击性词汇，追踪坐席承受的情绪负荷，在连续高压之后提醒休息。",
    color: "#d0688b",
    phase: "guard",
    model: "rule",
    inputs: ["消费者情绪", "攻击性词汇"],
    outputs: ["压力指数", "遮盖的词汇", "休息提醒"],
    tools: ["负荷公式", "敏感词库"],
    budget: 100,
    impl: "压力指数是一个简单公式：每轮按消费者的负面情绪强度累加，正面情绪时回落，休息后下降。遮盖用的是一份很短的词表。“静音时刻”在演示中是一个 5 分钟倒计时，没有对接真实的排班与分配系统。",
  },
  {
    id: "moderator",
    glyph: "议",
    cn: "议 · 会诊主持",
    en: "Moderator",
    role: "把相关部门请到一张圆桌",
    description: "风险达到 L3 且属于需要多部门处置的类别时，按风险归属召集相关部门的角色智能体讨论，形成带责任部门与时限的决议，少数意见写入保留意见。决议是建议，由值班主管确认后执行。",
    color: "#16151c",
    phase: "guard",
    model: "hybrid",
    inputs: ["个案摘要", "证据", "入席部门"],
    outputs: ["讨论记录", "决议与分工", "共识度"],
    tools: ["入席规则", "讨论模板", "大模型"],
    budget: 8000,
    impl: "先给决策简报（已知、缺失、冲突、谁来决定），再给多角色模拟讨论；入席部门由规则决定，“模拟立场一致度”只是那次讨论里各席位表态的平均，不代表批准。讨论内容有三种来源，界面上会标明：大模型实时生成、主线个案的演示脚本、或按“角色 × 风险类别”模板离线合成。",
  },
  {
    id: "insighter",
    glyph: "察",
    cn: "察 · 数据洞察",
    en: "Insighter",
    role: "从一万次对话里看见趋势",
    description: "汇总全渠道会话，发现批次异常、情绪变化与高频话题，把一线的声音回流给产品、研发与供应链。",
    color: "#4c9ad8",
    phase: "learn",
    model: "hybrid",
    inputs: ["全量会话", "批次反馈"],
    outputs: ["批次预警", "话题与情绪趋势", "每周简报"],
    tools: ["泊松检验", "大模型"],
    budget: 60000,
    impl: "泊松检验、预警阈值与预警时间都是真实计算，但输入是固定种子生成的模拟数据。话题聚类是预置的演示数据，没有实现聚类算法。每周简报由真实指标拼装，接入大模型后可重新生成。",
  },
  {
    id: "coach",
    glyph: "练",
    cn: "练 · 共情教练",
    en: "Coach",
    role: "让新人先和 AI 练一练",
    description: "扮演有情绪的消费者陪新人练习，用和质检相同的量表从共情、专业、合规、效率四个维度评分，并指出每一分的来由。",
    color: "#8a72e0",
    phase: "learn",
    model: "hybrid",
    inputs: ["角色设定", "坐席回复"],
    outputs: ["角色对话", "四维评分", "逐项点评"],
    tools: ["评分量表", "角色台词", "大模型"],
    budget: 2000,
    impl: "评分始终由规则量表给出。角色的回应在离线时取自按情绪分档的预置台词；接入大模型后由模型扮演角色，并补充一句示范回复。",
  },
]

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>

/** The nine agents that run on every consumer turn, in display order. */
export const PIPELINE_ORDER: AgentId[] = ["memory", "vision", "empath", "intent", "sentinel", "scholar", "strategist", "scribe", "auditor"]

export const PHASES = {
  perceive: { cn: "感知", en: "Perceive", desc: "望 · 闻 · 问 · 切 · 忆" },
  fuse: { cn: "融合", en: "Fuse", desc: "典 · 策" },
  decide: { cn: "起草", en: "Draft", desc: "笔" },
  guard: { cn: "守护", en: "Guard", desc: "检 · 护 · 议" },
  learn: { cn: "进化", en: "Learn", desc: "察 · 练" },
} as const

export const DEMO_DISCLAIMER = "演示数据（品牌、产品、客户、订单、案例与运营指标）均为虚构，不代表任何真实产品或事件。"
