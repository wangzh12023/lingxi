import { z } from "zod"
import { END_MOOD, MAX_TURNS, MOOD_LABEL, PERSONAS, moodBand, nextMood } from "@/lib/coach"
import { checkCompliance, scoreReply } from "@/lib/engine/audit"
import { COACH_EXAMPLE_PROMPT, COACH_PERSONA_PROMPT } from "@/lib/engine/prompts"
import { chat, chatJSON, llmEnabled } from "@/lib/server/llm"
import type { ModelCall } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const Body = z.object({
  personaId: z.string().max(40),
  history: z.array(z.object({ role: z.enum(["customer", "trainee"]), text: z.string().max(1000) })).min(2).max(2 * MAX_TURNS + 2),
  mood: z.number().min(-1).max(1),
})

/**
 * POST /api/coach — scores the trainee's latest reply and returns the simulated customer's next line.
 * The score always comes from the rule rubric; a configured model only plays the customer and
 * offers an example reply. The mood change follows the formula in lib/coach.ts.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 })
  const { personaId, history, mood } = parsed.data
  const persona = PERSONAS.find((p) => p.id === personaId)
  if (!persona) return Response.json({ error: "未知的角色" }, { status: 404 })
  const reply = history.findLast((h) => h.role === "trainee")?.text.trim()
  if (!reply) return Response.json({ error: "还没有坐席回复" }, { status: 400 })

  const issues = checkCompliance(reply)
  const score = scoreReply(reply, { issues })
  const blocking = issues.filter((i) => i.severity === "block").length
  const mood2 = nextMood(mood, score, blocking)
  const turns = history.filter((h) => h.role === "trainee").length
  const ended = mood2 > END_MOOD || turns >= MAX_TURNS
  const band = moodBand(mood2)

  const calls: ModelCall[] = []
  let line: string | null = null
  let better: string | null = null
  if (llmEnabled() && !ended) {
    const [roleplay, example] = await Promise.all([
      chat(
        [
          { role: "system", content: COACH_PERSONA_PROMPT(persona.persona, persona.scenario, MOOD_LABEL[band]) },
          ...history.map((h) => ({ role: (h.role === "customer" ? "assistant" : "user") as "assistant" | "user", content: h.text })),
        ],
        { model: "main", temperature: 0.85, maxTokens: 160, name: "练 · 扮演客户", agents: ["coach"] },
      ),
      chatJSON<{ better?: string }>(
        [
          { role: "system", content: COACH_EXAMPLE_PROMPT },
          { role: "user", content: `【对话】\n${history.map((h) => `${h.role === "customer" ? "客户" : "坐席"}：${h.text}`).join("\n")}\n【评分】共情 ${score.empathy}，专业 ${score.professional}，合规 ${score.compliance}，效率 ${score.efficiency}` },
        ],
        { model: "fast", temperature: 0.4, maxTokens: 220, name: "练 · 示范回复", agents: ["coach"] },
      ),
    ])
    calls.push(roleplay.call, example.call)
    line = roleplay.text.trim() || null
    // an example reply is only shown if it passes the same rules the trainee is held to
    const b = example.data?.better?.trim()
    if (b && !checkCompliance(b).some((i) => i.severity === "block")) better = b
  }

  // a session that ends because the customer calmed down closes with one of their calmer lines
  if (!line && (!ended || mood2 > END_MOOD)) {
    const used = new Set(history.filter((h) => h.role === "customer").map((h) => h.text))
    line = persona.lines[band].find((l) => !used.has(l)) ?? persona.lines[band][persona.lines[band].length - 1]
  }

  return Response.json({
    score,
    issues,
    mood: mood2,
    moodDelta: Math.round((mood2 - mood) * 100) / 100,
    band,
    ended,
    line,
    better,
    source: line && calls.length && calls[0].ok ? "llm" : "rules",
    calls,
  })
}
