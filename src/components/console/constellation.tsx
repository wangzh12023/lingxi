"use client"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/engine/router"
import { AGENT_MAP, ORIGINS, PIPELINE_ORDER } from "@/lib/constants"
import { useConsole } from "@/lib/store"
import type { AgentId, AgentTrace, Insight } from "@/lib/types"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

/**
 * Agent constellation — 忆 望 闻 问 切 → 典 策 → 笔 → 检, drawn as a circuit.
 * Nodes light up as trace events stream in. When nothing is running it shows the trace of the
 * turn selected in the conversation, so the picture always matches the panel below it.
 */
const LAYOUT: { id: AgentId; x: number; y: number }[] = [
  { id: "vision", x: 8, y: 16 },
  { id: "empath", x: 8, y: 38 },
  { id: "intent", x: 8, y: 60 },
  { id: "sentinel", x: 8, y: 82 },
  { id: "memory", x: 30, y: 92 },
  { id: "scholar", x: 38, y: 30 },
  { id: "strategist", x: 56, y: 56 },
  { id: "scribe", x: 76, y: 32 },
  { id: "auditor", x: 92, y: 62 },
]

const EDGES: [AgentId, AgentId][] = [
  ["vision", "scholar"],
  ["empath", "strategist"],
  ["intent", "scholar"],
  ["sentinel", "strategist"],
  ["memory", "strategist"],
  ["scholar", "strategist"],
  ["strategist", "scribe"],
  ["scribe", "auditor"],
  ["strategist", "auditor"],
]

const SOURCE_LABEL: Record<Insight["source"], string> = { script: "演示脚本", rules: "规则引擎", llm: "大模型" }

function useShownTraces() {
  const live = useConsole((s) => s.traces)
  const analyzing = useConsole((s) => s.analyzing)
  const selected = useConsole((s) => (s.activeInsightId ? s.insights[s.activeInsightId] : undefined))
  if (analyzing || !selected) return { traces: live, insight: undefined }
  return { traces: Object.fromEntries(selected.trace.map((t) => [t.agent, t])) as Partial<Record<AgentId, AgentTrace>>, insight: selected }
}

export function AgentConstellation({ className }: { className?: string }) {
  const analyzing = useConsole((s) => s.analyzing)
  const { traces, insight } = useShownTraces()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!analyzing) return
    const t0 = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Date.now() - t0), 100)
    return () => clearInterval(t)
  }, [analyzing])

  const pos = Object.fromEntries(LAYOUT.map((l) => [l.id, l]))
  const status = (id: AgentId) => traces[id]?.status ?? "idle"
  const settled = LAYOUT.filter((l) => ["done", "skipped", "degraded"].includes(status(l.id))).length
  const modelCalls = insight?.usage.filter((c) => c.ok).length ?? 0
  const tokens = insight?.usage.reduce((s, c) => s + c.tokens, 0) ?? 0

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line bg-white", className)}>
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <span className="font-cn-serif text-[13px] font-semibold">智能体星图</span>
          <span className="text-[10.5px] text-muted-foreground tabular">{settled}/9</span>
        </div>
        <span className="text-right text-[10.5px] text-muted-foreground tabular">
          {analyzing ? `运行中 ${(elapsed / 1000).toFixed(1)} 秒` : insight ? `${SOURCE_LABEL[insight.source]}${insight.route ? ` · ${ROUTES[insight.route.route].cn}路由` : ""}${modelCalls ? ` · ${modelCalls} 次模型调用 · ${tokens} tokens` : ""}` : "待命"}
        </span>
      </div>
      <div className="relative mx-2 mb-2 h-[168px]" role="img" aria-label={`智能体运行状态：已完成 ${settled} / 9`}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="edge-live" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#d76a95" />
              <stop offset="0.5" stopColor="#8a72e0" />
              <stop offset="1" stopColor="#4c9ad8" />
            </linearGradient>
          </defs>
          {EDGES.map(([a, b]) => {
            const A = pos[a]
            const B = pos[b]
            const live = ["done", "degraded"].includes(status(a)) && ["running", "done", "degraded"].includes(status(b))
            const mx = (A.x + B.x) / 2
            const d = `M ${A.x} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${B.x} ${B.y}`
            return (
              <g key={`${a}-${b}`}>
                <path d={d} fill="none" stroke="#e9e6e0" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                {live && (
                  <motion.path d={d} fill="none" stroke="url(#edge-live)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0, opacity: 0.2 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />
                )}
              </g>
            )
          })}
        </svg>
        {LAYOUT.map((l) => {
          const a = AGENT_MAP[l.id]
          const st = status(l.id)
          const t = traces[l.id]
          const lit = st === "running" || st === "done"
          return (
            <div key={l.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${l.x}%`, top: `${l.y}%` }} title={`${a.cn}${t?.headline ? ` — ${t.headline}` : ""}${st === "degraded" ? "（模型未返回有效结果，已由规则引擎接替）" : ""}`}>
              <motion.div
                animate={st === "running" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={st === "running" ? { duration: 0.9, repeat: Infinity } : {}}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full font-cn-serif text-[13px] font-semibold transition-all duration-300",
                  st === "idle" && "bg-muted text-muted-foreground/60",
                  st === "skipped" && "bg-muted text-muted-foreground/45",
                  st === "degraded" && "bg-white text-[#8a5306] ring-2 ring-[#e89a2c] ring-dashed",
                )}
                style={lit ? { background: st === "done" ? a.color : "#fff", color: st === "done" ? "#fff" : a.color, boxShadow: st === "running" ? `0 0 0 2px ${a.color}, 0 0 18px ${a.color}66` : `0 4px 14px -4px ${a.color}aa` } : undefined}
              >
                {a.glyph}
                {st === "skipped" && <span className="absolute inset-x-1.5 top-1/2 h-px -rotate-45 bg-muted-foreground/40" />}
              </motion.div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TraceList() {
  const { traces } = useShownTraces()
  const items = PIPELINE_ORDER.map((id) => traces[id]).filter((t): t is AgentTrace => Boolean(t))
  if (!items.length) return null
  return (
    <ol className="space-y-1.5">
      {items.map((t) => {
        const a = AGENT_MAP[t.agent]
        return (
          <li key={t.agent} className="flex items-start gap-2 text-[11px]">
            <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full font-cn-serif text-[9px] text-white" style={{ background: t.status === "skipped" ? "#cfccc6" : t.status === "degraded" ? "#e89a2c" : a.color }}>
              {a.glyph}
            </span>
            <span className="w-14 shrink-0 text-muted-foreground">{a.cn.split(" · ")[1]}</span>
            <span className="min-w-0 flex-1 text-ink-soft">
              {t.headline}
              {t.status === "degraded" && <span className="ml-1 text-[#8a5306]">· 已降级为规则</span>}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{t.status === "running" ? "…" : t.via ? ORIGINS[t.via].cn : ""}</span>
          </li>
        )
      })}
    </ol>
  )
}
