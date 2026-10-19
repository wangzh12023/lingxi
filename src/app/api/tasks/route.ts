import { z } from "zod"
import { listTasks, logFor, proposeTask, ticketsFor, now, clockOffsetMs } from "@/lib/server/db"
import { isoLocal } from "@/lib/clock"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks?customerId=… — the consumer's tasks, mock tickets and operation log, and the demo clock. */
export async function GET(req: Request) {
  const customerId = new URL(req.url).searchParams.get("customerId") ?? undefined
  return Response.json({
    now: isoLocal(now()),
    clockOffsetHours: Math.round(clockOffsetMs() / 3600000),
    tasks: listTasks(customerId),
    tickets: customerId ? ticketsFor(customerId) : [],
    log: customerId ? logFor(customerId) : [],
  })
}

const Body = z.object({
  customerId: z.string().max(40),
  sessionId: z.string().max(60).optional(),
  /** a proposed action; approver, status and anything else the policy decides are ignored */
  action: z.record(z.unknown()),
  actorId: z.string().max(40),
  idemKey: z.string().min(8).max(80),
})

/** POST /api/tasks — propose an action as a task. Approval and ticket creation follow the policy. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const r = await proposeTask({ ...parsed.data, autoSubmit: true })
  return r.ok ? Response.json({ task: r.value, replayed: r.replayed ?? false }) : Response.json({ error: r.error }, { status: r.status })
}
