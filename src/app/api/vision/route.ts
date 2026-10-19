import { z } from "zod"
import { analyzeImage } from "@/lib/server/hooks"
import { llmEnabled } from "@/lib/server/llm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const Body = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|jpe?g|webp|gif);base64,/).max(8_000_000),
  caption: z.string().max(200).optional(),
})

/**
 * POST /api/vision — 望 · analyse an uploaded image with the configured vision model.
 * Without one there is no recognition: the response says so, and the console keeps the image
 * blurred for the agent to review by hand.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "只支持 PNG、JPEG、WebP、GIF 格式且不超过约 6MB 的图片" }, { status: 400 })
  if (!llmEnabled()) return Response.json({ finding: null, reason: "没有配置视觉模型，图片未经识别" })
  const r = await analyzeImage(parsed.data.dataUrl, parsed.data.caption)
  if (!r?.data) return Response.json({ finding: null, reason: "识别失败，请人工查看", call: r?.call })
  return Response.json({ finding: { ...r.data, source: "model" }, call: r.call })
}
