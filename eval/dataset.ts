import type { EmotionKey, IntentKey, RiskCategory } from "../src/lib/types"

/**
 * Evaluation set for the understanding agents (问 意图 · 闻 情绪 · 切 风险) and for 检 (compliance).
 *
 * Provenance, stated plainly: every item was written and labelled by the project author (one
 * annotator, no second opinion), modelled on common beauty e-commerce service situations. It is
 * not the organisers' data. `dev` items may be used to tune rules; `test` items are held out —
 * rules are never adjusted against individual test errors, only against dev.
 *
 * Labels
 *   intents    acceptable primary intents (one or two — some messages genuinely carry two)
 *   emotions   acceptable dominant emotions (one or two)
 *   risks      risk categories a careful reader would flag at L2 or above from the text alone
 */

type I = IntentKey
type E = EmotionKey
type R = RiskCategory

export interface EvalItem {
  text: string
  intents: I[]
  emotions: E[]
  risks: R[]
}

const m = (text: string, intents: I[], emotions: E[], risks: R[] = []): EvalItem => ({ text, intents, emotions, risks })

export const DEV: EvalItem[] = [
  m("面霜用了两天脸上起了一片小红点，还有点痒", ["adverse_reaction"], ["anxiety"], ["safety"]),
  m("快递都五天了还没到，你们到底发没发货啊", ["logistics"], ["anger", "anxiety"]),
  m("这款精华孕妇可以用吗", ["skin_matching"], ["calm", "anticipation"]),
  m("我要退货，颜色和图片差太多了", ["return_refund"], ["anger", "sadness"]),
  m("你们家是不是卖假货啊，味道和我在专柜买的不一样", ["authenticity"], ["anger", "anxiety"]),
  m("双十一有什么活动吗，现在买划算还是再等等", ["price_promo"], ["anticipation", "calm"]),
  m("早上用完精华可以直接涂防晒吗", ["usage_guidance"], ["calm"]),
  m("我的积分怎么少了两千", ["membership"], ["anxiety", "anger"]),
  m("想给婆婆买套护肤品当生日礼物，预算一千左右", ["gift_consult"], ["anticipation", "calm"]),
  m("算了不想说了，反正你们也不会管", ["complaint"], ["sadness", "grievance"], ["churn"]),
  m("再不给我处理，我就去12315投诉你们", ["complaint"], ["anger"], ["legal"]),
  m("我已经把聊天记录发到微博了，让大家评评理", ["complaint"], ["anger"], ["pr"]),
  m("谢谢小姐姐，问题解决了，你真的很耐心", ["other"], ["gratitude", "joy"]),
  m("这个防晒真的能防水吗，去海边够不够用", ["product_efficacy"], ["anticipation", "calm"]),
  m("我初三，脸上痘痘很多，可以用你们的酸类精华吗", ["skin_matching", "product_efficacy"], ["anticipation", "anxiety"], ["minor"]),
  m("用了眼霜眼睛肿得睁不开，已经去医院挂急诊了", ["adverse_reaction"], ["anxiety", "anger"], ["safety"]),
  m("你们客服是机器人吗，回答的都是废话", ["complaint"], ["anger", "grievance"]),
  m("订单显示已签收可是我根本没收到货，怎么回事", ["logistics"], ["anxiety", "anger"]),
  m("气垫哪个色号适合偏黄的皮肤", ["pre_sale_consult", "skin_matching"], ["calm", "anticipation"]),
  m("假一赔十，今天不赔我就起诉", ["authenticity", "complaint"], ["anger"], ["legal", "fraud"]),
  m("收到了，包装很精致，我妈特别喜欢", ["other"], ["joy", "gratitude"]),
  m("精华和面霜哪个先用", ["usage_guidance"], ["calm"]),
  m("洗面奶用完脸很紧绷还脱皮，是不是不适合我", ["adverse_reaction", "skin_matching"], ["anxiety"], ["safety"]),
  m("我是黑金会员，为什么生日礼没有收到", ["membership"], ["grievance", "anger"]),
  m("这个面霜能祛斑吗，我脸上有晒斑", ["product_efficacy"], ["anticipation", "calm"]),
  m("申请退款三天了钱还没到账", ["return_refund"], ["anxiety", "anger"]),
  m("以后不会再买你们家东西了", ["complaint"], ["sadness", "anger"], ["churn"]),
  m("帮我看一下这个批号是不是正品 LM2609B", ["authenticity"], ["calm", "anxiety"]),
  m("有没有适合油皮的洁面推荐", ["pre_sale_consult", "skin_matching"], ["calm", "anticipation"]),
  m("每次都要我重新说一遍订单号，你们系统里看不到吗", ["complaint"], ["grievance", "anger"]),
  m("礼盒可以帮忙写贺卡吗", ["gift_consult"], ["calm", "anticipation"]),
  m("太气人了，同一个问题我打了四次电话", ["complaint"], ["anger"]),
  m("下单的时候忘记用券了，能补差价吗", ["price_promo"], ["anticipation", "anxiety"]),
  m("我女儿12岁，这个防晒她能用吗", ["skin_matching"], ["calm", "anticipation"], ["minor"]),
  m("用完之后脸火辣辣地疼，你们必须给我个说法", ["adverse_reaction"], ["anger", "anxiety"], ["safety"]),
  m("好的知道了", ["other"], ["calm"]),
  m("物流一直停在杭州中转站不动", ["logistics"], ["anxiety", "calm"]),
  m("我朋友是做美妆博主的，这事我会让她发出来", ["complaint"], ["anger"], ["pr"]),
  m("这瓶和我上次买的质地不一样，是不是换配方了", ["authenticity", "pre_sale_consult"], ["anxiety", "calm"]),
  m("能不能换个色号，02 太白了", ["return_refund"], ["calm", "anticipation"]),
  m("退了三次了都说在处理，你们是不是不想退", ["return_refund", "complaint"], ["anger", "grievance"]),
  m("终于收到了，比预计的还早一天，开心", ["other"], ["joy", "gratitude"]),
  m("敏感肌换季泛红，用哪款比较温和", ["skin_matching", "pre_sale_consult"], ["calm", "anxiety"]),
  m("我要找你们领导，这个处理结果我不接受", ["complaint"], ["anger"]),
]

