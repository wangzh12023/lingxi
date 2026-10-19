import { z } from "zod"
import { listEvents, transitionEvent } from "@/lib/server/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/events?customerId=… — risk events as the board keeps them. */
export async function GET(req: Request) {
  const customerId = new URL(req.url).searchParams.get("customerId") ?? undefined
  return Response.json({ events: listEvents(customerId) })
}

const Body = z.object({
  customerId: z.string().max(40),
  eventKey: z.string().max(120),
  /** for an alert that has no stored event yet */
  title: z.string().max(60).optional(),
  category: z.enum(["safety", "regulatory", "pr", "legal", "churn", "fraud", "privacy", "minor", "service"]).optional(),
  level: z.number().int().min(0).max(4).optional(),
  action: z.enum(["claim", "close", "reopen", "invalidate"]),
  actorId: z.string().max(40),
  idemKey: z.string().min(8).max(80),
  note: z.string().max(300).optional(),
  evidence: z.string().max(300).optional(),
})

/** POST /api/events — claim, close, reopen, or mark an event invalid (with a reason and evidence). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const r = transitionEvent({ ...parsed.data, level: parsed.data.level as 0 | 1 | 2 | 3 | 4 | undefined })
  return r.ok ? Response.json({ event: r.value, replayed: r.replayed ?? false }) : Response.json({ error: r.error }, { status: r.status })
}
