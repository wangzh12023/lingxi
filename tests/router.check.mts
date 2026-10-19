// Router + model path, exercised with a stand-in model. Run: npx tsx tests/router.check.mts
// No provider is contacted. This proves the wiring — which turns reach a model, on which tier, how
// verification sends a bad draft back for one repair, and what happens when the model fails — not
// the quality of any real model.
import { runPipeline, type LLMHooks, type PerceiveResult, type ScribeResult } from "../src/lib/engine/pipeline"
import { CUSTOMERS } from "../src/lib/data"
import type { Insight, Message } from "../src/lib/types"

let fail = 0
const check = (ok: boolean, label: string, got?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || got === undefined ? "" : `\n     → ${JSON.stringify(got)}`}`)
  if (!ok) fail++
}

interface Calls {
  full: number
  repair: number
  lite: number
  repairProblems: string[]
}

const READING: PerceiveResult = { intent: { primary: "complaint", secondary: null, confidence: 0.8, summary: "模型读出的意图" }, emotion: { anger: 0.7 }, unspoken: [], signals: [{ category: "churn", level: 2, title: "模型发现的流失信号", evidence: "…" }], keyFacts: [], whisper: "模型的耳语" }

function mock(opts: { broken?: boolean; liteFindsRisk?: boolean; badDraft?: boolean; repairFixes?: boolean } = {}): { hooks: LLMHooks; calls: Calls } {
  const calls: Calls = { full: 0, repair: 0, lite: 0, repairProblems: [] }
  const call = (name: string, model: string, ok: boolean) => ({ name, agents: [], model, ms: 1, tokens: ok ? 100 : 0, ok })
  const hooks: LLMHooks = {
    vision: async () => ({ data: null, call: call("vision", "mock", false) }),
    full: async () => {
      calls.full++
      if (opts.broken) return { data: null, call: call("full", "mock-main", false) }
      const drafts = opts.badDraft ? { warm: "模型写的温暖版，绝对安全。", professional: "模型写的专业版。", concise: "模型写的简洁版。" } : { warm: "模型写的温暖版。", professional: "模型写的专业版。", concise: "模型写的简洁版。" }
      return { data: { ...READING, drafts, actions: [{ kind: "followup", title: "模型建议的跟进", detail: "", impact: "" }] } as PerceiveResult & ScribeResult, call: call("full", "mock-main", true) }
    },
    repair: async (_input, ctx) => {
      calls.repair++
      calls.repairProblems = ctx.problems
      const data: ScribeResult = { drafts: opts.repairFixes ? { warm: "模型修正后的温暖版，我们会认真核实。", professional: "模型写的专业版。", concise: "模型写的简洁版。" } : { ...ctx.drafts } }
      return { data, call: call("repair", "mock-main", true) }
    },
    lite: async () => {
      calls.lite++
      const data = {
        intent: { primary: "usage_guidance" as const, secondary: null, confidence: 0.9, summary: "快速模型读出的意图" },
        emotion: { calm: 0.6 },
        unspoken: [],
        signals: opts.liteFindsRisk ? [{ category: "minor" as const, level: 2, title: "快速模型发现的风险", evidence: "…" }] : [],
        keyFacts: [],
        whisper: "快速模型的耳语",
        drafts: { warm: "快速模型写的温暖版。", professional: "快速模型写的专业版。", concise: "快速模型写的简洁版。" },
        actions: [{ kind: "education" as const, title: "说明使用顺序", detail: "", impact: "" }],
      }
      return { data, call: call("lite", "mock-fast", true) }
    },
  }
  return { hooks, calls }
}

async function run(text: string, opts: Parameters<typeof mock>[0] & { customer?: boolean } = {}) {
  const { hooks, calls } = mock(opts)
  const messages: Message[] = [{ id: "m1", role: "consumer", text, at: Date.now() }]
  let insight: Insight | undefined
  for await (const ev of runPipeline({ messages, customer: opts.customer ? CUSTOMERS.chen : undefined }, "llm", hooks)) if (ev.type === "done") insight = ev.insight
  return { insight: insight!, calls }
}

{
  const { insight, calls } = await run("好的，谢谢")
  check(insight.route?.route === "fast" && calls.full + calls.repair + calls.lite === 0, `寒暄 → 规则直达，0 次调用（${insight.route?.reason}）`)
  check(insight.source === "rules" && insight.usage.length === 0, "  标注为规则引擎，用量为空")
}
{
  const { insight, calls } = await run("精华和面霜哪个先用")
  check(insight.route?.route === "lite" && calls.lite === 1 && calls.full + calls.repair === 0, `有把握的低风险咨询 → 轻量，快速模型一次完成复核与起草（${insight.route?.reason}）`)
  check(insight.intent.summary === "快速模型读出的意图" && insight.drafts[0].origin === "model" && insight.usage.length === 1 && insight.usage[0].model === "mock-fast", "  研判和草稿都来自这一次调用")
}
{
  const { insight, calls } = await run("精华和面霜哪个先用", { liteFindsRisk: true })
  check(insight.route?.route === "full" && calls.lite === 1 && calls.full === 1, `快速模型发现风险 → 升级，主模型重做（${insight.route?.reason}）`)
  check(insight.usage.length === 2, "  两次调用都记入用量", insight.usage.map((u) => u.name))
}
{
  const { insight, calls } = await run("用完之后脸火辣辣地疼，你们必须给我个说法")
  check(insight.route?.route === "full" && calls.full === 1 && calls.repair === 0, `有风险 → 完整，主模型一次完成研判与起草（${insight.route?.reason}）`)
  check(insight.risk.signals.some((s) => s.origin === "model") && insight.risk.signals.some((s) => s.origin === "rule"), "  模型信号与规则信号并存")
}
{
  const { insight, calls } = await run("用完之后脸火辣辣地疼，你们必须给我个说法", { badDraft: true, repairFixes: true })
  check(calls.full === 1 && calls.repair === 1 && calls.repairProblems.some((p) => /绝对安全/.test(p)), "  草稿含“绝对安全”→ 核验拦下，带着原因交回模型修正一次", calls.repairProblems)
  check(!insight.drafts.some((d) => d.issues.some((i) => i.severity === "block")) && /修正后/.test(insight.drafts[0].text), "  修正后的草稿通过核验，采用修正版")
  check(insight.usage.length === 2, "  两次调用都记入用量")
}
{
  const { insight, calls } = await run("用完之后脸火辣辣地疼，你们必须给我个说法", { badDraft: true })
  check(calls.repair === 1 && insight.drafts.some((d) => d.issues.some((i) => i.severity === "block" && /绝对安全/.test(i.phrase))), "  修正没改好：问题仍被标出，不会被当成合规发出")
}
{
  const { insight, calls } = await run("我真是谢谢你们全家了")
  check(insight.route?.route === "full" && calls.full === 1, `规则读不出的短句 → 完整（${insight.route?.reason}）`)
}
{
  // 陈女士 has an overdue promise ticket: the data alone sends a harmless-looking question to the main model
  const { insight } = await run("精华和面霜哪个先用", { customer: true })
  check(insight.route?.route === "full", `业务数据里有未兑现的承诺 → 完整（${insight.route?.reason}）`)
}
{
  const { insight, calls } = await run("用完之后脸火辣辣地疼", { broken: true })
  check(calls.full === 1 && insight.degraded.length > 0, "模型失败 → 标记降级")
  check(insight.intent.primary === "adverse_reaction" && insight.drafts.every((d) => d.origin === "rule") && insight.risk.level >= 2, "  规则引擎接替：意图、风险、草稿都在")
}

console.log(fail ? `\n${fail} FAILED` : "\nrouter: all pass")
process.exit(fail ? 1 : 0)