export const TEST: EvalItem[] = [
  m("抹上去没一会儿脸就烧得慌，赶紧洗掉了", ["adverse_reaction"], ["anxiety"], ["safety"]),
  m("都一个礼拜了，包裹影子都没见着", ["logistics"], ["anger", "anxiety"]),
  m("哺乳期能擦这个吗", ["skin_matching"], ["calm", "anticipation"]),
  m("跟详情页根本不是一个东西，给我退了", ["return_refund"], ["anger"]),
  m("盒子上的防伪标刮开查不到，这正常吗", ["authenticity"], ["anxiety"]),
  m("现在下单有赠品吗", ["price_promo"], ["anticipation", "calm"]),
  m("晚上是先擦水还是先上精华", ["usage_guidance"], ["calm"]),
  m("升级金卡还差多少消费", ["membership"], ["calm", "anticipation"]),
  m("男朋友过生日，想送他一套，有推荐吗", ["gift_consult"], ["anticipation", "joy"]),
  m("行吧，就这样吧，我也懒得计较了", ["complaint", "other"], ["sadness", "grievance"], ["churn"]),
  m("你们要是继续拖，我只能找消协了", ["complaint"], ["anger"], ["legal"]),
  m("我在小红书发的避雷帖已经两百多赞了", ["complaint"], ["anger"], ["pr"]),
  m("辛苦啦，这么晚还帮我处理", ["other"], ["gratitude"]),
  m("坚持用一个月细纹能淡一点吗", ["product_efficacy"], ["anticipation"]),
  m("我今年14，妈妈不让我用，可是同学都在用", ["skin_matching", "other"], ["anticipation", "grievance"], ["minor"]),
  m("嘴唇用了唇釉之后肿了一圈，还起了水泡", ["adverse_reaction"], ["anxiety"], ["safety"]),
  m("你们的服务可真是太好了，等了三天没一个人理我", ["complaint"], ["anger", "grievance"]),
  m("快递员说放驿站了，可驿站说没有我的件", ["logistics"], ["anxiety", "anger"]),
  m("黄黑皮选哪个色不显假白", ["pre_sale_consult", "skin_matching"], ["calm", "anticipation"]),
  m("这明显是高仿，按规定退一赔三，少一分都不行", ["authenticity", "complaint"], ["anger"], ["fraud", "legal"]),
  m("用了半瓶皮肤状态好多了，会回购的", ["other"], ["joy", "gratitude"]),
  m("一次按几泵比较合适", ["usage_guidance"], ["calm"]),
  m("涂完第二天下巴冒了好多闭口", ["adverse_reaction"], ["anxiety"], ["safety"]),
  m("说好的专属顾问呢，三个月没人联系过我", ["membership", "complaint"], ["grievance", "sadness"]),
  m("痘印能不能淡化", ["product_efficacy"], ["anticipation", "calm"]),
  m("钱怎么还没退回来，都显示退款成功了", ["return_refund"], ["anxiety", "anger"]),
  m("这是最后一次在你们家买东西", ["complaint"], ["sadness", "anger"], ["churn"]),
  m("瓶底的生产批号和盒子上的对不上", ["authenticity"], ["anxiety"]),
  m("干皮冬天用哪个面霜够滋润", ["pre_sale_consult", "skin_matching"], ["calm", "anticipation"]),
  m("上个客服答应今天回电话，到现在也没有", ["complaint"], ["grievance", "anger"]),
  m("可以开发票吗，公司要报销", ["other"], ["calm"]),
  m("真的服了，一个破快递催了八百遍", ["logistics", "complaint"], ["anger"]),
  m("昨天买的今天就降价了，能退差价吗", ["price_promo"], ["anger", "grievance", "anticipation"]),
  m("给上小学的孩子涂的面霜有吗", ["pre_sale_consult", "skin_matching"], ["calm", "anticipation"], ["minor"]),
  m("脸上又痒又烫一晚上没睡好，明天还要上班", ["adverse_reaction"], ["anxiety", "anger"], ["safety"]),
  m("嗯嗯", ["other"], ["calm"]),
  m("显示派送中两天了都没人给我打电话", ["logistics"], ["anxiety", "anger"]),
  m("我认识电视台的记者，你们自己掂量", ["complaint"], ["anger"], ["pr"]),
  m("这次的颜色比上次深很多，是不是放太久了", ["authenticity", "complaint"], ["anxiety"]),
  m("可以把洁面换成爽肤水吗，我洁面还有很多", ["return_refund", "pre_sale_consult"], ["calm", "anticipation"]),
  m("同一笔退款我已经催了四次", ["return_refund", "complaint"], ["anger", "grievance"]),
  m("哈哈哈太惊喜了，居然还送了小样", ["other"], ["joy"]),
  m("刚做完医美，可以用你们的修护霜吗", ["skin_matching"], ["calm", "anxiety"]),
  m("别跟我讲流程，我要一个能做主的人", ["complaint"], ["anger"]),
  m("眼睛进了一点精华，现在一直流泪发红", ["adverse_reaction"], ["anxiety"], ["safety"]),
  m("你们发货是按什么顺序，我看别人后买的都到了", ["logistics"], ["grievance", "anger"]),
  m("这个真的不含酒精吗，我酒精过敏", ["skin_matching", "product_efficacy"], ["anxiety", "calm"]),
  m("能不能便宜点，我一次买三瓶", ["price_promo"], ["anticipation"]),
  m("我要投诉昨天那个客服，说话阴阳怪气的", ["complaint"], ["anger", "grievance"]),
  m("试了小样很喜欢，正装什么时候补货", ["pre_sale_consult"], ["anticipation", "joy"]),
  m("生产日期是去年的，是不是快过期了", ["authenticity", "pre_sale_consult"], ["anxiety"]),
  m("包裹外箱都压扁了，里面瓶子漏了一半", ["return_refund", "logistics", "complaint"], ["anger", "sadness"]),
  m("没事了，我自己找到了，谢谢", ["other"], ["gratitude", "calm"]),
  m("这个月的会员日有双倍积分吗", ["membership", "price_promo"], ["calm", "anticipation"]),
  m("你们要对我的脸负责，我明天就去做鉴定", ["adverse_reaction", "complaint"], ["anger"], ["safety", "legal"]),
  m("和水杨酸能一起用吗", ["usage_guidance"], ["calm"]),
  m("我不想再解释了，你们自己看聊天记录吧", ["complaint"], ["grievance", "sadness"], ["churn"]),
  m("能指定明天下午送到吗，我要当面给她", ["logistics", "gift_consult"], ["anticipation", "anxiety"]),
  m("全网都在说你们这批货有问题，是真的吗", ["authenticity", "complaint"], ["anxiety"], ["pr"]),
  m("帮我取消订单吧，不想等了", ["return_refund"], ["sadness", "anger"]),
  m("太失望了，认准你们家五年了", ["complaint"], ["sadness"], ["churn"]),
  m("请问这个是早晚都可以用吗", ["usage_guidance"], ["calm"]),
  m("我高一住校，有没有便宜好用的防晒", ["pre_sale_consult", "price_promo"], ["anticipation", "calm"], ["minor"]),
  m("包装盒没有塑封，是不是被人拆过", ["authenticity"], ["anxiety"]),
  m("多谢多谢，换货已经收到了，色号这次对了", ["other"], ["gratitude", "joy"]),
  m("用了三天了一点效果都没有", ["product_efficacy", "complaint"], ["sadness", "anger"]),
]

