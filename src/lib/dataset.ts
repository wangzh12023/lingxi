import type { Channel, CustomerProfile } from "./types"
import { CUSTOMERS, PRODUCTS } from "./data"
import { mulberry32, pick } from "./random"

/**
 * Service data in the three shapes the contest brief names: 聊天语料 (past contacts), 电商订单
 * (orders) and 售后工单 (after-sales tickets). Everything here is SYNTHETIC — written and generated
 * for this prototype, with a fixed seed. When the organisers' data file is available it should
 * replace this module's records; the shapes below are the mapping target.
 *
 * "Now" is pinned so the demo, the tests and the screenshots agree.
 */
export const DEMO_NOW = new Date(2026, 9, 11, 10, 0) // 2026-10-11 10:00

export interface OrderRecord {
  id: string
  customerId: string
  sku: string
  product: string
  price: number
  channel: Channel
  paidAt: string
  status: "待发货" | "运输中" | "已签收" | "已完成" | "已退款"
  signedAt?: string
  /** the batch the warehouse shipped (出库批次), when the shipment record has it */
  batch?: string
}

export type TicketType = "refund" | "exchange" | "complaint" | "adverse" | "logistics" | "promise"

export interface Ticket {
  id: string
  customerId: string
  orderId?: string
  type: TicketType
  status: "open" | "processing" | "closed"
  createdAt: string
  closedAt?: string
  /** refund amount, for refund tickets */
  amount?: number
  /** what was promised and by when, for promise tickets */
  dueAt?: string
  summary: string
  /** every time an agent restated the promise, in order — a promise made three times is one promise broken three times */
  promiseLog?: { at: string; by: string; text: string; dueAt: string }[]
}

export interface ContactRecord {
  id: string
  customerId: string
  at: string
  channel: Channel
  orderId?: string
  topic: string
  resolved: boolean
  /** the consumer's lines from that conversation — the chat corpus */
  lines: string[]
  /** what the consumer already handed over in that contact (photos, documents) */
  evidence?: string[]
}

export interface CustomerLite {
  id: string
  name: string
  tier: CustomerProfile["tier"]
  channel: Channel
}

export const TICKET_TYPE_CN: Record<TicketType, string> = { refund: "退款", exchange: "换货", complaint: "投诉", adverse: "不良反应", logistics: "物流", promise: "服务承诺" }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
/** A moment `days` days and `hours` hours before the demo's "now". */
const ago = (days: number, hours = 0) => iso(new Date(DEMO_NOW.getTime() - (days * 24 + hours) * 3600000))

/* ── the five rehearsed customers: histories written by hand so the stories hold together ── */

const lin = CUSTOMERS.lin.id
const zhou = CUSTOMERS.zhou.id
const chen = CUSTOMERS.chen.id
const wang = CUSTOMERS.wang.id
const he = CUSTOMERS.he.id

const SCENARIO_ORDERS: OrderRecord[] = [
  { id: "TM20261003-4471", customerId: he, sku: "p-mistral-b5", product: "MISTRAL B5 修护舒缓霜 50ml", price: 268, channel: "tmall", paidAt: ago(8), status: "已签收", signedAt: ago(6, 1), batch: "MS2609C" },
  { id: "TM20260712-0815", customerId: he, sku: "p-mistral-cleanser", product: "MISTRAL 氨基酸温和洁面 120ml", price: 138, channel: "tmall", paidAt: ago(91), status: "已完成", signedAt: ago(89), batch: "MS2606A" },
  { id: "TM20260928-8812", customerId: lin, sku: "p-aurelle-a-serum", product: "AURELLE 臻颜紧致 A 醇精华 30ml", price: 680, channel: "tmall", paidAt: ago(13), status: "已签收", signedAt: ago(10), batch: "LX2608A" },
  { id: "TM20260702-1150", customerId: lin, sku: "p-aurelle-uv", product: "AURELLE 轻透防晒乳 SPF50+", price: 320, channel: "tmall", paidAt: ago(101), status: "已完成", signedAt: ago(98) },
  { id: "DY20261010-5521", customerId: zhou, sku: "p-aurelle-gift", product: "AURELLE 臻颜礼盒", price: 1580, channel: "douyin", paidAt: ago(1, 2), status: "待发货" },
  { id: "WX20260815-0931", customerId: chen, sku: "p-aurelle-gift", product: "AURELLE 臻颜礼盒", price: 1580, channel: "wechat", paidAt: ago(57), status: "已完成", signedAt: ago(54) },
  { id: "JD20261008-7710", customerId: wang, sku: "p-aurelle-uv", product: "AURELLE 轻透防晒乳 SPF50+", price: 320, channel: "jd", paidAt: ago(3), status: "已签收", signedAt: ago(2) },
  { id: "JD20260902-3318", customerId: wang, sku: "p-mistral-cleanser", product: "MISTRAL 氨基酸温和洁面 120ml", price: 138, channel: "jd", paidAt: ago(39), status: "已退款", signedAt: ago(37) },
  { id: "JD20260818-9027", customerId: wang, sku: "p-luminelle-cushion", product: "LUMINELLE 柔焦持妆气垫 #01", price: 420, channel: "jd", paidAt: ago(54), status: "已退款", signedAt: ago(52) },
]

