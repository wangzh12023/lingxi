import { PageHeader } from "@/components/lingxi/shell"
import { ROUTES, ROUTE_ORDER, type Route } from "@/lib/engine/router"
import { RISK_CATEGORIES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { RiskCategory } from "@/lib/types"
import { FlaskConical, Lock, Terminal } from "lucide-react"
import raw from "../../../../eval/results.json"
import rawE2e from "../../../../eval/e2e-results.json"
import rawFirst from "../../../../eval/e2e-first.json"

/**
 * 评测. Everything on this page is read from eval/results.json (component evaluation, eval/run.mts)
 * and eval/e2e-results.json (end-to-end, eval/e2e.mts). Nothing is typed in by hand.
 */

interface Score {
  n: number
  intentAcc: number
  intentCI: [number, number] | null
  emotionAcc: number
  polarityAcc: number
  riskPrecision: number
  riskRecall: number
  riskRecallCI: [number, number] | null
  byCategory: Record<RiskCategory, { gold: number; recall: number | null; precision: number | null }>
  severeRecall: number
  severeMissed: number
  severeGold: number
  anyAlertCoverage: number
  trueRiskHit: number
  riskyN: number
  falseAlarm: number
  cleanN: number
}
interface Blocks {
  n: number
  violating: number
  accuracy: number
  recall: number
  recallCI: [number, number] | null
  falseBlock: number
}
interface Report {
  agreement: null | { intent: number; intentKappa: number; emotion: number; emotionKappa: number; polarity: number; riskExact: number; consensusMessages: number; block: number | null; blockKappa: number | null }
  baseline: Score
  all: Score
  consensus: null | { baseline: Score; rules: Score }
  byKind: { kind: string; cn: string; n: number; intentAcc: number; emotionAcc: number; riskRecall: number }[]
  compliance: { all: Blocks; consensus: Blocks | null }
  router: null | { share: Record<Route, number>; counts: Record<Route, number>; liteN: number; liteIntentAcc: number; riskyN: number; riskyFull: number; riskyLite: number; riskyFast: number; first: null | { riskyKeptFromModel: number; riskyN: number } }
}
interface Results {
  generatedAt: string
  sizes: { dev: number; holdout1: number; repliesDev: number; repliesHoldout1: number; validationMessages: number; validationReplies: number; finalMessages: number; finalReplies: number }
  labels: { intents: number; emotions: number }
  round1: null | { rules: { n: number; intentAcc: number; emotionAcc: number; riskRecall: number }; compliance: { recall: number } }
  tuning: { messages: Score }
  validation: Report | null
  final: { status: { frozen: boolean; hash?: string; frozenAt?: string; intact?: boolean }; rules: Report | null }
  tokens: {
    basis: string
    method: string
    prices: { main: { model: string; input: number; output: number }; fast: { model: string; input: number; output: number } }
    steps: { key: string; cn: string; note: string; calls: number; total: number; cost: number }[]
    vsSingle: { tokensPct: number; costPct: number }
    vsNaive: { tokensPct: number; costPct: number }
    notCounted: string[]
  }
  trajectory: { data: { customers: number; orders: number; tickets: number; contacts: number }; planted: { type: string; cn: string; planted: number; found: number }[]; plantedTotal: number; foundTotal: number; ordinary: number; ordinaryFlagged: number }
  llm: null | (Report & { set: string; model: string; avgTokens: number; avgMs: number })
}
interface E2E {
  turns: number
  intentAcc: number
  intentMacroF1: number
  riskRecallByCategory: Record<string, number | null>
  severeMissed: string
  falseAlarmOnCleanTurns: number | null
  acknowledgedBrokenPromise: number | null
  remedyActionProposed: number | null
  falseApology: number
  reaskedKnownInfo: number
  wrongOrderCited: number
  unsupportedCommitments: number
  factErrors: number
  policyClaimSupport: number | null
  modelCalls: number
  modelFailures: number
  tokensPerTurn: number
  costPerTurnYuan: number
  latencyMs: { p50: number | null; p95: number | null }
}
interface E2EFile {
  generatedAt?: string
  setHash?: string
  frozenAt?: string
  sessions?: number
  turns?: number
  model?: { main: string; fast: string } | null
  notes?: string[]
  conditions: Partial<Record<string, E2E>>
}

const R = raw as unknown as Results
const E = rawE2e as unknown as E2EFile
const F = rawFirst as unknown as E2EFile

const C = { baseline: "#cfccc6", rules: "#16151c", model: "#8975ce" }
const CONDITIONS: { key: string; cn: string; what: string }[] = [
  { key: "rules", cn: "A 规则", what: "离线规则引擎，走完整的产品流水线" },
  { key: "base", cn: "B 基线", what: "主模型单次调用 + 基础检索，没有服务历史" },
  { key: "base+facts", cn: "C 基线 + 事实", what: "B 再加上结构化的服务事实" },
  { key: "lingxi", cn: "D 灵犀", what: "事实、规则与模型双轨、路由、核验与修正" },
  { key: "lingxi-noroute", cn: "E 灵犀不路由", what: "D 关闭省 token 路由，每轮都用主模型" },
]

function Card({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-line bg-white p-6", className)}>
      <h2 className="font-cn-serif text-[17px] font-semibold text-ink">{title}</h2>
      {sub && <div className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">{sub}</div>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Bar({ value, color, label, pending, ci }: { value?: number | null; color: string; label: string; pending?: string; ci?: [number, number] | null }) {
  const has = value !== undefined && value !== null
  return (
    <div className="flex items-center gap-2.5" title={has ? `${label}：${value}%${ci ? `（95% 区间 ${ci[0]}–${ci[1]}%）` : ""}` : `${label}：${pending}`}>
      <span className="w-[64px] shrink-0 text-[11.5px] text-muted-foreground">{label}</span>
      <div className="relative h-[14px] flex-1 rounded-[4px] bg-muted/70">
        {has && <div className="h-full rounded-[4px]" style={{ width: `${Math.max(value!, 0.6)}%`, background: color }} />}
        {has && ci && <div className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-white/80" style={{ left: `${ci[0]}%`, width: `${Math.max(0.5, ci[1] - ci[0])}%` }} />}
        {!has && <div className="absolute inset-0 rounded-[4px] border border-dashed border-[#c9c2e6]" />}
      </div>
      <span className={cn("w-[52px] shrink-0 text-right text-[12.5px] tabular", has ? "font-semibold text-ink" : "text-muted-foreground")}>{has ? `${value}%` : pending}</span>
    </div>
  )
}

function Metric({ name, what, baseline, rules, model, ci }: { name: string; what: string; baseline?: number; rules: number; model?: number | null; ci?: [number, number] | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-ink">{name}</span>
        <span className="text-right text-[11px] text-muted-foreground">{what}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {baseline !== undefined && <Bar value={baseline} color={C.baseline} label="多数类基线" />}
        <Bar value={rules} color={C.rules} label="规则引擎" ci={ci} />
        <Bar value={model} color={C.model} label="大模型" pending="未测" />
      </div>
    </div>
  )
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold tracking-tight text-ink tabular">{value}</span>
        {unit && <span className="text-[13px] text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</div>}
    </div>
  )
}

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-ink">{children}</code>
const v = (x: number | null | undefined, unit = "%") => (x === null || x === undefined ? "—" : `${x}${unit}`)

export default function EvalPage() {
  const frozen = R.final.status
  const fin = R.final.rules
  // headline: the frozen final set when it is intact, else the validation set
  const head = fin ?? R.validation
  const headName = fin ? "最终测试集（冻结）" : "迭代验证集"
  const llm = R.llm
  const ls = llm?.all
  const lc = llm?.compliance.all
  const t = R.tokens
  const maxTotal = Math.max(...t.steps.map((s) => s.total))
  const router = R.validation?.router
  const when = new Date(R.generatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="px-8 pb-12">
      <PageHeader
        className="px-0"
        eyebrow="Evaluation"
        title="评测"
        desc="“判得准不准”不能靠演示时的观感。这一页分两层：组件评测量每一项判断（意图、情绪、风险类别、回复拦截），端到端评测把真实的产品流水线放在多轮会话和服务历史上跑，看它有没有用对历史、有没有乱承诺。每个数字都由脚本算出，改了规则重跑，这一页跟着变。"
      >
        <span className="rounded-xl border border-line bg-white px-3 py-1.5 text-[11.5px] text-muted-foreground tabular">组件评测生成于 {when}</span>
      </PageHeader>

      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
        <span>
          <b className="font-semibold text-ink">这些数字的来历。</b>
          评测文本不是真实消费者语料，也不是主办方数据。调参集（{R.sizes.dev + R.sizes.holdout1} 条）由开发者撰写；迭代验证集（{R.sizes.validationMessages} 条消息、{R.sizes.validationReplies} 条回复）和最终测试集（{R.sizes.finalMessages} 条消息、{R.sizes.finalReplies} 条回复、{E.sessions ?? 0} 段多轮会话）由没有接触过规则代码的独立标注者撰写，第二位标注者在看不到前者标签的情况下复标。
          <b className="font-medium text-ink">所有标注者都是大模型（与开发代理同一个模型的不同实例），没有经过人工裁决</b>，所以“一致”不等于符合真实业务判断。完整记录见 <Code>eval/PROVENANCE.md</Code>。
        </span>
      </div>

      {head && (
        <>
          <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            {fin && <Lock className="size-3.5" />}
            <span>
              以下为 <b className="font-medium text-ink">{headName}</b>
              {fin && frozen.frozenAt ? `：${frozen.frozenAt.slice(0, 10)} 冻结，哈希 ${frozen.hash?.slice(0, 12)}…；冻结后规则没有再根据它调整` : "：规则未据此调整，但路由曾根据它的一个汇总数字改过一次，所以不称为盲测"}
              。所有方法在同一批条目上计分，主结果用完整集合。
            </span>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="意图识别 · 规则" value={`${head.all.intentAcc}`} unit="%" note={`13 类；95% 区间 ${head.all.intentCI?.join("–") ?? "—"}%；基线 ${head.baseline.intentAcc}%`} />
            <Tile label="风险 · 召回 / 精确" value={`${head.all.riskRecall}`} unit={`% / ${head.all.riskPrecision}%`} note={`无风险消息误报 ${head.all.falseAlarm}%`} />
            <Tile label="高后果风险 · 召回" value={`${head.all.severeRecall}`} unit="%" note={`产品安全、未成年、法律、舆情；漏掉 ${head.all.severeMissed} / ${head.all.severeGold} 条`} />
            <Tile label="违规回复 · 拦住" value={`${head.compliance.all.recall}`} unit="%" note={`${head.compliance.all.violating} 条违规；合规回复误拦 ${head.compliance.all.falseBlock}%`} />
            <Tile label="大模型" value={ls ? `${ls.intentAcc}` : "未测"} unit={ls ? "%" : undefined} note={ls ? `意图准确率 · ${llm!.model}` : "还没有用真实密钥运行"} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card title={`${headName}上的四项判断`} sub={<>多数类基线是“永远回答调参集里最常见的标签”。条形中间的白线是 95% 置信区间。{head.consensus && `两位标注者意见一致的 ${head.consensus.rules.n} 条上，规则意图准确率 ${head.consensus.rules.intentAcc}%（附加分析）。`}</>}>
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <Metric name="意图识别" what="13 选 1" baseline={head.baseline.intentAcc} rules={head.all.intentAcc} model={ls?.intentAcc} ci={head.all.intentCI} />
                <Metric name="情绪判断" what="8 选 1，主导情绪" baseline={head.baseline.emotionAcc} rules={head.all.emotionAcc} model={ls?.emotionAcc} />
                <Metric name="风险 · 召回" what={`${head.all.riskyN} 条有风险的消息`} rules={head.all.riskRecall} model={ls?.riskRecall} ci={head.all.riskRecallCI} />
                <Metric name="风险 · 精确" what="标出的风险里有多少是对的" rules={head.all.riskPrecision} model={ls?.riskPrecision} />
                <Metric name="违规回复 · 拦住" what={`${head.compliance.all.violating} 条违规回复`} rules={head.compliance.all.recall} model={lc?.recall} ci={head.compliance.all.recallCI} />
                <Metric name="合规回复 · 放行" what="没有被误拦的比例" rules={Math.round((100 - head.compliance.all.falseBlock) * 10) / 10} model={lc ? Math.round((100 - lc.falseBlock) * 10) / 10 : undefined} />
              </div>
              {!llm && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#f4f1fb] px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
                  <Terminal className="mt-0.5 size-3.5 shrink-0 text-[#6a52c9]" />
                  <span>
                    大模型一栏是空的：这个项目还没有用真实密钥调用过模型，我们不填没测过的数。填入密钥后运行 <Code>npx tsx eval/run.mts --llm</Code>。
                  </span>
                </p>
              )}
            </Card>

            <Card title="风险按类别" sub="把风险拆开看才知道漏的是什么。高后果类别（产品安全、未成年、法律、舆情）漏一条的代价远高于误报一条。">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-muted-foreground">
                    <th className="py-1.5 font-normal">类别</th>
                    <th className="py-1.5 text-right font-normal">条数</th>
                    <th className="py-1.5 text-right font-normal">召回 · 规则</th>
                    <th className="py-1.5 text-right font-normal">精确 · 规则</th>
                    <th className="py-1.5 text-right font-normal">召回 · 模型</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(head.all.byCategory) as RiskCategory[])
                    .filter((k) => head.all.byCategory[k].gold > 0)
                    .sort((a, b) => head.all.byCategory[b].gold - head.all.byCategory[a].gold)
                    .map((k) => (
                      <tr key={k} className="border-b border-line/60 last:border-0">
                        <td className="py-2 text-ink">
                          {RISK_CATEGORIES[k].cn}
                          {["safety", "minor", "legal", "pr"].includes(k) && <span className="ml-1 rounded bg-[#fde8e5] px-1 text-[9.5px] text-[#a32626]">高后果</span>}
                        </td>
                        <td className="py-2 text-right text-muted-foreground tabular">{head.all.byCategory[k].gold}</td>
                        <td className="py-2 text-right font-semibold tabular">{v(head.all.byCategory[k].recall)}</td>
                        <td className="py-2 text-right tabular">{v(head.all.byCategory[k].precision)}</td>
                        <td className="py-2 text-right text-muted-foreground tabular">{ls ? v(ls.byCategory[k]?.recall) : "未测"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                “有风险的消息里至少标对一个类别”的比例是 {head.all.trueRiskHit}%；只要标出任何风险就算的“任意预警覆盖率”是 {head.all.anyAlertCoverage}%——后者不是召回，只作参考。
              </p>
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-[12px] font-semibold text-ink">规则在哪里失手</div>
                <div className="flex flex-wrap gap-1.5">
                  {[...head.byKind]
                    .sort((a, b) => a.intentAcc - b.intentAcc)
                    .map((k) => (
                      <span key={k.kind} className="rounded-lg bg-muted px-2 py-1 text-[11px] text-ink-soft tabular">
                        {k.cn} {k.intentAcc}%（{k.n}）
                      </span>
                    ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">意图准确率按题型拆开。含蓄、反讽、长句末尾的线索是规则的短板，这些消息由路由交给大模型。</p>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card
        className="mt-5"
        title="端到端：真实的产品流水线，多轮会话 + 服务历史"
        sub={
          <>
            {E.sessions ?? 0} 段会话、{E.turns ?? 0} 个轮次，每段带订单、工单（含承诺及兑现记录）和历史进线；评测脚本调用的就是产品里的流水线、上下文构建、路由与核验。五个条件用同样的会话和评分。命令 <Code>pnpm eval:e2e --llm</Code>；逐轮输入输出与用量写入 <Code>eval/runs/</Code>。
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[11.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] text-muted-foreground">
                <th className="py-1.5 font-normal">条件</th>
                <th className="py-1.5 text-right font-normal">意图 · 准确 / macro-F1</th>
                <th className="py-1.5 text-right font-normal">高后果风险漏报</th>
                <th className="py-1.5 text-right font-normal">承认失约</th>
                <th className="py-1.5 text-right font-normal">提出补救</th>
                <th className="py-1.5 text-right font-normal">误认失约</th>
                <th className="py-1.5 text-right font-normal">重复询问</th>
                <th className="py-1.5 text-right font-normal">订单混淆</th>
                <th className="py-1.5 text-right font-normal">未授权承诺</th>
                <th className="py-1.5 text-right font-normal">事实错误</th>
                <th className="py-1.5 text-right font-normal">token / 轮</th>
                <th className="py-1.5 text-right font-normal">延迟 P50 / P95</th>
              </tr>
            </thead>
            <tbody>
              {CONDITIONS.map((c) => {
                const r = E.conditions[c.key]
                return (
                  <tr key={c.key} className="border-b border-line/60 last:border-0">
                    <td className="py-2">
                      <div className="font-medium text-ink">{c.cn}</div>
                      <div className="text-[10.5px] text-muted-foreground">{c.what}</div>
                    </td>
                    {r ? (
                      <>
                        <td className="py-2 text-right tabular">
                          {r.intentAcc}% / {r.intentMacroF1}
                        </td>
                        <td className="py-2 text-right tabular">{r.severeMissed}</td>
                        <td className="py-2 text-right tabular">{v(r.acknowledgedBrokenPromise)}</td>
                        <td className="py-2 text-right tabular">{v(r.remedyActionProposed)}</td>
                        <td className="py-2 text-right tabular">{r.falseApology}</td>
                        <td className="py-2 text-right tabular">{r.reaskedKnownInfo}</td>
                        <td className="py-2 text-right tabular">{r.wrongOrderCited}</td>
                        <td className="py-2 text-right tabular">{r.unsupportedCommitments}</td>
                        <td className="py-2 text-right tabular">{r.factErrors}</td>
                        <td className="py-2 text-right tabular">{c.key === "rules" ? "0" : r.tokensPerTurn}</td>
                        <td className="py-2 text-right tabular">{c.key === "rules" ? "<5 ms" : `${r.latencyMs.p50 ?? "—"} / ${r.latencyMs.p95 ?? "—"} ms`}</td>
                      </>
                    ) : (
                      <td colSpan={11} className="py-2 text-center text-muted-foreground">
                        待验收：需要真实模型（填入密钥后运行）
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>“承认失约”“提出补救”只在有逾期承诺的轮次上统计；“误认失约”是承诺其实已经兑现、回复却在道歉的次数；后几列是出现问题的轮次数，越少越好。</li>
          {F.conditions.rules && E.conditions.rules && (
            <li>
              规则条件在最终测试集上的第一次运行：重复询问 {F.conditions.rules.reaskedKnownInfo} 轮、订单混淆 {F.conditions.rules.wrongOrderCited} 轮（冻结在 <Code>eval/e2e-first.json</Code>）。
              {(E.notes ?? []).slice(1, 2).join("")}
            </li>
          )}
          <li>“未授权承诺”和“事实错误”用的是产品自带的核对器来判，灵犀本身也用它过滤草稿，所以这两列对灵犀天然有利；接入模型后应再请人工或独立模型复核一遍。</li>
        </ul>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="省 token：先让规则读一遍，再决定用多少模型" sub="规则引擎本来就要运行（它是护栏）。寒暄不调用模型；规则有把握的低风险咨询由快速模型一次完成，发现风险就升级；其余由主模型一次完成研判与起草，核验不通过才再修正一次。">
          {router ? (
            <>
              <div className="flex h-7 overflow-hidden rounded-lg" role="img" aria-label={ROUTE_ORDER.map((r) => `${ROUTES[r].cn} ${router.share[r]}%`).join("，")}>
                {ROUTE_ORDER.map((r, i) =>
                  router.share[r] > 0 ? (
                    <div key={r} className={cn("flex items-center justify-center text-[11px] font-medium", i > 0 && "border-l-2 border-white")} style={{ width: `${router.share[r]}%`, background: ["#e8e4dc", "#b9a9ea", "#16151c"][i], color: i === 2 ? "#fff" : "#16151c" }}>
                      {router.share[r] >= 9 ? `${router.share[r]}%` : ""}
                    </div>
                  ) : null,
                )}
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed">
                {ROUTE_ORDER.map((r, i) => (
                  <li key={r} className="flex gap-2">
                    <span className="mt-1 size-2.5 shrink-0 rounded-[3px]" style={{ background: ["#e8e4dc", "#b9a9ea", "#16151c"][i] }} />
                    <span>
                      <b className="font-semibold text-ink">
                        {ROUTES[r].cn} · {router.share[r]}%
                      </b>
                      <span className="text-muted-foreground">　{ROUTES[r].desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Tile label="有风险 · 直达主模型" value={`${router.riskyFull}`} unit={`/ ${router.riskyN}`} />
                <Tile label="由快速模型把关" value={`${router.riskyLite}`} unit="条" note="发现风险即升级" />
                <Tile label="完全不经过模型" value={`${router.riskyFast}`} unit="条" note="必须是 0" />
              </div>
              {router.first && <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">路由改过一次：第一次在验证集上测时，{router.first.riskyN} 条有风险的消息有 {router.first.riskyKeptFromModel} 条没有任何模型把关；之后加了宽口径筛查并改为“快速模型复核、发现风险即升级”。修改只依据这个汇总数字。</p>}
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">验证集生成后，这里会显示路由分布。</p>
          )}
        </Card>

        <Card
          title="每一轮的 token：估算"
          sub={
            <>
              <b className="font-medium text-ink">这是估算，不是实测。</b>
              {t.method}
            </>
          }
        >
          <ol className="space-y-3">
            {t.steps.map((s, i) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="font-semibold text-ink">{s.cn}</span>
                  <span className="shrink-0 tabular">
                    <b className="font-semibold">{s.total.toLocaleString()}</b>
                    <span className="text-muted-foreground"> token · {s.calls} 次 · ¥{s.cost.toFixed(4)}</span>
                  </span>
                </div>
                <div className="mt-1 h-[12px] rounded-[4px] bg-muted/70">
                  <div className="h-full rounded-[4px]" style={{ width: `${(s.total / maxTotal) * 100}%`, background: i === 0 ? C.baseline : i === 1 ? "#6b6878" : C.model }} />
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</div>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-xl bg-porcelain px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-soft">
            和<b className="font-medium text-ink">合理的单次调用基线</b>比：token {t.vsSingle.tokensPct > 0 ? "多" : "少"} {Math.abs(t.vsSingle.tokensPct)}%，费用{t.vsSingle.costPct > 0 ? "多" : "少"} {Math.abs(t.vsSingle.costPct)}%——服务事实多出的 token 和裁剪、路由省下的大致相抵。只和“每个智能体各调用一次”比才会少 {Math.abs(t.vsNaive.tokensPct)}%，那个对比不公平，这里不作为卖点。未计入：{t.notCounted.join("、")}；接入后以接口返回的用量为准。
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="服务轨迹整合：一致性检查" sub={`合成服务数据（${R.trajectory.data.customers} 位消费者、${R.trajectory.data.orders} 笔订单、${R.trajectory.data.tickets} 张工单、${R.trajectory.data.contacts} 次进线）里按已知位置埋了异常，核对预警规则有没有全部找到、有没有惊动普通消费者。`}>
          <table className="w-full text-[12px]">
            <tbody>
              {R.trajectory.planted.map((p) => (
                <tr key={p.type} className="border-b border-line/60">
                  <td className="py-2 text-ink">{p.cn}</td>
                  <td className="py-2 text-right tabular">
                    埋入 {p.planted} · 找到 <b>{p.found}</b>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 text-ink">普通消费者（不应预警）</td>
                <td className="py-2 text-right tabular">
                  {R.trajectory.ordinary} 位 · 被预警 <b>{R.trajectory.ordinaryFlagged}</b>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">这是在自己造的数据上核对逻辑，不代表真实服务数据上的准确率。</p>
        </Card>

        <Card title="过程记录" sub="规则不是一次写对的。把每一步留在这里，数字才有参照。">
          <ol className="space-y-2.5 text-[12px] leading-relaxed text-ink-soft">
            {R.round1 && (
              <li>
                <b className="font-medium text-ink">第一轮</b>：只在 {R.sizes.dev} 条开发集上调规则，在没见过的 {R.round1.rules.n} 条上意图 {R.round1.rules.intentAcc}%、风险召回 {R.round1.rules.riskRecall}%（冻结于 <Code>round1.json</Code>）。
              </li>
            )}
            <li>
              <b className="font-medium text-ink">第二轮</b>：留出集并入调参，规则加入句式；调参集上意图 {R.tuning.messages.intentAcc}%——照着改的，不作数。
            </li>
            {R.validation && (
              <li>
                <b className="font-medium text-ink">迭代验证集</b>：规则意图 {R.validation.all.intentAcc}%、风险召回 {R.validation.all.riskRecall}%；路由据它的一个汇总数字改过一次。
              </li>
            )}
            {fin && (
              <li>
                <b className="font-medium text-ink">最终测试集</b>：新的独立标注者撰写，{frozen.frozenAt?.slice(0, 10)} 冻结；规则意图 {fin.all.intentAcc}%、风险召回 {fin.all.riskRecall}%、高后果召回 {fin.all.severeRecall}%。
              </li>
            )}
          </ol>
        </Card>
      </div>
    </div>
  )
}