/** 检 · compliance: agent replies, and whether sending them should be blocked. */
export interface ReplyItem {
  text: string
  block: boolean
}
const r = (text: string, block: boolean): ReplyItem => ({ text, block })

export const REPLIES_DEV: ReplyItem[] = [
  r("这肯定是过敏了，不是我们产品的问题", true),
  r("我们的产品百分百安全，放心用", true),
  r("这款精华有消炎的作用", true),
  r("您把差评删了我马上给您退款", true),
  r("是您自己使用方法不对", true),
  r("这是市面上最好的面霜", false), // superlative: warned, not blocked
  r("结果出来我第一时间告诉您", false),
  r("建议您先停用，并到医院皮肤科看看", false),
  r("我们会认真核查产品与批次", false),
  r("预计明天下午送达，以物流信息为准", false),
  r("非常抱歉给您带来不好的体验", false),
  r("这款可以治疗痘痘", true),
  r("您的情况应该是皮炎", true),
  r("用我们的面霜绝对不会过敏", true),
  r("理解您的着急，我马上帮您催一下", false),
  r("这个问题与我们品牌无关", true),
  r("退款与您的评价无关，我们会照常办理", false),
  r("这款是药妆级别的修护霜", true),
  r("A 醇不建议未成年人使用", false),
  r("麻烦您提供一下订单号和批号照片", false),
]

