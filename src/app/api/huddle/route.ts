import { z } from "zod"
import { HUDDLE_ROLE_MAP, composeHuddle, consensusOf, withConsensus } from "@/lib/huddle"
import { HUDDLE_PROMPT } from "@/lib/engine/prompts"
import { runPipeline } from "@/lib/engine/pipeline"
import { chatJSON, llmEnabled } from "@/lib/server/llm"
import { sseResponse } from "@/lib/server/sse"
import { PRESET_VISION, SCENARIOS, SCENARIO_MAP } from "@/lib/scenarios"
import type { HuddleCase, HuddleResolution, HuddleRoleId, HuddleSource, HuddleTurn, Insight, Message } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/huddle — the cases the rehearsed scenarios escalate. They are not hand-listed: each
 * scenario is run through the same pipeline the console uses, and the case it opens is returned.
 */
export async function GET() {
  const cases: HuddleCase[] = []
  for (const sc of SCENARIOS) {
    const messages: Message[] = []
    let prior: Insight | undefined
    for (const step of sc.script) {
      if (step.role !== "consumer") continue
      messages.push({ id: `${sc.id}-${step.id}`, role: "consumer", text: step.text, at: 0, attachments: step.attachments })
      const att = step.attachments?.[0]
      for await (const ev of runPipeline(
        { messages, customer: sc.customer, orderSkus: sc.orders.map((o) => o.sku), prior, scripted: step.insight, presetVision: att && PRESET_VISION[att.url] ? { ...PRESET_VISION[att.url], source: "preset" } : undefined, scenarioId: sc.id },
        "rules",
      )) {
        if (ev.type === "done") prior = ev.insight
      }
      if (prior?.huddleCase) break
    }
    if (prior?.huddleCase) cases.push({ ...prior.huddleCase, scenarioId: sc.id })
  }
  return Response.json({ cases: cases.sort((a, b) => b.level - a.level) })
}

const ROLE = z.enum(["cs", "qa", "legal", "pr", "rnd", "crm", "risk"])
const Body = z.object({
  case: z.object({
    id: z.string().max(40),
    title: z.string().max(120),
    level: z.number().int().min(0).max(4),
    summary: z.string().max(800),
    evidence: z.array(z.string().max(300)).max(8),
    roles: z.array(ROLE).min(1).max(6),
    categories: z.array(z.enum(["safety", "regulatory", "pr", "legal", "churn", "fraud", "privacy", "minor", "service"])).max(8),
    hint: z.string().max(200).optional(),
    scenarioId: z.string().max(40).optional(),
  }),
  prefer: z.enum(["script", "auto"]).default("auto"),
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const STANCES = new Set(["support", "caution", "oppose", "neutral"])

/**
 * POST /api/huddle — runs a roundtable and streams it turn by turn.
 * Discussion source, in order: a configured model (unless the caller prefers the script), the
 * scenario's rehearsed script, or the offline composer. Consensus is always computed here.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const c = parsed.data.case as HuddleCase
  const script = c.scenarioId ? SCENARIO_MAP[c.scenarioId]?.huddle : undefined
  const wantLLM = llmEnabled() && !(parsed.data.prefer === "script" && script)

  return sseResponse(async (send) => {
    let turns: HuddleTurn[] | null = null
    let resolution: HuddleResolution | null = null
    let source: HuddleSource = "composed"
    let llmFailed = false

    if (wantLLM) {
      send("thinking", { role: "moderator" })
      const allowed = new Set<string>(["moderator", ...c.roles])
      const { data } = await chatJSON<{ turns?: Omit<HuddleTurn, "id">[]; resolution?: Omit<HuddleResolution, "consensus"> }>(
        [
          { role: "system", content: HUDDLE_PROMPT(c.roles.map((r) => HUDDLE_ROLE_MAP[r])) },
          { role: "user", content: `【个案】${c.summary}\n【风险等级】L${c.level}\n【证据】\n${c.evidence.map((e) => `- ${e}`).join("\n")}${c.hint ? `\n【消费者的潜台词】${c.hint}` : ""}` },
        ],
        { model: "main", temperature: 0.7, maxTokens: 2200, name: "议 · 会诊", agents: ["moderator"] },
      )
      const clean = (Array.isArray(data?.turns) ? data!.turns : [])
        .filter((t) => t && allowed.has(t.role) && typeof t.text === "string" && t.text.trim())
        .map((t, i) => ({ id: `l${i}`, role: t.role as HuddleRoleId, text: t.text.trim().slice(0, 200), stance: STANCES.has(t.stance ?? "") ? t.stance : "neutral" }) as HuddleTurn)
      const r = data?.resolution
      if (clean.length >= 4 && r?.decision && Array.isArray(r.actions) && r.actions.length) {
        turns = clean
        resolution = { decision: String(r.decision), actions: r.actions.filter((a) => a?.owner && a?.action).slice(0, 7), dissent: r.dissent || undefined, consensus: consensusOf(clean) }
        source = "llm"
      } else llmFailed = true
    }
    if (!turns || !resolution) {
      const fallback = withConsensus(script ?? composeHuddle(c))
      turns = fallback.turns
      resolution = fallback.resolution
      source = script ? "script" : "composed"
    }

    send("meta", { source, caseId: c.id, llmFailed })
    for (const t of turns) {
      send("thinking", { role: t.role })
      // pacing so the room can be followed; a model-generated discussion has already taken its time
      await sleep(source === "llm" ? 500 : 700 + Math.min(1200, t.text.length * 12))
      send("turn", t)
    }
    await sleep(500)
    send("resolution", resolution)
  })
}
