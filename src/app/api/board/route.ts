import { boardData } from "@/lib/server/board"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/board — the risk board: alerts with their stored statuses, deadlines on the demo clock, and the tracking log. */
export async function GET() {
  return Response.json(boardData())
}
