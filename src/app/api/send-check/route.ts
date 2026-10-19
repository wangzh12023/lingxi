import { z } from "zod"
import { reviewReply } from "@/lib/server/gate"
import { SCENARIO_MAP } from "@/lib/scenarios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const Body = z.object({
  scenarioId: z.string().max(40),
  text: z.string().min(1).max(2000),
  productId: z.string().max(40).optional(),
  level: z.number().int().min(0).max(4).default(0),
  situation: z.object({ safety: z.boolean(), logistics: z.boolean(), refund: z.boolean() }).optional(),
  reviewedBy: z.string().max(40).optional(),
})

/**
 * POST /api/send-check — the send gate. Reviews the exact text about to be sent against the rules,
 * the consumer's record and (when configured) a model, and returns a verdict bound to the text's hash.
 * The customer is looked up from the scenario on the server.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const scenario = SCENARIO_MAP[parsed.data.scenarioId]
  if (!scenario) return Response.json({ error: "未知的场景" }, { status: 404 })
  const verdict = await reviewReply({ ...parsed.data, customerId: scenario.customer.id })
  return Response.json(verdict)
}
