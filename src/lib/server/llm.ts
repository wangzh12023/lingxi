import "server-only"
import OpenAI from "openai"
import type { AgentId, ModelCall } from "../types"
import { combineCalls } from "../usage"

/**
 * LLM provider — any OpenAI-compatible endpoint. The default target is Alibaba Cloud Bailian
 * (DashScope, 通义千问) through its compatible mode. Leave LLM_API_KEY empty to run offline:
 * every feature has a rule-engine path, and the UI labels which path produced what.
 *
 * Model names are configuration, not code. The defaults are open-weight Qwen models listed in
 * Bailian's documentation on 2026-10-12 (see research/百炼模型与接口.md); they have not been called
 * from this project yet, so confirm them in the console when you add a key.
 */
export interface LLMConfig {
  apiKey: string
  baseURL: string
  model: string
  fastModel: string
  visionModel: string
  timeoutMs: number
}

export function getLLMConfig(): LLMConfig {
  return {
    apiKey: process.env.LLM_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "",
    baseURL: process.env.LLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.LLM_MODEL ?? "qwen3.8-27b",
    fastModel: process.env.LLM_FAST_MODEL ?? process.env.LLM_MODEL ?? "qwen3.5-35b-a3b",
    visionModel: process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? "qwen3.8-27b",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 45000),
  }
}

/** True when a key is configured and the operator has not forced offline mode. */
export function llmEnabled() {
  return process.env.LINGXI_MODE !== "offline" && Boolean(getLLMConfig().apiKey)
}

let client: OpenAI | null = null
let clientKey = ""
function getClient() {
  const cfg = getLLMConfig()
  const key = `${cfg.apiKey}|${cfg.baseURL}|${cfg.timeoutMs}`
  if (!client || key !== clientKey) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: cfg.timeoutMs, maxRetries: 1 })
    clientKey = key
  }
  return client
}

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam

/** `enable_thinking` is a Bailian parameter; other OpenAI-compatible providers may reject unknown fields. */
const thinkingOff = () => (process.env.LLM_DISABLE_THINKING ?? (/aliyuncs\.com/.test(getLLMConfig().baseURL) ? "1" : "0")) === "1"

export interface ChatOptions {
  model?: "main" | "fast" | "vision"
  temperature?: number
  maxTokens?: number
  json?: boolean
  /** a label and the agents this call serves — recorded in the usage report shown in the console */
  name?: string
  agents?: AgentId[]
}

function pickModel(kind: ChatOptions["model"]) {
  const cfg = getLLMConfig()
  return kind === "fast" ? cfg.fastModel : kind === "vision" ? cfg.visionModel : cfg.model
}

export interface ChatResult {
  text: string
  call: ModelCall
}

/** One completion. Never throws: a failed call comes back with `ok: false` and empty text. */
export async function chat(messages: Msg[], opts: ChatOptions = {}): Promise<ChatResult> {
  const model = pickModel(opts.model)
  const t0 = Date.now()
  const base = { name: opts.name ?? "chat", agents: opts.agents ?? [], model }
  try {
    const res = await getClient().chat.completions.create({
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1600,
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
      // Bailian extension, top-level in the Node SDK. Qwen 3.5+ think by default: that bills the
      // reasoning as output tokens, takes about three times as long, and open-weight models reject
      // it outright on non-streaming calls. These agents return short structured answers, so it is off.
      ...(thinkingOff() ? ({ enable_thinking: false } as Record<string, unknown>) : {}),
    })
    const u = res.usage
    const cached = (u?.prompt_tokens_details as { cached_tokens?: number } | undefined)?.cached_tokens
    return { text: res.choices[0]?.message?.content ?? "", call: { ...base, ms: Date.now() - t0, tokens: u?.total_tokens ?? 0, promptTokens: u?.prompt_tokens, completionTokens: u?.completion_tokens, cachedTokens: cached, ok: true } }
  } catch (e) {
    console.error(`[lingxi/llm] ${base.name} (${model}) failed:`, e instanceof Error ? e.message : e)
    return { text: "", call: { ...base, ms: Date.now() - t0, tokens: 0, ok: false } }
  }
}

/** Tolerant JSON extraction: accepts ```json fences and surrounding prose. */
export function parseJSON<T>(raw: string): T | null {
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : raw).trim()
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

/**
 * Completion that must come back as JSON. Some compatible endpoints reject `response_format`,
 * so a failed first attempt is retried once without it. Both attempts are counted in the usage.
 */
export async function chatJSON<T>(messages: Msg[], opts: ChatOptions = {}): Promise<{ data: T | null; call: ModelCall }> {
  const first = await chat(messages, { ...opts, json: opts.model !== "vision" })
  const data = parseJSON<T>(first.text)
  if (data || opts.model === "vision") return { data, call: { ...first.call, ok: Boolean(data) } }
  const second = await chat(messages, { ...opts, json: false })
  const call = combineCalls(first.call, second.call)
  const retried = parseJSON<T>(second.text)
  return { data: retried, call: { ...call, ok: Boolean(retried) } }
}

export async function pingLLM(): Promise<{ ok: boolean; model: string; ms: number; error?: string }> {
  const cfg = getLLMConfig()
  if (!cfg.apiKey) return { ok: false, model: cfg.model, ms: 0, error: "没有配置 LLM_API_KEY，当前为离线模式" }
  const r = await chat([{ role: "user", content: "请只回复：pong" }], { maxTokens: 8, temperature: 0, name: "ping" })
  return r.call.ok ? { ok: true, model: cfg.model, ms: r.call.ms } : { ok: false, model: cfg.model, ms: r.call.ms, error: "调用失败，请检查密钥、接口地址和模型名称（详情见服务端日志）" }
}
