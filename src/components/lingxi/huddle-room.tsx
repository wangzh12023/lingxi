"use client"

import { cn } from "@/lib/utils"
import { useRecord } from "@/lib/record-store"
import { useConsole } from "@/lib/store"
import { toast } from "sonner"
import { HUDDLE_ROLE_MAP } from "@/lib/huddle"
import type { HuddleCase, HuddleRecord, HuddleResolution, HuddleRoleId, HuddleSource, HuddleTurn } from "@/lib/types"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, CircleDashed, FileSignature, Play, RotateCcw, TriangleAlert, Users, ClipboardCheck } from "lucide-react"

type Phase = "idle" | "running" | "done" | "error"

/** Stance colours are text-safe (≥ 4.5:1 on white); each stance also carries its word. */
const STANCE = {
  support: { cn: "赞同", color: "#2c7a3f" },
  caution: { cn: "审慎", color: "#8a5306" },
  oppose: { cn: "反对", color: "#a32626" },
  neutral: { cn: "主持", color: "#5f5d69" },
} as const

export const HUDDLE_SOURCE_LABEL: Record<HuddleSource, string> = {
  llm: "大模型实时生成",
  script: "演示脚本",
  composed: "按角色与风险类别离线合成",
}

export function useHuddle(c: HuddleCase, onResolved?: (r: HuddleRecord) => void, prefer: "script" | "auto" = "auto") {
  const [phase, setPhase] = useState<Phase>("idle")
  const [turns, setTurns] = useState<HuddleTurn[]>([])
  const [speaking, setSpeaking] = useState<HuddleRoleId | null>(null)
  const [resolution, setResolution] = useState<HuddleResolution | null>(null)
  const [source, setSource] = useState<HuddleSource | null>(null)
  const [llmFailed, setLlmFailed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const resolvedRef = useRef(onResolved)
  resolvedRef.current = onResolved

  const start = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPhase("running")
    setTurns([])
    setResolution(null)
    setSource(null)
    setLlmFailed(false)
    const got: HuddleTurn[] = []
    let src: HuddleSource = "composed"
    try {
      const res = await fetch("/api/huddle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ case: c, prefer }), signal: ac.signal })
      if (!res.ok || !res.body) throw new Error(`huddle ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      let resolved = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = raw.match(/^event: (.+)$/m)?.[1]
          const data = raw.match(/^data: (.+)$/m)?.[1]
          if (!ev || !data) continue
          const p = JSON.parse(data)
          if (ev === "meta") {
            src = p.source
            setSource(p.source)
            setLlmFailed(Boolean(p.llmFailed))
          } else if (ev === "thinking") setSpeaking(p.role)
          else if (ev === "turn") {
            got.push(p)
            setTurns([...got])
          } else if (ev === "resolution") {
            resolved = true
            setResolution(p)
            setSpeaking(null)
            setPhase("done")
            resolvedRef.current?.({ caseId: c.id, turns: got, resolution: p, source: src })
          } else if (ev === "error") throw new Error(p.message)
        }
      }
      if (!resolved) throw new Error("stream ended early")
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setSpeaking(null)
      setPhase("error")
    }
  }, [c, prefer])

  useEffect(() => () => abortRef.current?.abort(), [])
  return { phase, turns, speaking, resolution, source, llmFailed, start }
}

/** The convened seats around an iridescent core; the speaker glows. */
export function RoundTable({ roles, speaking, turns, size = 340 }: { roles: HuddleRoleId[]; speaking: HuddleRoleId | null; turns: HuddleTurn[]; size?: number }) {
  const seats = roles.map((r) => HUDDLE_ROLE_MAP[r])
  const R = size / 2 - 44
  const c = size / 2
  const lastBy = (id: string) => turns.findLast((t) => t.role === id)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`圆桌：${seats.map((s) => s.title).join("、")}`}>
      <div className="absolute inset-[22%] rounded-full bg-pearl-animated opacity-60 blur-2xl" />
      <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full border border-white/60 bg-white/70 text-center shadow-[var(--shadow-lift)] backdrop-blur">
        <motion.div animate={speaking === "moderator" ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={{ repeat: speaking === "moderator" ? Infinity : 0, duration: 1 }} className="font-cn-serif text-[26px] font-semibold">
          议
        </motion.div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">会诊主持</div>
        <div className="mt-1 text-[10px] text-muted-foreground tabular">{turns.length} 次发言</div>
      </div>
      {seats.map((r, i) => {
        const a = (Math.PI * 2 * i) / seats.length - Math.PI / 2
        const active = speaking === r.id
        const last = lastBy(r.id)
        return (
          <div key={r.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: c + Math.cos(a) * R, top: c + Math.sin(a) * R }}>
            <motion.div animate={active ? { scale: 1.12 } : { scale: 1 }} className="relative flex size-[62px] flex-col items-center justify-center rounded-full bg-white text-center shadow-[var(--shadow-lift)]" style={{ boxShadow: active ? `0 0 0 3px ${r.color}, 0 0 28px ${r.color}88` : undefined }}>
              <span className="font-cn-serif text-[17px] font-semibold" style={{ color: r.color }}>
                {r.name.slice(0, 1)}
              </span>
              <span className="text-[9px] leading-none text-muted-foreground">{r.title.slice(0, 4)}</span>
              {last?.stance && last.stance !== "neutral" && (
                <span className="absolute -bottom-1.5 rounded-full px-1.5 py-px text-[8.5px] font-medium text-white" style={{ background: STANCE[last.stance].color }}>
                  {STANCE[last.stance].cn}
                </span>
              )}
              {active && (
                <span className="absolute -top-2 flex gap-0.5 rounded-full bg-ink px-1.5 py-1">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="size-1 rounded-full bg-white" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />
                  ))}
                </span>
              )}
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}

export function HuddleTranscript({ turns, speaking }: { turns: HuddleTurn[]; speaking: HuddleRoleId | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [turns.length, speaking])
  return (
    <div ref={ref} className="scrollbar-thin h-full space-y-3 overflow-y-auto pt-3 pr-1 [mask-image:linear-gradient(to_bottom,transparent,black_14px)]" aria-live="polite">
      <AnimatePresence initial={false}>
        {turns.map((t) => {
          const r = HUDDLE_ROLE_MAP[t.role]
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} className="flex gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-cn-serif text-[12px] font-semibold text-white" style={{ background: r.color }}>
                {r.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-semibold">{r.name}</span>
                  <span className="text-[10.5px] text-muted-foreground">{r.title}</span>
                  {t.stance && t.stance !== "neutral" && (
                    <span className="rounded px-1 text-[9.5px] font-medium" style={{ color: STANCE[t.stance].color, background: `${STANCE[t.stance].color}14` }}>
                      {STANCE[t.stance].cn}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] leading-[1.75] text-ink-soft">{t.text}</p>
                {t.refs && t.refs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.refs.map((x) => (
                      <span key={x} className="rounded border border-line px-1.5 text-[9.5px] text-muted-foreground">
                        {x}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {speaking && (
        <div className="flex items-center gap-2 pl-9 text-[11px] text-muted-foreground">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((d) => (
              <motion.span key={d} className="size-1 rounded-full bg-muted-foreground" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />
            ))}
          </span>
          {HUDDLE_ROLE_MAP[speaking].name} 正在发言…
        </div>
      )}
    </div>
  )
}

/** Each action of the resolution becomes a proposed task; the policy routes it to the duty manager. */
function ResolutionToTasks({ resolution }: { resolution: HuddleResolution }) {
  const customerId = useConsole((s) => s.scenario.customer.id)
  const propose = useRecord((s) => s.propose)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={done || busy}
      onClick={async () => {
        setBusy(true)
        let n = 0
        for (const a of resolution.actions) {
          const r = await propose(customerId, { kind: "escalate", title: `会诊决议：${a.action}`.slice(0, 24), detail: `${a.owner} · 时限 ${a.deadline}`, impact: "落实会诊决议" })
          if (r.task) n++
          else if (r.error) toast.error(r.error)
        }
        setBusy(false)
        setDone(true)
        if (n) toast.success(`已把 ${n} 项决议转为任务，等待主管批准`)
      }}
      className="relative mt-3 flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[11.5px] font-medium text-white hover:bg-white/15 disabled:opacity-60"
    >
      <ClipboardCheck className="size-3.5" />
      {done ? "已转为任务（待主管批准）" : busy ? "正在建立任务…" : `把 ${resolution.actions.length} 项决议转为任务`}
    </button>
  )
}

export function ResolutionCard({ resolution, caseId, source }: { resolution: HuddleResolution; caseId: string; source?: HuddleSource | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 350)
    return () => clearTimeout(t)
  }, [])
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative scroll-mb-6 overflow-hidden rounded-2xl bg-ink p-4 text-porcelain">
      <div className="pointer-events-none absolute -right-12 -bottom-16 size-48 rounded-full bg-pearl-animated opacity-30 blur-3xl" />
      <div className="relative flex items-center gap-2">
        <FileSignature className="size-4" />
        <span className="font-cn-serif text-[14px] font-semibold">会诊决议 · {caseId}</span>
        <span className="ml-auto flex items-baseline gap-1 text-[11px] text-porcelain/60" title="模拟讨论中各席位最后一次表态的平均值（赞同 1 · 审慎 0.5 · 反对 0）。这些表态来自同一次生成，不是各部门的真实意见，不能当作批准或安全性证明。">
          模拟立场一致度
          <span className="text-[20px] font-semibold text-white tabular">{Math.round(resolution.consensus * 100)}%</span>
        </span>
      </div>
      <p className="relative mt-2 text-[13px] leading-relaxed">{resolution.decision}</p>
      <div className="relative mt-3 space-y-1.5">
        {resolution.actions.map((a, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-2 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[11.5px]">
            <CheckCircle2 className="size-3.5 shrink-0 text-[#a8e6d2]" />
            <span className="w-24 shrink-0 text-porcelain/60">{a.owner}</span>
            <span className="flex-1">{a.action}</span>
            <span className="shrink-0 text-[10.5px] text-[#f4e3c1] tabular">{a.deadline}</span>
          </motion.div>
        ))}
      </div>
      {resolution.dissent && (
        <div className="relative mt-3 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] leading-relaxed text-porcelain/75">
          <span className="text-[#f4e3c1]">保留意见　</span>
          {resolution.dissent}
        </div>
      )}
      <ResolutionToTasks resolution={resolution} />
      <div className="relative mt-3 text-[10.5px] text-porcelain/50">
        讨论是多角色模拟{source ? `（${HUDDLE_SOURCE_LABEL[source]}）` : ""}，决议是建议：转为任务后，由值班主管批准才会执行。
      </div>
    </motion.div>
  )
}

export function HuddleRoom({ huddleCase, compact = false, autoStart = false, record, onResolved, prefer = "auto" }: { huddleCase: HuddleCase; compact?: boolean; autoStart?: boolean; record?: HuddleRecord; onResolved?: (r: HuddleRecord) => void; prefer?: "script" | "auto" }) {
  const live = useHuddle(huddleCase, onResolved, prefer)
  // a roundtable already held in this conversation is shown as it ended, not run again
  const showing = live.phase === "idle" && record ? { phase: "done" as const, turns: record.turns, resolution: record.resolution, source: record.source, speaking: null, llmFailed: false } : live
  const { phase, turns, speaking, resolution, source, llmFailed } = showing
  const start = live.start

  useEffect(() => {
    if (autoStart && !record) start()
  }, [autoStart, record, start])

  return (
    <div className={cn("grid gap-5", compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[400px_1fr]")}>
      <div className="flex flex-col items-center gap-4">
        <RoundTable roles={huddleCase.roles} speaking={speaking} turns={turns} size={compact ? 300 : 360} />
        <div className="flex flex-col items-center gap-2">
          {(!compact || phase === "error") && (
            <button onClick={start} disabled={phase === "running"} className="flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white disabled:opacity-50">
              {phase === "idle" ? <Play className="size-3.5" /> : phase === "running" ? <CircleDashed className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              {phase === "idle" ? "召集会诊" : phase === "running" ? "会诊进行中…" : phase === "error" ? "重试" : "重新会诊"}
            </button>
          )}
          {source && (
            <span className="text-center text-[11px] text-muted-foreground">
              讨论来源：{HUDDLE_SOURCE_LABEL[source]}
              {llmFailed && <span className="block text-[#8a5306]">大模型没有返回可用的讨论，已改用离线方式</span>}
            </span>
          )}
        </div>
      </div>
      <div className={cn("flex min-h-0 flex-col gap-3", !compact && "min-h-[520px]")}>
        {phase === "idle" ? (
          <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 text-center">
            <Users className="size-6 text-muted-foreground" />
            <div className="mt-2 font-cn-serif text-[15px] font-semibold">{huddleCase.roles.length} 个部门，一张圆桌</div>
            <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">与这起个案相关的部门同时入席，各自从本部门的目标和红线出发讨论，形成带责任部门和时限的决议。</p>
          </div>
        ) : phase === "error" && turns.length === 0 ? (
          <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[#f1c9c9] bg-[#fdf4f3] px-6 text-center">
            <TriangleAlert className="size-5 text-[#a32626]" />
            <div className="mt-2 text-[13px] font-semibold">会诊没有启动成功</div>
            <p className="mt-1 text-[12px] text-muted-foreground">请检查服务是否在运行，然后重试。个案材料不会丢失。</p>
          </div>
        ) : (
          <div className={cn(compact ? "h-[340px]" : "h-[420px]")}>
            <HuddleTranscript turns={turns} speaking={speaking} />
          </div>
        )}
        {phase === "error" && turns.length > 0 && <div className="rounded-xl bg-[#fdf4f3] px-3 py-2 text-[12px] text-[#a32626]">会诊中断，还没有形成决议。可以重试。</div>}
        {resolution && <ResolutionCard resolution={resolution} caseId={huddleCase.id} source={source} />}
      </div>
    </div>
  )
}
