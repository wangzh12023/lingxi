"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { PersonAvatar } from "@/components/lingxi/primitives"
import { END_MOOD, MAX_TURNS, MOOD_LABEL, PERSONAS, RUBRIC, moodBand, type CoachPersona } from "@/lib/coach"
import { checkCompliance } from "@/lib/engine/audit"
import type { ComplianceIssue, ModelCall, ReplyScore } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CornerDownLeft, GraduationCap, LoaderCircle, RotateCcw, ShieldAlert, Sparkles, Trophy } from "lucide-react"
import { toast } from "sonner"

interface Turn {
  role: "customer" | "trainee"
  text: string
  score?: ReplyScore
  issues?: ComplianceIssue[]
  moodDelta?: number
  better?: string | null
}

interface CoachResponse {
  score: ReplyScore
  issues: ComplianceIssue[]
  mood: number
  moodDelta: number
  band: "hot" | "warm" | "cool"
  ended: boolean
  line: string | null
  better: string | null
  source: "llm" | "rules"
  calls: ModelCall[]
}

const DIM_COLOR = { empathy: "#d0688b", professional: "#4f71ac", compliance: "#2c7a3f", efficiency: "#8a72e0" } as const

/** A mood gauge from −1 (furious) to +1 (calm), with the session's end line marked. */
function MoodGauge({ mood }: { mood: number }) {
  const pct = ((mood + 1) / 2) * 100
  const band = moodBand(mood)
  const tone = band === "hot" ? "#d03b3b" : band === "warm" ? "#c27410" : "#2c7a3f"
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">客户情绪</span>
        <span className="font-semibold text-ink">
          {MOOD_LABEL[band]} <span className="font-normal text-muted-foreground tabular">{mood > 0 ? "+" : ""}{mood.toFixed(2)}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-[#f6d9d6] via-[#f7ecd8] to-[#d9eedf]">
        <span className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-ink/40" style={{ left: `${((END_MOOD + 1) / 2) * 100}%` }} title="超过这条线，陪练结束" />
        <motion.span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ background: tone }} animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>激动 −1</span>
        <span>平复 +1</span>
      </div>
    </div>
  )
}

