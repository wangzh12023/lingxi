import { z } from "zod"
import { runPipeline } from "@/lib/engine/pipeline"
import { llmEnabled } from "@/lib/server/llm"
import { llmHooks } from "@/lib/server/hooks"
import { sseResponse } from "@/lib/server/sse"
import { caseContext } from "@/lib/server/case"
import { recordSignals } from "@/lib/server/db"
import { PRESET_VISION, SCENARIO_MAP } from "@/lib/scenarios"
import type { Insight, Message, VisionFinding } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MessageSchema = z.object({
  id: z.string().max(64),
  role: z.enum(["consumer", "agent", "system"]),
  text: z.string().max(2000),
  at: z.number(),
  attachments: z.array(z.object({ id: z.string(), kind: z.literal("image"), url: z.string().max(8_000_000), caption: z.string().max(200).optional() })).max(3).optional(),
  vision: z.any().optional(),
})

const Body = z.object({
  messages: z.array(MessageSchema).min(1).max(60),
  scenarioId: z.string().max(40),
  stepId: z.string().max(20).optional(),
  /** the previous consumer turn's insight, so risk can accumulate across turns */
  prior: z.any().optional(),
  /** prefer: "script" replays the rehearsed judgments; "auto" uses the model when one is configured */
  prefer: z.enum(["script", "auto"]).default("auto"),
})

/**
 * POST /api/analyze — runs the per-turn pipeline and streams it as server-sent events
 * (trace · partial · done · error). Customer and order data are looked up on the server from
 * the scenario id; the client cannot inject a profile.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const { messages, scenarioId, stepId, prior, prefer } = parsed.data
  const scenario = SCENARIO_MAP[scenarioId]
  if (!scenario) return Response.json({ error: "未知的场景" }, { status: 404 })

  const step = scenario.script.find((s) => s.id === stepId)
  const scripted = step?.role === "consumer" && prefer === "script" ? step.insight : undefined
  const last = (messages as Message[]).findLast((m) => m.role === "consumer")
  const att = last?.attachments?.[0]
  // demo illustrations carry a shipped recognition result; an image analysed earlier keeps its result
  const preset: VisionFinding | undefined = att && PRESET_VISION[att.url] ? { ...PRESET_VISION[att.url], source: "preset" } : (last?.vision as VisionFinding | undefined)

  const mode = scripted ? "script" : llmEnabled() ? "llm" : "rules"
  // the record — orders, tickets, live tasks, the board's events and corrections — is read here, on the server
  const ctx = caseContext(scenario.customer.id)
  return sseResponse(async (send) => {
    send("mode", { mode })
    for await (const ev of runPipeline(
      {
        messages: messages as Message[],
        customer: scenario.customer,
        orderSkus: scenario.orders.map((o) => o.sku),
        prior: prior as Insight | undefined,
        scripted,
        presetVision: preset,
        scenarioId,
        ...ctx,
      },
      mode,
      mode === "llm" ? llmHooks : undefined,
    )) {
      // what the turn found is written to the board's event log: new problems open events, new evidence reopens closed ones
      if (ev.type === "done") recordSignals(scenario.customer.id, ev.insight.risk.signals)
      send(ev.type, ev)
    }
  })
}
