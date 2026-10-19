import { z } from "zod"
import { applyFixes, checkCompliance } from "@/lib/engine/audit"
import { AUDIT_PROMPT } from "@/lib/engine/prompts"
import { PRODUCT_MAP } from "@/lib/data"
import { chatJSON, llmEnabled } from "@/lib/server/llm"

export const runtime = "nodejs"

const Body = z.object({ text: z.string().min(1).max(2000), productId: z.string().max(40).optional() })

/**
 * POST /api/audit — 检 · deep review. The rule track also runs in the browser on every keystroke;
 * this endpoint adds a model review when one is configured. Either way the rewrite that comes back
 * has been re-checked by the rules, and `remaining` lists anything still wrong.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const { text, productId } = parsed.data
  const ctx = { product: productId ? PRODUCT_MAP[productId] : undefined }

  if (llmEnabled()) {
    const { data, call } = await chatJSON<{ issues?: { phrase: string; reason: string; suggestion: string }[]; rewrite?: string }>(
      [
        { role: "system", content: AUDIT_PROMPT },
        { role: "user", content: `坐席准备发送的回复：${text}` },
      ],
      { model: "fast", temperature: 0.1, maxTokens: 800, name: "检 · 深度审查", agents: ["auditor"] },
    )
    if (data?.rewrite && typeof data.rewrite === "string") {
      // the model's rewrite still has to pass the rules — apply rule fixes on top of it
      const fixed = applyFixes(data.rewrite.trim(), ctx)
      const notes = (Array.isArray(data.issues) ? data.issues : []).filter((i) => i?.phrase && i?.reason).slice(0, 6)
      return Response.json({ source: "llm", rewrite: fixed.text, notes, remaining: fixed.remaining, call })
    }
  }
  const fixed = applyFixes(text, ctx)
  return Response.json({ source: "rules", rewrite: fixed.text, notes: [], remaining: fixed.remaining, unchanged: fixed.text === text, issues: checkCompliance(text, ctx).length })
}