const SCENARIO_TICKETS: Ticket[] = [
  {
    id: "T-2610-0388",
    customerId: he,
    orderId: "TM20261003-4471",
    type: "promise",
    status: "open",
    createdAt: ago(5, 19 + 40 / 60),
    dueAt: ago(4, 16),
    summary: "破损换新：承诺补寄一瓶 B5 修护舒缓霜，至今未发出。",
    promiseLog: [
      { at: ago(5, 19 + 30 / 60), by: "坐席 小禾", text: "明天给您补寄一瓶新的", dueAt: ago(4, 16) },
      { at: ago(3, 22 + 50 / 60), by: "坐席 小林", text: "仓库已经排单，明天一定发出", dueAt: ago(2, 16) },
      { at: ago(1, 14 + 15 / 60), by: "坐席 小禾", text: "明天上午一定发出", dueAt: ago(0, 22) },
    ],
  },
  { id: "T-2609-0412", customerId: chen, type: "complaint", status: "closed", createdAt: ago(40), closedAt: ago(38), summary: "反馈专属顾问离职后无人对接。工单以“已致歉”结案，未指派新顾问。" },
  { id: "T-2609-0977", customerId: chen, orderId: "WX20260815-0931", type: "promise", status: "open", createdAt: ago(26), dueAt: ago(19), summary: "承诺 7 天内补寄会员赠品（臻颜眼霜小样），至今未寄出。" },
  { id: "T-2609-1203", customerId: wang, orderId: "JD20260902-3318", type: "refund", status: "closed", createdAt: ago(36), closedAt: ago(35), amount: 138, summary: "称“与描述不符”，仅退款。" },
  { id: "T-2608-2291", customerId: wang, orderId: "JD20260818-9027", type: "refund", status: "closed", createdAt: ago(51), closedAt: ago(50), amount: 420, summary: "称“色号发错”，仅退款，未寄回。" },
]

const SCENARIO_CONTACTS: ContactRecord[] = [
  { id: "S-1005-201", customerId: he, at: ago(5, 19 + 40 / 60), channel: "tmall", orderId: "TM20261003-4471", topic: "破损售后", resolved: false, lines: ["面霜收到了，瓶身压裂了，漏了一半在盒子里", "照片已经发你们了，什么时候能换一瓶？"], evidence: ["破损照片 2 张"] },
  { id: "S-1007-118", customerId: he, at: ago(3, 22 + 55 / 60), channel: "tmall", orderId: "TM20261003-4471", topic: "补寄进度", resolved: false, lines: ["说好的昨天补寄呢？物流一点信息都没有"] },
  { id: "S-1009-093", customerId: he, at: ago(1, 14 + 20 / 60), channel: "tmall", orderId: "TM20261003-4471", topic: "补寄进度", resolved: false, lines: ["还是没发？你们上次也说明天，到底有没有人管"] },
  { id: "S-0702-118", customerId: lin, at: ago(101), channel: "tmall", orderId: "TM20260702-1150", topic: "售前咨询", resolved: true, lines: ["请问这款防晒敏感肌能用吗？会不会搓泥"] },
  { id: "S-1011-031", customerId: zhou, at: ago(0, 3), channel: "douyin", orderId: "DY20261010-5521", topic: "物流查询", resolved: false, lines: ["我昨天买的礼盒什么时候发货？后天要送人"] },
  { id: "S-0901-207", customerId: chen, at: ago(40), channel: "wechat", topic: "投诉", resolved: false, lines: ["小雅离职了？那以后谁来对接我，我用的东西还有人知道吗"] },
  { id: "S-0915-164", customerId: chen, at: ago(26), channel: "hotline", orderId: "WX20260815-0931", topic: "会员权益", resolved: false, lines: ["上次说给我补寄的赠品呢？我又得从头讲一遍是吗"] },
]

