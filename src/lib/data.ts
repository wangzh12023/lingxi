import type { CustomerProfile, KnowledgeDoc, Product } from "./types"

/**
 * Demo catalogue, knowledge base and customer records. Brands, products and people are invented,
 * so the demo never implies an incident with a real product.
 *
 * `claims` uses the efficacy category names of the cosmetics classification catalogue. A reply may
 * not claim an efficacy the product is not filed for — the auditor checks replies against this list.
 */
export const PRODUCTS: Product[] = [
  {
    id: "p-aurelle-a-serum",
    brand: "AURELLE 澳若",
    name: "臻颜紧致 A 醇精华 30ml",
    aliases: ["A醇精华", "A 醇精华", "A醇", "A 醇", "视黄醇"],
    category: "精华",
    price: 680,
    keyIngredients: ["0.3% 视黄醇（A 醇）", "胜肽复合物", "神经酰胺 NP"],
    claims: ["抗皱", "紧致"],
    cautions: ["首次使用需建立耐受", "孕期哺乳期慎用", "使用期间需严格防晒", "避免与高浓度酸类同晚叠加"],
    suitableFor: ["中性", "油性", "耐受良好的混合性"],
    strongActive: true,
  },
  {
    id: "p-aurelle-uv",
    brand: "AURELLE 澳若",
    name: "轻透防晒乳 SPF50+ PA++++ 50ml",
    aliases: ["防晒乳", "防晒"],
    category: "防晒",
    price: 320,
    keyIngredients: ["广谱防晒剂", "积雪草提取物"],
    claims: ["防晒"],
    cautions: ["需足量涂抹", "游泳出汗后补涂"],
    suitableFor: ["所有肤质"],
  },
  {
    id: "p-mistral-b5",
    brand: "MISTRAL 雾屿",
    name: "B5 修护舒缓霜 50ml",
    aliases: ["B5 修护霜", "B5修护霜", "修护霜", "B5"],
    category: "面霜",
    price: 268,
    keyIngredients: ["5% 泛醇（维生素原 B5）", "积雪草苷", "角鲨烷"],
    claims: ["修护", "舒缓", "保湿"],
    cautions: ["极少数人可能出现闷痘"],
    suitableFor: ["敏感肌", "屏障受损"],
  },
  {
    id: "p-mistral-cleanser",
    brand: "MISTRAL 雾屿",
    name: "氨基酸温和洁面 120ml",
    aliases: ["氨基酸洁面", "洁面"],
    category: "洁面",
    price: 138,
    keyIngredients: ["氨基酸表活", "甘油"],
    claims: ["清洁"],
    cautions: [],
    suitableFor: ["所有肤质"],
  },
  {
    id: "p-luminelle-cushion",
    brand: "LUMINELLE 璐米",
    name: "柔焦持妆气垫 #01 象牙白",
    aliases: ["气垫"],
    category: "底妆",
    price: 420,
    keyIngredients: ["柔焦粉体", "透明质酸钠"],
    claims: ["美容修饰"],
    cautions: ["需卸妆"],
    suitableFor: ["中性至油性"],
  },
  {
    id: "p-verdan-hair",
    brand: "VERDAN 薇丹",
    name: "头皮养护精华 60ml",
    aliases: ["头皮精华", "头皮养护精华"],
    category: "头皮护理",
    price: 358,
    keyIngredients: ["咖啡因", "烟酰胺", "生物素"],
    claims: ["控油", "护发"],
    cautions: ["避免接触眼部"],
    suitableFor: ["油性头皮"],
  },
  {
    id: "p-aurelle-gift",
    brand: "AURELLE 澳若",
    name: "臻颜礼盒（精华 + 面霜 + 眼霜）",
    aliases: ["礼盒", "臻颜礼盒"],
    category: "礼盒",
    price: 1580,
    keyIngredients: ["A 醇", "胜肽", "咖啡因"],
    claims: ["抗皱", "紧致", "保湿"],
    cautions: ["A 醇需建立耐受"],
    suitableFor: ["熟龄肌"],
    strongActive: true,
  },
]

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, Product>