function ScoreCard({ t }: { t: Turn }) {
  if (!t.score) return null
  const s = t.score
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-xl border border-line bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">这条回复</span>
        <span className="text-[18px] font-semibold text-ink">{s.overall}</span>
        <span className="text-[11px] text-muted-foreground">分</span>
        {t.moodDelta !== undefined && (
          <span className={cn("ml-auto text-[11px] font-medium tabular", t.moodDelta >= 0 ? "text-[#2c7a3f]" : "text-[#a32626]")}>
            客户情绪 {t.moodDelta >= 0 ? "+" : ""}
            {t.moodDelta.toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {RUBRIC.map((r) => (
          <div key={r.key}>
            <div className="flex items-baseline justify-between text-[10.5px]">
              <span className="text-muted-foreground">{r.cn}</span>
              <span className="font-semibold tabular">{s[r.key]}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full" style={{ background: `${DIM_COLOR[r.key]}26` }}>
              <div className="h-1.5 rounded-full" style={{ width: `${s[r.key]}%`, background: DIM_COLOR[r.key] }} />
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {s.checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-1 text-[11px]", c.pass ? "text-ink" : "text-muted-foreground")}>
            <span className={cn("flex size-3.5 items-center justify-center rounded-full text-[8.5px] text-white", c.pass ? "bg-[#2c7a3f]" : "bg-[#cfccc6]")}>{c.pass ? "✓" : ""}</span>
            {c.label}
          </li>
        ))}
      </ul>
      {t.issues && t.issues.length > 0 && (
        <div className="mt-2 rounded-lg bg-[#fdf3f1] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-soft">
          {t.issues.map((i) => (
            <div key={i.id}>
              <b className="font-semibold">“{i.phrase}”</b>：{i.reason}。{i.suggestion}
            </div>
          ))}
        </div>
      )}
      {t.better && (
        <div className="mt-2 rounded-lg bg-pearl-soft px-2.5 py-1.5 text-[11.5px] leading-relaxed">
          <span className="font-semibold text-ink">示范回复（大模型生成，已通过合规检查）：</span>
          {t.better}
        </div>
      )}
    </motion.div>
  )
}

function Session({ persona, onExit }: { persona: CoachPersona; onExit: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([{ role: "customer", text: persona.opening }])
  const [mood, setMood] = useState(persona.startMood)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [ended, setEnded] = useState(false)
  const [source, setSource] = useState<"llm" | "rules" | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const issues = useMemo(() => checkCompliance(draft), [draft])
  const replies = turns.filter((t) => t.role === "trainee")

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [turns.length, busy])

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy || ended) return
    const history = [...turns.map((t) => ({ role: t.role, text: t.text })), { role: "trainee" as const, text }]
    setTurns((t) => [...t, { role: "trainee", text }])
    setDraft("")
    setBusy(true)
    try {
      const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: persona.id, history, mood }) })
      if (!res.ok) throw new Error(String(res.status))
      const r: CoachResponse = await res.json()
      setMood(r.mood)
      setSource(r.source)
      setTurns((t) => {
        const next = [...t]
        next[next.length - 1] = { ...next[next.length - 1], score: r.score, issues: r.issues, moodDelta: r.moodDelta, better: r.better }
        if (r.line) next.push({ role: "customer", text: r.line })
        return next
      })
      if (r.ended) setEnded(true)
    } catch {
      setTurns((t) => t.slice(0, -1))
      setDraft(text)
      toast.error("这条回复没有评分成功", { description: "内容已放回输入框，可以重新发送" })
    } finally {
      setBusy(false)
    }
  }

  const avg = (k: (typeof RUBRIC)[number]["key"]) => (replies.length ? Math.round(replies.reduce((s, t) => s + (t.score?.[k] ?? 0), 0) / replies.filter((t) => t.score).length || 0) : 0)
  const calm = mood > END_MOOD

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="flex h-[calc(100dvh-210px)] min-h-[560px] flex-col overflow-hidden rounded-3xl border border-line bg-white">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <PersonAvatar seed={persona.avatarSeed} name={persona.name.split(" · ")[1] ?? persona.name} size={36} />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">{persona.name}</div>
            <div className="text-[11.5px] text-muted-foreground">{persona.title}</div>
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground tabular">
            第 {Math.min(replies.length + (ended ? 0 : 1), MAX_TURNS)} / {MAX_TURNS} 轮
          </span>
          <button onClick={onExit} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] text-muted-foreground hover:bg-muted">
            <RotateCcw className="size-3.5" />
            换一个角色
          </button>
        </div>
        <div ref={ref} className="scrollbar-thin bg-dot-grid flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          {turns.map((t, i) =>
            t.role === "customer" ? (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[78%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-[var(--shadow-soft)]">
                {t.text}
              </motion.div>
            ) : (
              <div key={i} className="ml-auto max-w-[82%]">
                <div className="rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[13.5px] leading-relaxed text-porcelain">{t.text}</div>
                <ScoreCard t={t} />
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              正在评分，客户在想怎么回你…
            </div>
          )}
          <AnimatePresence>
            {ended && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-2xl p-4", calm ? "bg-[#e9f5ec]" : "bg-[#fdf6ea]")}>
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  {calm ? <Trophy className="size-4 text-[#2c7a3f]" /> : <GraduationCap className="size-4 text-[#8a5306]" />}
                  {calm ? `用 ${replies.length} 轮让客户平复下来` : `${MAX_TURNS} 轮结束，客户${MOOD_LABEL[moodBand(mood)]}`}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {RUBRIC.map((r) => (
                    <div key={r.key} className="rounded-lg bg-white/70 py-1.5">
                      <div className="text-[15px] font-semibold tabular">{avg(r.key)}</div>
                      <div className="text-[10.5px] text-muted-foreground">平均{r.cn}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="border-t border-line p-3">
          {issues.length > 0 && (
            <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-[#fdf3f1] px-2.5 py-1.5 text-[11px] text-ink-soft">
              <ShieldAlert className="mt-px size-3.5 shrink-0 text-[#a32626]" />
              <span>
                发送前提醒：{issues.map((i) => `“${i.phrase}” ${i.reason}`).join("；")}。在陪练里仍然可以发送，评分会扣合规分。
              </span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void submit()
                }
              }}
              disabled={ended}
              rows={2}
              aria-label="你的回复"
              placeholder={ended ? "陪练已结束" : "以坐席身份回复…（Enter 发送，Shift + Enter 换行）"}
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-line bg-porcelain px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[#c3b5f4] disabled:opacity-50"
            />
            <button onClick={submit} disabled={!draft.trim() || busy || ended} className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white disabled:opacity-40">
              发送
              <CornerDownLeft className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-line bg-white p-5">
          <MoodGauge mood={mood} />
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            每条回复按规则量表评分，客户情绪按公式变化：
            <br />
            <span className="font-mono text-[11px] text-ink">Δ = (总分 − 60) ÷ 100 − 0.25 × 严重违规数</span>
            <br />
            情绪超过 +{END_MOOD} 或满 {MAX_TURNS} 轮时结束。
          </p>
          {source && <p className="mt-2 text-[11px] text-muted-foreground">客户的回应来自：{source === "llm" ? "大模型扮演" : "按情绪分档的预置台词"}</p>}
        </div>
        <div className="rounded-3xl border border-line bg-white p-5">
          <div className="font-cn-serif text-[14px] font-semibold">角色设定</div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{persona.brief}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {persona.traits.map((t) => (
              <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-white p-5">
          <div className="font-cn-serif text-[14px] font-semibold">评分量表</div>
          <ul className="mt-2.5 space-y-2">
            {RUBRIC.map((r) => (
              <li key={r.key} className="flex gap-2 text-[12px]">
                <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: DIM_COLOR[r.key] }} />
                <span>
                  <b className="font-semibold">{r.cn}</b>
                  <span className="text-muted-foreground"> · {r.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">与工作台给草稿打分用的是同一套量表。它检查行为有没有做到，不评价文笔。</p>
        </div>
      </aside>
    </div>
  )
}

export default function AcademyPage() {
  const [active, setActive] = useState<CoachPersona | null>(null)
  return (
    <div className="px-8 pb-12">
      <PageHeader
        className="px-0"
        eyebrow="练 · Empathy Academy"
        title="共情学院"
        desc="新人先和模拟的消费者练一练。每条回复都按工作台同一套量表评分，并说明每一分从哪里来；客户的情绪按公开的公式变化，练的是做法，不是背话术。"
      />
      {active ? (
        <Session key={active.id} persona={active} onExit={() => setActive(null)} />
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <button key={p.id} onClick={() => setActive(p)} className="group flex flex-col rounded-3xl border border-line bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-center gap-3">
                <PersonAvatar seed={p.avatarSeed} name={p.name.split(" · ")[1] ?? p.name} size={44} />
                <div>
                  <div className="text-[14.5px] font-semibold">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground">{p.title}</div>
                </div>
              </div>
              <p className="mt-4 flex-1 text-[12.5px] leading-[1.8] text-ink-soft">{p.brief}</p>
              <div className="mt-4 rounded-xl bg-muted px-3 py-2 text-[12px] leading-relaxed text-ink">“{p.opening}”</div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">难度</span>
                <span className="flex gap-0.5" aria-label={`难度 ${p.difficulty} / 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={cn("h-1.5 w-4 rounded-full", n <= p.difficulty ? "bg-ink" : "bg-line")} />
                  ))}
                </span>
                <span className="ml-auto flex items-center gap-1 text-[12px] font-medium text-ink">
                  <Sparkles className="size-3.5" />
                  开始陪练
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
