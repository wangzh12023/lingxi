import type { ReplyScore } from "./types"

/**
 * 练 · Coach — training personas and the mood model.
 *
 * Replies are scored by the same rubric the console uses for drafts (`scoreReply`). The simulated
 * customer's mood moves by a published formula, so a trainee can see exactly why it moved:
 *   Δmood = (overall − 60) / 100 − 0.25 × (blocking issues)
 * A session ends once mood rises above +0.45, or after MAX_TURNS replies.
 */

export interface CoachPersona {
  id: string
  name: string
  avatarSeed: string
  title: string
  brief: string
  difficulty: 1 | 2 | 3 | 4 | 5
  /** instructions for a model playing the part */
  persona: string
  scenario: string
  opening: string
  startMood: number
  /** offline lines by mood band — chosen in order, never repeated within a session */
  lines: { hot: string[]; warm: string[]; cool: string[] }
  traits: string[]
}

export const PERSONAS: CoachPersona[] = [
  {
    id: "anxious-mom",
    name: "着急的妈妈 · 刘女士",
    avatarSeed: "liu",
    title: "孩子用了大人的面霜",
    brief: "8 岁的女儿偷偷用了妈妈的 A 醇面霜，脸颊发红。焦虑、生气又自责，说话很冲。",
    difficulty: 5,
    persona: "34 岁的妈妈，性子急，护女心切，既生气又自责，会反复追问“会不会有事”，最讨厌官腔。",
    scenario: "8 岁的女儿偷偷用了你的 A 醇面霜，脸颊发红发烫。你的第一反应是怪包装上没写清楚儿童禁用。",
    opening: "你们这个面霜怎么回事？？我女儿才8岁用了一下脸就红成这样了！说明书上写清楚了吗？！",
    startMood: -0.75,
    lines: {
      hot: ["你别跟我扯这些，我就问你会不会有事！", "你们是不是想推卸责任？", "我要的不是道歉，是告诉我现在怎么办！"],
      warm: ["那……现在要不要去医院啊？", "我也有责任，没放好……但你们包装上也该写清楚一点", "用冷水敷了，好像没那么烫了"],
      cool: ["好，谢谢你，我现在带她去医院看看。", "嗯，你说得挺清楚的，我先照做。", "麻烦你了，刚才我语气有点冲。"],
    },
    traits: ["焦虑", "护女心切", "自责转为愤怒"],
  },
  {
    id: "quiet-vip",
    name: "沉默的黑金会员 · 何女士",
    avatarSeed: "he",
    title: "“没事，就是问问”",
    brief: "语气平静克制，但每一句都在试探你是否记得她。答错一句，她就会悄悄离开。",
    difficulty: 4,
    persona: "52 岁的企业高管，黑金会员 8 年，礼貌而疏离，从不发火，但对敷衍零容忍。",
    scenario: "你最近换用了别的品牌，回来问一句旧款面霜是不是停产了，其实是在看这个品牌还记不记得你。",
    opening: "你好，我想问一下，臻颜面霜旧款是不是停产了。没事，就是问问。",
    startMood: -0.35,
    lines: {
      hot: ["嗯，知道了。", "好的，那不用了。", "你们现在都是机器人回复吗"],
      warm: ["你还记得我用的是哪款？", "新款和旧款到底有什么区别？", "以前的顾问会提前告诉我这些。"],
      cool: ["好，那你帮我留两瓶吧。", "谢谢，你比上次那位用心。", "那就按你说的，先试试小样。"],
    },
    traits: ["克制", "试探", "高价值"],
  },
  {
    id: "claimant",
    name: "索赔者 · 赵先生",
    avatarSeed: "zhao",
    title: "“假一赔十，懂？”",
    brief: "熟悉法条，说话快，想让你当场承诺赔偿金额。考验你守住流程，同时不失礼貌。",
    difficulty: 4,
    persona: "熟悉消费者权益法条的索赔者，语速快，喜欢引用法条施压，想让坐席当场承诺赔偿金额。",
    scenario: "你声称买到了假货，要求高额赔偿，但不愿意提供任何凭证。",
    opening: "我在你们旗舰店买的防晒是假的，按照法律规定你们要赔，我要十倍，今天就给我答复。",
    startMood: -0.6,
    lines: {
      hot: ["你就说赔不赔吧", "你做不了主就找你领导", "我录音了啊，你刚才承认了"],
      warm: ["凭证我可以给，但你先说赔多少", "核验要多久？", "那你们给我一个书面答复"],
      cool: ["行，我先把照片发你。", "那就按流程走吧。", "……好吧。"],
    },
    traits: ["施压", "引用法条", "诱导承诺"],
  },
]

export const RUBRIC = [
  { key: "empathy", cn: "共情", desc: "是否先回应情绪与处境" },
  { key: "professional", cn: "专业", desc: "下一步是否明确、可执行" },
  { key: "compliance", cn: "合规", desc: "是否避开医学判断、绝对化用语和越权承诺" },
  { key: "efficiency", cn: "效率", desc: "是否清楚、长度合适" },
] as const

export const MAX_TURNS = 6
export const END_MOOD = 0.45

export function nextMood(mood: number, score: ReplyScore, blocking: number) {
  return Math.round(Math.max(-1, Math.min(1, mood + (score.overall - 60) / 100 - 0.25 * blocking)) * 100) / 100
}

export const moodBand = (mood: number) => (mood < -0.35 ? "hot" : mood < 0.25 ? "warm" : "cool")

export const MOOD_LABEL = { hot: "仍然很激动", warm: "开始缓和", cool: "基本平复" } as const