/* ── a generated population, so the risk board has something to watch ── */

const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章".split("")
const CHANNEL_LIST: Channel[] = ["tmall", "douyin", "wechat", "jd", "xiaohongshu", "hotline"]
const TIERS: CustomerProfile["tier"][] = ["新客", "银卡", "银卡", "金卡", "金卡", "黑金"]

/** The chat corpus: consumer lines grouped by the situation they come from. */
const CORPUS = {
  calm: ["请问这款面霜敏感肌可以用吗", "气垫 01 和 02 哪个更白一点", "会员积分怎么兑换", "精华和面霜的使用顺序是什么", "这个礼盒有礼袋吗", "防晒需要卸妆吗"],
  thanks: ["收到了，包装很好，谢谢", "好的明白了，谢谢你这么耐心"],
  chase: [
    ["我的快递三天没更新了，帮我看下到哪了"],
    ["昨天问过了，说会帮我催，现在还是没动静"],
    ["第三次来问了！！到底什么时候能到，再不处理我就投诉了"],
    ["我真的无语，每次都让我等，你们到底管不管"],
  ],
  refund: ["这个不想要了，申请退款", "和描述不符，给我退了吧", "颜色不对，退款", "用着不合适，退掉"],
  pr: ["再不给我解决我就发小红书曝光你们", "我已经在黑猫投诉上发帖了，你们看着办", "客服态度这么差，我要发微博让大家看看"],
  adverse: ["用了两天脸上起红疹，特别痒，怎么回事", "涂完脸发烫还脱皮，是不是产品有问题", "眼周用了以后红肿，现在不敢再用了"],
}

type Pattern = "normal" | "repeat_contact" | "repeat_refund" | "pr" | "adverse"
/** How many generated customers show each pattern. Planted on purpose; the board must find them by rule. */
const PLAN: [Pattern, number][] = [
  ["repeat_contact", 6],
  ["repeat_refund", 4],
  ["pr", 3],
  ["adverse", 3],
  ["normal", 20],
]

