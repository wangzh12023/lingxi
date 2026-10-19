import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Attachment, Box, VisionFinding } from "../types"
import type { LLMHooks, PerceiveResult, ScribeResult } from "../engine/pipeline"
import { fullUser, liteUser, repairUser } from "../engine/context"
import { FULL_PROMPT, LITE_PROMPT, REPAIR_PROMPT, VISION_PROMPT } from "../engine/prompts"
import { chatJSON } from "./llm"

/** Vision models need raster pixels. SVG demo illustrations are recognised from their shipped presets instead. */
async function toDataURL(att: Attachment): Promise<string | null> {
  if (att.url.startsWith("data:image/")) return /^data:image\/(png|jpe?g|webp|gif)/.test(att.url) ? att.url : null
  if (!att.url.startsWith("/")) return null
  try {
    const root = path.join(process.cwd(), "public")
    const file = path.resolve(root, `.${att.url}`)
    if (!file.startsWith(root + path.sep)) return null // stay inside /public
    const ext = path.extname(file).slice(1).toLowerCase()
    if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return null
    const buf = await readFile(file)
    return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

const isBox = (b: unknown): b is Box => Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1)

/** Model output is untrusted: keep only well-formed fields. */
function sanitizeVision(v: Partial<Omit<VisionFinding, "source">> | null): Omit<VisionFinding, "source"> | null {
  if (!v || typeof v.summary !== "string" || !v.summary.trim()) return null
  const severity = (["none", "mild", "moderate", "severe"] as const).includes(v.severity as never) ? v.severity! : "none"
  return {
    summary: v.summary.slice(0, 80),
    severity,
    findings: (Array.isArray(v.findings) ? v.findings : [])
      .filter((f) => f && typeof f.label === "string")
      .slice(0, 6)
      .map((f) => ({ label: f.label.slice(0, 24), confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)), box: isBox(f.box) ? f.box : undefined })),
    privacy: (Array.isArray(v.privacy) ? v.privacy : []).filter((p) => p && typeof p.label === "string" && isBox(p.box)).slice(0, 6),
    // when the model does not say, assume a face may be present: the console keeps the image blurred
    containsFace: v.containsFace !== false,
  }
}

export async function analyzeImage(url: string, caption?: string): Promise<{ data: Omit<VisionFinding, "source"> | null; call: import("../types").ModelCall } | null> {
  const dataUrl = await toDataURL({ id: "x", kind: "image", url, caption })
  if (!dataUrl) return null
  const r = await chatJSON<Partial<Omit<VisionFinding, "source">>>(
    [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: `消费者附言：${caption ?? "（无）"}。请输出 JSON。` },
        ],
      },
    ],
    { model: "vision", temperature: 0.1, maxTokens: 700, name: "望 · 识别图片", agents: ["vision"] },
  )
  return { data: sanitizeVision(r.data), call: r.call }
}

export const llmHooks: LLMHooks = {
  async vision(att) {
    const r = await analyzeImage(att.url, att.caption)
    if (!r) return { data: null, call: { name: "望 · 识别图片", agents: ["vision"], model: "—", ms: 0, tokens: 0, ok: false } }
    return r
  },

  async full(input, ctx) {
    const r = await chatJSON<PerceiveResult & ScribeResult>(
      [
        { role: "system", content: FULL_PROMPT },
        { role: "user", content: fullUser(input, ctx) },
      ],
      { model: "main", temperature: 0.4, maxTokens: 2000, name: "研判并起草（主模型）", agents: ["empath", "intent", "sentinel", "scribe", "strategist"] },
    )
    return { data: r.data, call: r.call }
  },

  async repair(input, ctx) {
    const r = await chatJSON<ScribeResult>(
      [
        { role: "system", content: REPAIR_PROMPT },
        { role: "user", content: repairUser(input, ctx) },
      ],
      { model: "main", temperature: 0.3, maxTokens: 1400, name: "笔 · 按核验结果修正", agents: ["scribe"] },
    )
    return { data: r.data, call: r.call }
  },

  async lite(input, ctx) {
    const r = await chatJSON<PerceiveResult & ScribeResult>(
      [
        { role: "system", content: LITE_PROMPT },
        { role: "user", content: liteUser(input, ctx) },
      ],
      { model: "fast", temperature: 0.4, maxTokens: 1800, name: "轻量 · 研判并起草（快速模型）", agents: ["empath", "intent", "sentinel", "scribe", "strategist"] },
    )
    return { data: r.data, call: r.call }
  },
}
