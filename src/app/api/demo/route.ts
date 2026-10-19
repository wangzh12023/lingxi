import { z } from "zod"
import { advanceClock, now, resetDemo, setFailNextSubmit } from "@/lib/server/db"
import { isoLocal } from "@/lib/clock"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const Body = z.object({
  op: z.enum(["advance", "reset", "fail_next_submit"]),
  hours: z.number().min(-48).max(72).optional(),
  actorId: z.string().max(40).default("demo"),
})

/**
 * POST /api/demo — operator controls for the demonstration, labelled as such in the UI:
 * move the demo clock forward (to show a deadline passing without waiting hours), make the next
 * ticket submission fail once (to show nothing is promised on a failure), or start over.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const { op, hours, actorId } = parsed.data
  if (op === "advance") advanceClock(hours ?? 4, actorId)
  if (op === "reset") resetDemo()
  if (op === "fail_next_submit") setFailNextSubmit(true)
  return Response.json({ now: isoLocal(now()) })
}