export const REPLIES_TEST: ReplyItem[] = [
  r("您这是典型的激素脸", true),
  r("我们家的东西不可能有问题的", true),
  r("这个保证没有任何副作用", true),
  r("这款对痘痘有疗效的", true),
  r("您帮忙把帖子撤一下，我给您申请补偿", true),
  r("肯定是您叠加了别的产品才这样", true),
  r("这款能杀菌，很适合您", true),
  r("您说得对，这件事不该让您受委屈", false),
  r("请先用清水冲洗，不要揉搓", false),
  r("合理的就医费用我们会协助处理", false),
  r("第一步请先停用，第二步发我批号", false),
  r("我们不能判断是否过敏，建议咨询医生", false),
  r("这款的备案功效是抗皱和紧致", false),
  r("不是您的问题，是我们交接没做好", false),
  r("给您一个五星好评返现二十元", true),
  r("我可以保证这批货完全没问题", true),
  r("这个可以根治闭口", true),
  r("您的手机号 13912345678 我已经记下了", false), // privacy warning, not a block
  r("会员生日月有专属礼遇，我帮您看一下", false),
  r("这不属于质量问题，没法处理", true),
  r("核验结果出来之前，我们不能承诺赔付金额", false),
  r("已经为您改派顺丰，运费我们承担", false),
  r("看着像是湿疹，涂点药膏就好了", true),
  r("这款很受欢迎，口碑不错", false),
  r("您放心，用了一定有效", true),
  r("谢谢您的耐心，有进展我主动联系您", false),
  r("这是您个人肤质的原因，和产品没关系", true),
  r("我们会留存沟通记录并按流程核验", false),
  r("您孩子用了也完全没事的", true),
  r("这款不含酒精，成分表可以发给您", false),
]