/** The catalogue product a piece of text is talking about — the longest alias that appears wins. */
export function findProduct(text: string): Product | undefined {
  let best: { p: Product; len: number } | undefined
  for (const p of PRODUCTS) for (const a of p.aliases) if (text.includes(a) && (!best || a.length > best.len)) best = { p, len: a.length }
  return best?.p
}

/**
 * Knowledge base: operating procedures, policies, regulation digests, product sheets and cases.
 * Procedures, policies and cases are invented for the demo. The regulation entries are short
 * paraphrases written for this prototype: they name the instrument but deliberately quote no
 * article numbers or deadlines, and must be replaced with reviewed text before any real use.
 */
export const KNOWLEDGE: KnowledgeDoc[] = [
  {
    id: "sop-promise-01",
    kind: "sop",
    title: "服务承诺与补寄规范",
    source: "消费者服务中心 · 作业规范（演示）",
    tags: ["服务承诺", "补寄", "失约", "破损", "工单", "回访"],
    updatedAt: "2026-09-30",
    body: "",
    clauses: [
      { id: "sop-promise-01#1", title: "承诺先建单", applies: "向消费者承诺补寄、退款、回电或任何期限之前", text: "承诺须当场建立工单并写明期限。工单提交成功之前，只能说“我为您申请”，不能说“已经安排”。" },
      { id: "sop-promise-01#2", title: "失约先认错", applies: "此前的承诺已经逾期", text: "先承认失约并致歉，不再给出新的口头时间；用工单号、快递单号等可查证的凭证代替“明天”。" },
      { id: "sop-promise-01#3", title: "再次承诺需组长确认", applies: "承诺逾期后再次承诺", text: "逾期后的新承诺须经组长确认能够兑现。组长可批准顺丰加急，运费由品牌承担。" },
      { id: "sop-promise-01#4", title: "破损可直接退款", applies: "商品破损、消费者不愿再等补寄", text: "可以直接为消费者办理退款，破损商品无需寄回；退款金额以订单实付为准。" },
      { id: "sop-promise-01#5", title: "到期回访", applies: "承诺的期限到达时", text: "期限到达时主动回访，确认已经兑现再结案；没有兑现的，重新打开工单，并主动告诉消费者原因和新的处理方式。" },
    ],
  },
  {
    id: "sop-adr-01",
    kind: "sop",
    title: "疑似不良反应接待规范",
    source: "消费者服务中心 · 作业规范（演示）",
    tags: ["不良反应", "过敏", "刺痛", "红肿", "皮肤不适"],
    updatedAt: "2026-08-12",
    body:
      "一、先关怀后核实：首句须表达关心并建议立即停用、清水冲洗，严禁质疑消费者的使用方法。\n二、采集五项信息：产品与批号、开始使用的时间、使用方法与频次、症状与部位、是否就医及既往过敏史。\n三、建议就医：症状持续或加重时，建议到正规医院皮肤科就诊并保留病历与票据，合理费用按《就医费用协助政策》处理。\n四、禁止行为：不做医学判断，不断言“是过敏”或“不是产品问题”，不以退款或补偿为条件要求删除评价。\n五、上报：录入不良反应监测系统，内部时限为识别后 24 小时；情形严重或可能引发较大影响的，立即升级质量法规部。",
  },
  {
    id: "policy-medical-01",
    kind: "policy",
    title: "就医费用协助政策",
    source: "售后权益政策（演示）",
    tags: ["就医", "医药费", "不良反应", "协助"],
    updatedAt: "2026-06-01",
    body:
      "消费者因疑似产品相关的皮肤不适到正规医疗机构就诊的，凭病历与票据可申请合理就医费用协助。单次 800 元以内由主管审批；超出部分或涉及长期治疗的，由质量法规部与法务评估。协助不以消费者撤回评价或承诺不投诉为前提。",
    clauses: [
      { id: "policy-medical-01#1", title: "就医费用协助", applies: "疑似产品相关的皮肤不适到正规医疗机构就诊", text: "凭病历与票据可申请合理就医费用协助。单次 800 元以内由主管审批；超出部分或涉及长期治疗的，由质量法规部与法务评估。" },
      { id: "policy-medical-01#2", title: "不以撤评为条件", applies: "提供任何协助时", text: "协助不以消费者撤回评价或承诺不投诉为前提。" },
    ],
  },
  {
    id: "policy-return-01",
    kind: "policy",
    title: "皮肤不适无忧退政策",
    source: "售后权益政策（演示）",
    tags: ["退款", "退货", "已拆封", "皮肤不适"],
    updatedAt: "2026-06-01",
    body:
      "因皮肤不适申请退货的，已拆封商品支持全额退款，无需寄回剩余产品；需要做批次检测时，由品牌上门取件并承担运费。退款在审核通过后 24 小时内原路退回。",
    clauses: [
      { id: "policy-return-01#1", title: "已拆封全额退款", applies: "因皮肤不适申请退货", text: "因皮肤不适申请退货的，已拆封商品支持全额退款，无需寄回剩余产品。" },
      { id: "policy-return-01#2", title: "批次检测上门取件", applies: "需要对产品做批次检测时", text: "需要做批次检测时，由品牌上门取件并承担运费。" },
      { id: "policy-return-01#3", title: "退款时效", applies: "退货审核通过之后", text: "退款在审核通过后 24 小时内原路退回。" },
    ],
  },
  {
    id: "policy-comp-01",
    kind: "policy",
    title: "服务补偿权限矩阵",
    source: "客服运营 · 权限管理（演示）",
    tags: ["补偿", "优惠券", "权限", "赠品", "审批"],
    updatedAt: "2026-07-20",
    body:
      "一线坐席：50 元以内的无门槛券或小样礼包，无需审批。组长：200 元以内。主管：800 元以内，含就医费用协助。超过 800 元，或涉及法律、媒体风险的，须经跨部门会诊并由值班主管确认。补偿应与消费者的损失相称，避免过度补偿。",
    clauses: [
      { id: "policy-comp-01#1", title: "一线坐席", applies: "提出补偿时", text: "50 元以内的无门槛券或小样礼包，无需审批。" },
      { id: "policy-comp-01#2", title: "组长与主管", applies: "补偿超过 50 元时", text: "组长：200 元以内。主管：800 元以内，含就医费用协助。" },
      { id: "policy-comp-01#3", title: "会诊", applies: "补偿超过 800 元，或涉及法律、媒体风险时", text: "须经跨部门会诊并由值班主管确认。补偿应与消费者的损失相称，避免过度补偿。" },
    ],
  },
  {
    id: "reg-adr-01",
    kind: "regulation",
    title: "《化妆品不良反应监测管理办法》· 报告原则与时限",
    source: "国家药监局公告 2022 年第 16 号 · 2022-10-01 施行",
    tags: ["不良反应", "监测", "上报", "报告时限", "法规", "可疑即报"],
    updatedAt: "2026-10-12",
    verifiedAt: "2026-10-12",
    refs: [{ label: "公告与附件（国家药监局）", url: "https://www.nmpa.gov.cn/xxgk/ggtg/hzhpggtg/jmhzhptg/20220221165805149.html" }],
    body:
      "【原文】第十八条  化妆品不良反应报告遵循可疑即报的原则，怀疑与使用化妆品有关的人体损害，均应当报告。\n【原文】第二十三条  属于一般化妆品不良反应的，化妆品注册人、备案人、受托生产企业、化妆品经营者、医疗机构等应当自发现或者获知化妆品不良反应之日起30日内报告，属于严重化妆品不良反应的，应当自发现或者获知之日起15日内报告，属于可能引发较大社会影响的化妆品不良反应应当自发现或者获知之日起3日内报告。对于不良反应情况和分析评价结果等有新的发现或者认知的，应当及时补充报告。\n【原文】严重化妆品不良反应，是指正常使用化妆品引起以下损害情形之一的反应：（一）导致暂时性或者永久性功能丧失，影响正常人体和社会功能的，如皮损持久不愈合、瘢痕形成、永久性脱发、明显损容性改变等；（二）导致人体全身性损害的，如肝肾功能异常、过敏性休克等；（三）导致住院治疗或者医疗机构认为有必要住院治疗的；（四）导致人体其他严重损害、危及生命或者造成死亡的。\n【原文】可能引发较大社会影响的化妆品不良反应，是指因正常使用同一化妆品在一定区域内，引发较大社会影响或者造成多人严重损害的化妆品不良反应。\n【原文】第二十四条  化妆品注册人、备案人、受托生产企业、医疗机构应当客观、真实地记录与不良反应监测有关的活动并形成监测记录，记录保存期限不得少于报告之日起3年。\n【客服场景怎么用】坐席不判断是不是“过敏”，只做三件事：先关怀并建议停用；采集报告需要的四类信息（报告者、发生不良反应者、不良反应、所使用化妆品）；录入并转质量法规部。时限从“发现或者获知之日”起算，也就是消费者第一次告诉我们的那一天。属于哪一档由质量法规部认定；灵犀只做初筛：消费者提到住院、休克、留疤等情形时提示“疑似严重”，同批次反馈聚集时提示评估是否属于“可能引发较大社会影响”。",
  },
  {
    id: "reg-claims-01",
    kind: "regulation",
    title: "功效宣称与广告用语 · 条例、广告法、分类目录",
    source: "国务院令第 727 号 · 广告法（2021 年修正）· 国家药监局公告 2021 年第 49 号",
    tags: ["功效宣称", "备案", "广告用语", "医疗作用", "绝对化用语", "祛痘", "消炎", "药妆"],
    updatedAt: "2026-10-12",
    verifiedAt: "2026-10-12",
    refs: [{ label: "化妆品监督管理条例（中国政府网）", url: "https://www.gov.cn/zhengce/content/2020-06/29/content_5522593.htm" }, { label: "广告法（国家法律法规数据库）", url: "https://flk.npc.gov.cn/detail?id=ff8081817ab231eb017abd6bd860052d" }, { label: "化妆品分类规则和分类目录（国家药监局）", url: "https://www.nmpa.gov.cn/xxgk/ggtg/hzhpggtg/jmhzhptg/20210409160151122.html" }],
    body:
      "【原文 · 化妆品监督管理条例】第二十二条　化妆品的功效宣称应当有充分的科学依据。化妆品注册人、备案人应当在国务院药品监督管理部门规定的专门网站公布功效宣称所依据的文献资料、研究数据或者产品功效评价资料的摘要，接受社会监督。\n【原文 · 化妆品监督管理条例】第四十三条　化妆品广告的内容应当真实、合法。化妆品广告不得明示或者暗示产品具有医疗作用，不得含有虚假或者引人误解的内容，不得欺骗、误导消费者。\n【原文 · 广告法第九条】广告不得有下列情形：（三）使用“国家级”、“最高级”、“最佳”等用语；\n【原文 · 广告法】第十七条　除医疗、药品、医疗器械广告外，禁止其他任何广告涉及疾病治疗功能，并不得使用医疗用语或者易使推销的商品与药品、医疗器械相混淆的用语。\n【原文 · 功效宣称分类目录 06 祛痘】有助于减少或减缓粉刺（含黑头或白头）的发生；有助于粉刺发生后皮肤的恢复 注：调节激素影响的、杀（抗、抑）菌的和消炎的产品，不属于化妆品\n【客服场景怎么用】坐席对消费者说的话同样是对产品的宣称。灵犀拦截三类说法：治疗、消炎、杀菌、根治这类医疗用语；“药妆”这类暗示医疗作用的称呼；产品备案功效以外的功效。“最好”“第一”这类用语给出提醒。",
  },
  {
    id: "reg-pipl-01",
    kind: "regulation",
    title: "《个人信息保护法》· 敏感个人信息",
    source: "全国人大常委会 · 2021-11-01 施行",
    tags: ["隐私", "人脸", "敏感个人信息", "手机号", "健康信息", "未成年", "单独同意"],
    updatedAt: "2026-10-12",
    verifiedAt: "2026-10-12",
    refs: [{ label: "个人信息保护法（国家法律法规数据库）", url: "https://flk.npc.gov.cn/detail?id=ff8081817b6472a3017b656cc2040044" }],
    body:
      "【原文】第二十八条　敏感个人信息是一旦泄露或者非法使用，容易导致自然人的人格尊严受到侵害或者人身、财产安全受到危害的个人信息，包括生物识别、宗教信仰、特定身份、医疗健康、金融账户、行踪轨迹等信息，以及不满十四周岁未成年人的个人信息。\n【原文】第二十九条　处理敏感个人信息应当取得个人的单独同意；法律、行政法规规定处理敏感个人信息应当取得书面同意的，从其规定。\n【客服场景怎么用】消费者发来的面部照片、皮肤症状和就医记录，按敏感个人信息对待：只为处理这一次售后使用，界面上遮盖与判断无关的面部区域，流转给其他部门前脱敏。不满十四周岁未成年人的个人信息同样属于敏感个人信息。",
  },
  {
    id: "reg-comp-01",
    kind: "regulation",
    title: "惩罚性赔偿 ·“退一赔三”与“假一赔十”的出处",
    source: "消费者权益保护法（2013 年修正）· 食品安全法（2025 年修正）",
    tags: ["假一赔十", "退一赔三", "三倍", "十倍", "惩罚性赔偿", "欺诈", "真伪", "索赔"],
    updatedAt: "2026-10-12",
    verifiedAt: "2026-10-12",
    refs: [{ label: "消费者权益保护法（国家法律法规数据库）", url: "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7670606ef" }, { label: "食品安全法（国家法律法规数据库）", url: "https://flk.npc.gov.cn/detail?id=7b5a76d0461745a08d3f964916b87ef3" }],
    body:
      "【原文 · 消费者权益保护法第五十五条第一款】经营者提供商品或者服务有欺诈行为的，应当按照消费者的要求增加赔偿其受到的损失，增加赔偿的金额为消费者购买商品的价款或者接受服务的费用的三倍；增加赔偿的金额不足五百元的，为五百元。法律另有规定的，依照其规定。\n【原文 · 食品安全法第一百四十八条第二款】生产不符合食品安全标准的食品或者经营明知是不符合食品安全标准的食品，消费者除要求赔偿损失外，还可以向生产者或者经营者要求支付价款十倍或者损失三倍的赔偿金；增加赔偿的金额不足一千元的，为一千元。但是，食品的标签、说明书存在不影响食品安全且不会对消费者造成误导的瑕疵的除外。\n【原文 · 化妆品监督管理条例】第三条　本条例所称化妆品，是指以涂擦、喷洒或者其他类似方法，施用于皮肤、毛发、指甲、口唇等人体表面，以清洁、保护、美化、修饰为目的的日用化学工业产品。\n【客服场景怎么用】“三倍”的前提是经营者有欺诈行为；“十倍”写在食品安全法里，对象是不符合食品安全标准的食品。按条文文义，化妆品不是食品——这是我们对条文的理解，没有找到明文这样写的官方文件，最终以法务意见为准。坐席不和消费者争论法条，也不承诺任何倍数：先按真伪核验流程取证，结论出来后由法务确定赔偿。",
  },
  {
    id: "reg-child-01",
    kind: "regulation",
    title: "《儿童化妆品监督管理规定》· 12 岁及以下",
    source: "国家药监局公告 2021 年第 123 号 · 2022-01-01 施行",
    tags: ["儿童", "未成年", "孩子", "小学", "婴幼儿", "儿童化妆品标志", "监护"],
    updatedAt: "2026-10-12",
    verifiedAt: "2026-10-12",
    refs: [{ label: "儿童化妆品监督管理规定（国家药监局）", url: "https://www.nmpa.gov.cn/xxgk/fgwj/xzhgfxwj/20211008171226187.html" }, { label: "儿童化妆品标志公告 2021 年第 143 号（国家药监局）", url: "https://www.nmpa.gov.cn/xxgk/ggtg/hzhpggtg/jmhzhptg/20211201170227187.html" }],
    body:
      "【原文】第三条  本规定所称儿童化妆品，是指适用于年龄在12岁以下（含12岁）儿童，具有清洁、保湿、爽身、防晒等功效的化妆品。\n【原文】第六条  儿童化妆品应当在销售包装展示面标注国家药品监督管理局规定的儿童化妆品标志。儿童化妆品应当以“注意”或者“警告”作为引导语，在销售包装可视面标注“应当在成人监护下使用”等警示用语。\n【原文 · 使用人群分类目录 02 儿童（3～12周岁，含12周岁）】功效宣称仅限于清洁、卸妆、保湿、美容修饰、芳香、护发、防晒、修护、舒缓、爽身\n【客服场景怎么用】使用者在 12 岁及以下时，只推荐包装上标有儿童化妆品标志的产品；祛痘、抗皱、祛斑美白不在儿童化妆品可以宣称的功效之内。13 到 17 岁不在这份规定的定义里，灵犀按品牌内部规范处理：不推荐含强活性成分的产品。",
  },
  {
    id: "prod-retinol-01",
    kind: "product",
    title: "AURELLE A 醇精华 · 成分与使用须知",
    source: "产品资料库（演示）",
    tags: ["A醇", "视黄醇", "刺痛", "耐受", "泛红", "脱屑"],
    updatedAt: "2026-05-30",
    body:
      "含 0.3% 视黄醇，备案功效为抗皱、紧致。建立耐受的前 2–4 周可能出现轻微刺痛、泛红或脱屑，建议从每周 2 次、夜间、豌豆大小的用量开始。若出现持续灼热、明显红肿、水疱或渗出，应立即停用并就医。避免与高浓度果酸、水杨酸同晚叠加，白天须防晒。不建议未成年人使用。",
  },
  {
    id: "prod-b5-01",
    kind: "product",
    title: "MISTRAL B5 修护霜 · 适用说明",
    source: "产品资料库（演示）",
    tags: ["修护", "舒缓", "敏感肌", "屏障"],
    updatedAt: "2026-04-10",
    body:
      "含 5% 泛醇与积雪草苷，备案功效为修护、舒缓、保湿，用于日常屏障养护。皮肤出现明显不适时，应先停用全部功效型产品并遵医嘱，不以本品替代就医。",
  },
  {
    id: "sop-logistics-01",
    kind: "sop",
    title: "物流延误安抚规范",
    source: "消费者服务中心 · 作业规范（演示）",
    tags: ["物流", "延误", "快递", "发货", "礼物"],
    updatedAt: "2026-09-25",
    body:
      "先确认消费者在意的时间节点（生日、纪念日等），再查询物流轨迹。可以做的：协调仓库加急、改派顺丰（运费由品牌承担）、提供手写贺卡。不可以做的：承诺具体的送达时刻。送达时间一律使用“预计”，并说明以物流信息为准。",
    clauses: [
      { id: "sop-logistics-01#1", title: "先问时间节点", applies: "物流延误", text: "先确认消费者在意的时间节点（生日、纪念日等），再查询物流轨迹。" },
      { id: "sop-logistics-01#2", title: "可以做的", applies: "物流延误或补寄", text: "可以协调仓库加急、改派顺丰（运费由品牌承担）、提供手写贺卡。" },
      { id: "sop-logistics-01#3", title: "不可以做的", applies: "任何物流答复", text: "不承诺具体的送达时刻。送达时间一律使用“预计”，并说明以物流信息为准。" },
    ],
  },
  {
    id: "sop-auth-01",
    kind: "sop",
    title: "真伪质疑处理规范",
    source: "消费者服务中心 · 作业规范（演示）",
    tags: ["真伪", "假货", "防伪码", "溯源", "核验"],
    updatedAt: "2026-03-18",
    body:
      "引导消费者提供防伪码与批号的照片，通过品牌溯源系统核验。结论以凭证为准：核验前不承诺任何赔付金额，不指控、不质疑消费者，全程留存沟通记录。存在异常索赔特征的，转风控中心复核。",
  },
  {
    id: "policy-minor-01",
    kind: "policy",
    title: "未成年消费者沟通规范",
    source: "消费者服务中心 · 作业规范（演示）",
    tags: ["未成年", "学生", "监护人", "强活性成分"],
    updatedAt: "2026-02-01",
    body:
      "识别到疑似未成年人（自述年级、年龄或学生身份）时，不推荐含强活性成分的产品（如 A 醇、高浓度酸类）。涉及皮肤问题时，建议在监护人陪同下到医院皮肤科就诊；涉及退款时，建议由监护人协助办理。",
  },
  {
    id: "case-2026-0612",
    kind: "case",
    title: "案例：A 醇耐受期刺痛，从要求赔偿到主动分享用法",
    source: "优秀案例库（演示）",
    tags: ["A醇", "刺痛", "耐受", "共情"],
    updatedAt: "2026-06-12",
    body:
      "消费者首次使用 A 醇后脸颊刺痛泛红，情绪激动并要求赔偿。坐席先表达关心并建议停用，再耐心采集信息，了解到她每晚大量使用并叠加刷酸；随后协助就医并寄送修护霜。一周后回访，消费者已恢复，并主动分享了正确的使用方法。",
  },
  {
    id: "case-2026-0803",
    kind: "case",
    title: "案例：同批次集中反馈，48 小时内完成排查",
    source: "优秀案例库（演示）",
    tags: ["批次", "批号", "集中反馈", "会诊", "复检"],
    updatedAt: "2026-08-03",
    body:
      "某批次在 72 小时内的刺痛类反馈明显高于平日水平，触发跨部门会诊。质量法规部调取留样复检，研发确认配方指标在标准内，但内塞存在密封问题；品牌主动为该批次开放无忧退换，舆情保持平稳。",
  },
]

