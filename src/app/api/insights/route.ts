import { briefFacts, buildBrief, fmtP } from "@/lib/insights"
import { INSIGHT_PROMPT } from "@/lib/engine/prompts"
import { chat, llmEnabled } from "@/lib/server/llm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/insights — 察 · the weekly brief. A configured model rewrites it from the same figures; otherwise the template brief is returned. */
export async function POST() {
  if (!llmEnabled()) return Response.json({ report: buildBrief(), source: "template" })
  const f = briefFacts()
  const facts = {
    批次预警: { 批次: f.batch.batch, 产品: f.batch.product, 近72小时反馈: f.batch.complaints72h, 平日水平: f.batch.baseline, 倍数: f.batch.ratio, 显著性: fmtP(f.batch.pValue), 预警时间: f.alertAt },
    关注批次: f.watch.map((b) => ({ 批次: b.batch, 倍数: b.ratio, 显著性: fmtP(b.pValue) })),
    情绪变化: { 焦虑占比三日变化_百分点: f.anxietyRise3d, 平静占比三日变化_百分点: -f.calmDrop3d },
    话题: { 情绪最低: f.worstTopic, 情绪最高: f.bestTopic },
  }
  const r = await chat(
    [
      { role: "system", content: INSIGHT_PROMPT },
      { role: "user", content: JSON.stringify(facts) },
    ],
    { temperature: 0.4, maxTokens: 700, name: "察 · 每周简报", agents: ["insighter"] },
  )
  if (!r.call.ok || !r.text.trim()) return Response.json({ report: buildBrief(), source: "template", fallback: true })
  return Response.json({ report: r.text.trim(), source: "llm", call: r.call })
}