function generate() {
  const rand = mulberry32(20261011)
  const customers: CustomerLite[] = []
  const orders: OrderRecord[] = []
  const tickets: Ticket[] = []
  const contacts: ContactRecord[] = []
  let n = 0
  const order = (customerId: string, channel: Channel, daysAgo: number, status: OrderRecord["status"]) => {
    const p = pick(rand, PRODUCTS)
    const o: OrderRecord = { id: `G${String(100000 + orders.length * 37)}`, customerId, sku: p.id, product: `${p.brand.split(" ")[0]} ${p.name}`, price: p.price, channel, paidAt: ago(daysAgo), status, signedAt: status === "待发货" || status === "运输中" ? undefined : ago(Math.max(0, daysAgo - 3)) }
    orders.push(o)
    return o
  }

  for (const [pattern, count] of PLAN) {
    for (let k = 0; k < count; k++) {
      n++
      const id = `G-${String(40000 + n * 113)}`
      const c: CustomerLite = { id, name: `${SURNAMES[n % SURNAMES.length]}${rand() < 0.72 ? "女士" : "先生"}`, tier: pick(rand, TIERS), channel: pick(rand, CHANNEL_LIST) }
      customers.push(c)
      const cid = (i: number) => `S-${String(n).padStart(2, "0")}${i}`
      const tid = () => `T-G${String(n).padStart(2, "0")}${tickets.length % 10}`

      if (pattern === "normal") {
        const o = order(id, c.channel, 5 + Math.floor(rand() * 60), "已完成")
        contacts.push({ id: cid(1), customerId: id, at: ago(3 + Math.floor(rand() * 40), Math.floor(rand() * 9)), channel: c.channel, orderId: o.id, topic: "咨询", resolved: true, lines: [pick(rand, CORPUS.calm)] })
        if (rand() < 0.3) contacts.push({ id: cid(2), customerId: id, at: ago(1 + Math.floor(rand() * 2)), channel: c.channel, orderId: o.id, topic: "咨询", resolved: true, lines: [pick(rand, CORPUS.thanks)] })
        if (rand() < 0.2) tickets.push({ id: tid(), customerId: id, orderId: o.id, type: "refund", status: "closed", createdAt: ago(20 + Math.floor(rand() * 30)), closedAt: ago(18), amount: o.price, summary: "七天无理由退货，已退款。" })
      }
      if (pattern === "repeat_contact") {
        const o = order(id, c.channel, 6 + k, "运输中")
        const times = 3 + (k % 2) // 3 or 4 contacts inside a week
        for (let i = 0; i < times; i++) contacts.push({ id: cid(i + 1), customerId: id, at: ago(times - i - 1, 2 + i), channel: c.channel, orderId: o.id, topic: "物流查询", resolved: false, lines: CORPUS.chase[i] })
        tickets.push({ id: tid(), customerId: id, orderId: o.id, type: "logistics", status: k % 3 === 0 ? "processing" : "open", createdAt: ago(times - 1), summary: "物流停滞，已催件，暂无结果。" })
      }
      if (pattern === "repeat_refund") {
        const times = 3 + (k % 3)
        for (let i = 0; i < times; i++) {
          const o = order(id, c.channel, 12 + i * 17, "已退款")
          tickets.push({ id: tid(), customerId: id, orderId: o.id, type: "refund", status: i === 0 && k % 2 === 0 ? "processing" : "closed", createdAt: ago(9 + i * 17), closedAt: i === 0 && k % 2 === 0 ? undefined : ago(8 + i * 17), amount: o.price, summary: pick(rand, CORPUS.refund) })
        }
        contacts.push({ id: cid(1), customerId: id, at: ago(9), channel: c.channel, topic: "退换退款", resolved: true, lines: [pick(rand, CORPUS.refund)] })
      }
      if (pattern === "pr") {
        const o = order(id, c.channel, 9, "已签收")
        contacts.push({ id: cid(1), customerId: id, at: ago(3), channel: c.channel, orderId: o.id, topic: "投诉", resolved: false, lines: ["客服一直不回复，我要投诉"] })
        contacts.push({ id: cid(2), customerId: id, at: ago(0, 5 + k), channel: c.channel, orderId: o.id, topic: "投诉", resolved: false, lines: [CORPUS.pr[k % CORPUS.pr.length]] })
        tickets.push({ id: tid(), customerId: id, orderId: o.id, type: "complaint", status: k === 0 ? "processing" : "open", createdAt: ago(3), summary: "投诉客服响应慢。" })
      }
      if (pattern === "adverse") {
        const o = order(id, c.channel, 8, "已签收")
        contacts.push({ id: cid(1), customerId: id, at: ago(1 + k, 4), channel: c.channel, orderId: o.id, topic: "不良反应", resolved: k === 2, lines: [CORPUS.adverse[k % CORPUS.adverse.length]] })
        tickets.push({ id: tid(), customerId: id, orderId: o.id, type: "adverse", status: k === 2 ? "closed" : k === 1 ? "processing" : "open", createdAt: ago(1 + k), closedAt: k === 2 ? ago(0, 20) : undefined, summary: "疑似不良反应，已建议停用，待回访。" })
      }
    }
  }
  return { customers, orders, tickets, contacts }
}

const G = generate()

export const ALL_CUSTOMERS: CustomerLite[] = [...Object.values(CUSTOMERS).map((c) => ({ id: c.id, name: c.name, tier: c.tier, channel: c.channelHabits[0] })), ...G.customers]
export const ORDERS: OrderRecord[] = [...SCENARIO_ORDERS, ...G.orders]
export const TICKETS: Ticket[] = [...SCENARIO_TICKETS, ...G.tickets]
export const CONTACTS: ContactRecord[] = [...SCENARIO_CONTACTS, ...G.contacts]

export const ordersOf = (customerId: string) => ORDERS.filter((o) => o.customerId === customerId)
export const ticketsOf = (customerId: string) => TICKETS.filter((t) => t.customerId === customerId)
export const contactsOf = (customerId: string) => CONTACTS.filter((c) => c.customerId === customerId)

export const daysBetween = (from: string, to: Date = DEMO_NOW) => (to.getTime() - new Date(from).getTime()) / 86400000
