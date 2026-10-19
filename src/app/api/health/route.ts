import { getLLMConfig, llmEnabled, pingLLM } from "@/lib/server/llm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/health — which mode is active; `?ping=1` also makes a one-token test call. Never returns the key. */
export async function GET(req: Request) {
  const cfg = getLLMConfig()
  const base = {
    mode: llmEnabled() ? "llm" : "offline",
    forcedOffline: process.env.LINGXI_MODE === "offline",
    keyConfigured: Boolean(cfg.apiKey),
    provider: cfg.baseURL.replace(/^https?:\/\//, "").split("/")[0],
    model: cfg.model,
    fastModel: cfg.fastModel,
    visionModel: cfg.visionModel,
  }
  if (new URL(req.url).searchParams.get("ping")) return Response.json({ ...base, ping: await pingLLM() })
  return Response.json(base)
}
