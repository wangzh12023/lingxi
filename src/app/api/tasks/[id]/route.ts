import { z } from "zod"
import { transitionTask } from "@/lib/server/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const Body = z.object({
  action: z.enum(["approve", "reject", "submit", "record_result", "verify", "reopen", "cancel"]),
  actorId: z.string().max(40),
  idemKey: z.string().min(8).max(80),
  note: z.string().max(300).optional(),
})

/** POST /api/tasks/:id — move a task: approve, reject, submit (retry), record the result, verify, reopen, cancel. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const { action, ...rest } = parsed.data
  const r = await transitionTask(id, action, rest)
  return r.ok ? Response.json({ task: r.value, replayed: r.replayed ?? false }) : Response.json({ error: r.error }, { status: r.status })
}