export const KNOWLEDGE_MAP = Object.fromEntries(KNOWLEDGE.map((k) => [k.id, k])) as Record<string, KnowledgeDoc>

export const CUSTOMERS = {
  he: {
    id: "C-52190",
    name: "何女士",
    avatarSeed: "he",
    tier: "金卡",
    ltv: 8640,
    orders: 14,
    skinType: "干皮 · 换季易泛红",
    concerns: ["屏障修护"],
    preferredTone: "实在，不要套话",
    sensitivity: ["香精"],
    lastContact: "2026-10-09 询问补寄进度",
    channelHabits: ["tmall"],
    tags: ["2 年老客"],
    historySummary: "2 年老客，常买 MISTRAL 修护线。10 月 5 日收到的面霜破损，此后三次进线催补寄。",
    churnRisk: 0.46,
  },
  lin: {
    id: "C-88021",
    name: "林小姐",
    avatarSeed: "lin",
    tier: "金卡",
    ltv: 12860,
    orders: 23,
    skinType: "混合偏干 · 轻度敏感",
    concerns: ["初老细纹", "换季泛红"],
    preferredTone: "温和、直接，不喜欢模板化的客套话",
    sensitivity: ["酒精", "高浓度酸"],
    lastContact: "2026-07-02 咨询防晒，评价 5 星",
    channelHabits: ["tmall", "wechat"],
    tags: ["3 年老客", "偶尔发布测评笔记"],
    historySummary: "3 年老客，常买 AURELLE 抗老线。上次咨询防晒给了 5 星；更早一次因为收到模板化回复只给了 3 星。",
    churnRisk: 0.18,
  },
  zhou: {
    id: "C-30417",
    name: "周先生",
    avatarSeed: "zhou",
    tier: "银卡",
    ltv: 3120,
    orders: 6,
    skinType: "—",
    concerns: ["给女友挑礼物"],
    preferredTone: "效率优先，说重点",
    sensitivity: [],
    lastContact: "2026-02-13 购买礼盒",
    channelHabits: ["douyin", "jd"],
    tags: ["节日前下单", "送礼"],
    historySummary: "近一年 6 单都是礼盒或彩妆，下单时间集中在节日前三天。",
    churnRisk: 0.42,
  },
  chen: {
    id: "C-51993",
    name: "陈女士",
    avatarSeed: "chen",
    tier: "黑金",
    ltv: 46300,
    orders: 61,
    skinType: "干性 · 熟龄，秋冬易干",
    concerns: ["松弛", "暗沉"],
    preferredTone: "希望被尊重、被记得",
    sensitivity: ["浓香型产品"],
    lastContact: "2026-09-01 反馈专属顾问离职后交接不到位",
    channelHabits: ["wechat", "hotline"],
    tags: ["6 年黑金会员", "常用臻颜面霜与眼霜", "近 30 天无消费"],
    historySummary: "6 年黑金会员。专属顾问小雅 8 月离职后有两次服务体验不佳，近 30 天没有消费。",
    churnRisk: 0.71,
  },
  xu: {
    id: "C-77240",
    name: "许同学",
    avatarSeed: "xu",
    tier: "新客",
    ltv: 0,
    orders: 0,
    skinType: "油性，闭口较多",
    concerns: ["闭口", "痘印"],
    preferredTone: "像朋友一样聊天",
    sensitivity: [],
    channelHabits: ["xiaohongshu"],
    tags: ["首次咨询", "来自小红书笔记"],
    historySummary: "首次咨询，没有购买记录。",
    churnRisk: 0.3,
  },
  wang: {
    id: "C-90132",
    name: "王先生",
    avatarSeed: "wang",
    tier: "新客",
    ltv: 320,
    orders: 1,
    skinType: "—",
    concerns: [],
    preferredTone: "—",
    sensitivity: [],
    channelHabits: ["jd"],
    tags: ["首单即索赔"],
    historySummary: "首单签收三天后发起索赔。",
    churnRisk: 0.1,
    claims: { accounts: 3, last90d: 7 },
  },
} satisfies Record<string, CustomerProfile>

/** Compensation authority, lowest first. Mirrors the 服务补偿权限矩阵 policy document above. */
export const COMP_MATRIX = [
  { role: "一线坐席", limit: 50 },
  { role: "组长", limit: 200 },
  { role: "主管", limit: 800 },
  { role: "跨部门会诊", limit: Infinity },
] as const

/** Who has to approve spending `cost` — undefined when a frontline agent may decide alone. */
export function approverFor(cost?: number): string | undefined {
  if (!cost || cost <= COMP_MATRIX[0].limit) return undefined
  return COMP_MATRIX.find((r) => cost <= r.limit)!.role
}

/** A deliberately short list: enough to demonstrate the shield, not a production lexicon. */
export const ABUSE_LEXICON = ["垃圾", "骗子", "智障", "废物", "去死", "有病", "脑残", "滚"]
