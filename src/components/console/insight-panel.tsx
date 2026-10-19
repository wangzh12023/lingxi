"use client"

import { cn } from "@/lib/utils"
import { activeCase, adrDeadline, useConsole } from "@/lib/store"
import { ROUTES } from "@/lib/engine/router"
import { ADR_INTERNAL_HOURS, ADR_REPORT_DAYS, ADR_SOURCE, ADR_TIER_CN, screenAdr, type AdrTier } from "@/lib/engine/adr"
import { useShallow } from "zustand/react/shallow"
import { DRAFT_STYLES, EMOTIONS, INTENTS, ORIGINS, RISK_CATEGORIES, RISK_LEVELS } from "@/lib/constants"
import type { Insight, Origin, ReplyDraft, RiskSignal } from "@/lib/types"
import { EmotionPrism, EmotionWheel, Meter, RiskBadge } from "@/components/lingxi/primitives"
import { AgentConstellation, TraceList } from "./constellation"
import { JourneyPanel } from "./journey"
import { ActionItem, CaseCard } from "./case-card"
import { useRecord } from "@/lib/record-store"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { ArrowUpRight, BookOpenText, Check, ChevronDown, CircleAlert, Clock3, Compass, Copy, ShieldCheck, Sparkles, Users, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { BorderBeam } from "@/components/ui/border-beam"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function Section({ title, en, children, right, className }: { title: string; en?: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-white p-3.5", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h3 className="font-cn-serif text-[13px] font-semibold">{title}</h3>
          {en && <span className="font-serif text-[11px] text-muted-foreground italic">{en}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Where a finding came from — shown beside every finding, so a script never reads as a measurement. */
export function OriginTag({ origin, className }: { origin: Origin; className?: string }) {
  const tone = { rule: "bg-muted text-ink-soft", data: "bg-[#e6ecf6] text-[#34507e]", model: "bg-[#efe9fb] text-[#5b44b5]", script: "bg-[#faf1d9] text-[#7a5a0c]" }[origin]
  return (
    <span title={ORIGINS[origin].desc} className={cn("inline-flex shrink-0 items-center rounded px-1 py-px text-[9.5px] font-medium", tone, className)}>
      {ORIGINS[origin].cn}
    </span>
  )
}

function WhisperCard({ text, huddle }: { text?: string; huddle?: { held: boolean; stale?: string[] } }) {
  const setHuddle = useConsole((s) => s.setHuddleOpen)
  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink p-4 text-porcelain shadow-[var(--shadow-float)]">
      <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-pearl-animated opacity-35 blur-3xl" />
      <div className="relative flex items-center gap-2 text-[10.5px] tracking-[0.2em] text-porcelain/60">
        <Sparkles className="size-3" />
        灵犀一念
      </div>
      <AnimatePresence mode="wait">
        {text ? (
          <motion.p key={text} initial={{ opacity: 0, filter: "blur(6px)", y: 4 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="relative mt-2 font-cn-serif text-[15.5px] leading-[1.75] font-medium">
            {text}
          </motion.p>
        ) : (
          <div className="relative mt-3 space-y-2">
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-white/10" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/10" />
          </div>
        )}
      </AnimatePresence>
      {huddle && (
        <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => setHuddle(true)} className="relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white py-2 text-[12.5px] font-semibold text-ink">
          <Users className="size-3.5" />
          {huddle.held ? (huddle.stale?.length ? "会诊后有新证据，需复核" : "查看会诊决议") : "发起跨部门会诊"}
          <ArrowUpRight className="size-3.5" />
          {!huddle.held && <BorderBeam size={60} duration={4} colorFrom="#d76a95" colorTo="#4c9ad8" />}
        </motion.button>
      )}
    </div>
  )
}

/**
 * Two clocks for a suspected adverse reaction: the brand's own 24-hour logging rule (part of the
 * demo setting) and the statutory reporting deadline, which depends on the tier.
 */
function ReportingClock() {
  const deadline = useConsole(adrDeadline)
  const started = useConsole((s) => s.adrClockStartedAt)
  const texts = useConsole(useShallow((s) => s.messages.filter((m) => m.role === "consumer").map((m) => m.text)))
  const cluster = useConsole((s) => Object.values(s.insights).some((i) => i.risk.signals.some((x) => x.origin === "data" && x.category === "safety" && x.level >= 3)))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!deadline || !started) return null
  const left = Math.max(0, Math.round((deadline - now) / 1000))
  const hh = String(Math.floor(left / 3600)).padStart(2, "0")
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0")
  const ss = String(left % 60).padStart(2, "0")
  const screen = screenAdr(texts, { cluster })
  const due = new Date(started + screen.days * 86400000)
  return (
    <div className="rounded-xl bg-[#fdf3f1] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <Clock3 className="size-3.5 shrink-0 text-[#a32626]" />
        <div className="min-w-0 flex-1 text-[11px] leading-tight">
          <div className="font-medium text-ink">不良反应登记</div>
          <div className="mt-0.5 text-muted-foreground">品牌内部规范（演示设定）：获知后 {ADR_INTERNAL_HOURS} 小时内录入</div>
        </div>
        <div className="text-[15px] font-semibold text-ink tabular" aria-label={`剩余 ${hh} 小时 ${mm} 分`}>
          {hh}:{mm}:{ss}
        </div>
      </div>
      <div className="mt-2 border-t border-[#f3d9d4] pt-2 text-[11px] leading-relaxed text-ink-soft">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink">法定报告时限</span>
          {(Object.keys(ADR_REPORT_DAYS) as AdrTier[]).map((k) => (
            <span key={k} className={cn("rounded px-1.5 py-px tabular", k === screen.tier ? "bg-ink text-white" : "bg-white text-muted-foreground")}>
              {ADR_TIER_CN[k]} {ADR_REPORT_DAYS[k]} 日
            </span>
          ))}
        </div>
        <div className="mt-1 text-muted-foreground">
          初筛为“{ADR_TIER_CN[screen.tier]}”{screen.cue ? `（消费者提到“${screen.cue}”）` : ""}：自获知之日起 {screen.days} 日内报告，即 {due.getMonth() + 1} 月 {due.getDate()} 日前。属于哪一档由质量法规部认定。
          {screen.clusterReview && " 同批次反馈正在聚集，需评估是否属于“可能引发较大社会影响”（3 日）。"}
          <span className="ml-1 text-[10.5px]">依据：{ADR_SOURCE}</span>
        </div>
      </div>
    </div>
  )
}

function SignalRow({ s, current }: { s: RiskSignal; current: number }) {
  const [open, setOpen] = useState(s.level >= 3)
  const lv = RISK_LEVELS[s.level]
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: lv.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="line-clamp-1 text-[12px] font-medium">{s.title}</span>
            <OriginTag origin={s.origin} />
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
            {RISK_CATEGORIES[s.category].cn} · 归属 {RISK_CATEGORIES[s.category].owner}
            {s.turn < current && ` · 第 ${s.turn} 轮识别`}
          </div>
        </div>
        <RiskBadge level={s.level} compact />
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <dl className="grid grid-cols-[36px_1fr] gap-x-2 gap-y-1 border-t border-line px-2.5 py-2 text-[11px] leading-relaxed">
              <dt className="text-muted-foreground">证据</dt>
              <dd>{s.evidence}</dd>
              {s.rule && (
                <>
                  <dt className="text-muted-foreground">依据</dt>
                  <dd>{s.rule}</dd>
                </>
              )}
              {s.action && (
                <>
                  <dt className="text-muted-foreground">处置</dt>
                  <dd className="font-medium">{s.action}</dd>
                </>
              )}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ScoreBreakdown({ d }: { d: ReplyDraft }) {
  const dims = [
    { k: "共情", v: d.score.empathy },
    { k: "专业", v: d.score.professional },
    { k: "合规", v: d.score.compliance },
    { k: "效率", v: d.score.efficiency },
  ]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 rounded-md px-1 text-[10.5px] text-muted-foreground hover:bg-muted" aria-label={`评分 ${d.score.overall}，查看明细`}>
          评分 <span className="font-semibold text-ink tabular">{d.score.overall}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="text-[12.5px] font-semibold">评分明细</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">规则量表打分，与共情学院用的是同一套。它检查做没做到，不评判文笔。</p>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
          {dims.map((x) => (
            <div key={x.k} className="rounded-lg bg-muted py-1">
              <div className="text-[13px] font-semibold tabular">{x.v}</div>
              <div className="text-[10px] text-muted-foreground">{x.k}</div>
            </div>
          ))}
        </div>
        <ul className="mt-2.5 space-y-1">
          {d.score.checks.map((c) => (
            <li key={c.label} className="flex items-center gap-1.5 text-[11.5px]">
              <span className={cn("flex size-3.5 items-center justify-center rounded-full text-[9px] text-white", c.pass ? "bg-[#2c7a3f]" : "bg-[#cfccc6]")}>{c.pass ? "✓" : ""}</span>
              <span className={c.pass ? "text-ink" : "text-muted-foreground"}>{c.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{c.dim === "empathy" ? "共情" : "专业"}</span>
            </li>
          ))}
        </ul>
        {d.issues.length > 0 && <div className="mt-2 text-[11px] text-[#a32626]">合规：{d.issues.map((i) => `“${i.phrase}”${i.reason}`).join("；")}</div>}
        <div className="mt-2 border-t border-line pt-2 text-[10.5px] leading-relaxed text-muted-foreground">共情、专业：40 分起，每做到一项加 15 分。合规：100 分起，严重问题扣 45 分、提醒扣 15 分。总分不超过合规分。</div>
      </PopoverContent>
    </Popover>
  )
}

function DraftCard({ d, recommended, reason }: { d: ReplyDraft; recommended: boolean; reason?: string }) {
  const adopt = useConsole((s) => s.adoptDraft)
  const adopted = useConsole((s) => s.composer === d.text)
  const blocking = d.issues.some((i) => i.severity === "block")
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", adopted ? "border-[#c3b5f4] bg-[#f7f4fe]" : "border-line bg-white hover:border-[#d9d0f5]")}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11.5px] font-semibold">{DRAFT_STYLES[d.style].cn}</span>
        {recommended && <span className="rounded bg-pearl-soft px-1.5 py-0.5 text-[9.5px] font-medium text-[#5b44b5]">推荐</span>}
        <OriginTag origin={d.origin} />
        <span className="ml-auto" />
        <ScoreBreakdown d={d} />
        {blocking ? (
          <span className="flex items-center gap-0.5 text-[10px] text-[#a32626]">
            <CircleAlert className="size-3" />
            有违规
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground" title="只是起草时的规则检查；按发送时，服务端还会核对事实、政策与权限">
            <ShieldCheck className="size-3" />
            规则未发现问题
          </span>
        )}
      </div>
      <p className="text-[12.5px] leading-[1.7] text-ink-soft">{d.text}</p>
      {recommended && reason && <p className="mt-1.5 text-[10.5px] text-muted-foreground">推荐理由：{reason}</p>}
      <div className="mt-2 flex items-center gap-1.5">
        <button onClick={() => adopt(d.text)} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white transition hover:bg-ink/85">
          {adopted ? <Check className="size-3" /> : <Wand2 className="size-3" />}
          {adopted ? "已放入输入框" : "采用并编辑"}
        </button>
        <button
          onClick={() => {
            if (!navigator.clipboard) return toast.error("当前浏览器不支持一键复制")
            navigator.clipboard.writeText(d.text).then(
              () => toast.success("已复制"),
              () => toast.error("复制失败，请手动选择文本"),
            )
          }}
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <Copy className="size-3" />
          复制
        </button>
      </div>
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[#f1c9c9] bg-[#fdf4f3] p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#a32626]">
        <CircleAlert className="size-4" />
        这一轮没有分析完成
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">{message}。对话内容没有丢失，可以重试；也可以先按自己的判断回复。</p>
      <button onClick={onRetry} className="mt-2 h-7 rounded-lg bg-ink px-3 text-[11.5px] font-medium text-white">
        重试分析
      </button>
    </div>
  )
}

/** Whether “更多分析” is unfolded — remembered across turns, so the agent's choice sticks. */
let moreOpen = false
function useMoreState(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(moreOpen)
  return [v, (x: boolean) => {
    moreOpen = x
    setV(x)
  }]
}

export function InsightPanel() {
  const insights = useConsole((s) => s.insights)
  const activeId = useConsole((s) => s.activeInsightId)
  const partial = useConsole((s) => s.partial)
  const analyzing = useConsole((s) => s.analyzing)
  const error = useConsole((s) => s.analysisError)
  const retry = useConsole((s) => s.retryAnalysis)
  const huddleCase = useConsole(activeCase)
  const held = useConsole((s) => Boolean(huddleCase && s.huddles[huddleCase.id]))
  // a roundtable held on an older version of the case: list what has been learned since
  const stale = useConsole((s) => {
    const r = huddleCase && s.huddles[huddleCase.id]
    return r && (r.caseVersion ?? 1) < (huddleCase.version ?? 1) ? huddleCase.evidence.slice(-((huddleCase.version ?? 1) - (r.caseVersion ?? 1) + 1)) : undefined
  })
  const selected = activeId ? insights[activeId] : undefined
  const ins: Partial<Insight> | undefined = analyzing ? partial : selected
  const all = Object.values(insights)
  const latestTurn = all.at(-1)?.turn
  const caseTurn = all.find((i) => i.huddleCase)?.turn
  const [more, setMore] = useMoreState()

  if (!ins || (!analyzing && !selected)) {
    return (
      <div className="scrollbar-thin h-full space-y-3 overflow-y-auto p-4">
        {error && <ErrorCard message={error} onRetry={retry} />}
        <JourneyPanel />
        <AgentConstellation />
        {!error && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <div className="font-cn-serif text-[15px] font-semibold">等待第一句话</div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              点击上方「播放消费者下一句」，或切换到自由模式输入一句话，
              <br />
              九个智能体会依次完成感知、检索、起草与质检。
            </p>
          </div>
        )}
      </div>
    )
  }

  const showHuddle = Boolean(huddleCase && caseTurn !== undefined && (ins.turn ?? 0) >= caseTurn)
  const safetyOpen = ins.risk?.signals.some((s) => s.category === "safety" && s.level >= 2)

  return (
    <div className="scrollbar-thin h-full space-y-3 overflow-y-auto p-4">
      {error && <ErrorCard message={error} onRetry={retry} />}
      {!analyzing && selected && latestTurn !== undefined && selected.turn !== latestTurn && (
        <div className="rounded-xl bg-muted px-3 py-2 text-[11.5px] text-ink-soft">正在查看第 {selected.turn} 轮的分析。点击对话中最新的一条消息可回到当前。</div>
      )}
      <CaseCard ins={ins} />
      <WhisperCard text={ins.whisper} huddle={showHuddle ? { held, stale } : undefined} />
      <ActionsSection ins={ins} />

      <details className="group rounded-2xl border border-line bg-white" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[12px] font-medium text-ink-soft">
          <span>更多分析：服务轨迹、情绪、意图、全部风险、三版草稿、依据、执行轨迹</span>
          <ChevronDown className="size-4 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-line p-3">
      <JourneyPanel />
      <AgentConstellation />

      <div className="grid grid-cols-2 gap-3">
        <Section title="闻 · 情绪" en="Empath">
          {ins.emotion ? (
            <div className="flex flex-col items-center">
              <EmotionWheel vector={ins.emotion.vector} size={150} />
              <div className="mt-1 flex w-full items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <span className="size-2 rounded-full" style={{ background: EMOTIONS[ins.emotion.dominant].color }} />
                  {EMOTIONS[ins.emotion.dominant].cn} {Math.round(ins.emotion.intensity * 100)}
                </span>
                <span className="text-muted-foreground" title="与上一轮相比，负面情绪的变化">
                  {ins.emotion.trend === "rising" ? "↗ 升温" : ins.emotion.trend === "falling" ? "↘ 缓和" : "→ 平稳"}
                </span>
              </div>
              <div className="mt-1 w-full text-[10.5px] text-muted-foreground">{EMOTIONS[ins.emotion.dominant].hint}</div>
            </div>
          ) : (
            <Skeleton className="h-[170px] w-full rounded-xl" />
          )}
        </Section>
        <Section title="问 · 意图" en="Intent">
          {ins.intent ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">{INTENTS[ins.intent.primary].cn}</span>
                {ins.intent.secondary && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{INTENTS[ins.intent.secondary].cn}</span>}
              </div>
              <div className="text-[11.5px] leading-relaxed text-ink-soft">{ins.intent.summary}</div>
              {ins.keyFacts && ins.keyFacts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ins.keyFacts.map((f) => (
                    <span key={f} className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-soft">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Skeleton className="h-[170px] w-full rounded-xl" />
          )}
        </Section>
      </div>

      {ins.emotion && <EmotionPrism vector={ins.emotion.vector} height={6} />}

      <Section title="潜台词" en="Between the lines" right={<span className="text-[10px] text-muted-foreground">没说出口的那句话</span>}>
        {ins.unspoken ? (
          ins.unspoken.length ? (
            <div className="space-y-2">
              {ins.unspoken.map((u, i) => (
                <motion.div key={u.surface + i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="rounded-xl bg-pearl-soft p-2.5">
                  <div className="text-[11px] text-muted-foreground">原话：“{u.surface}”</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed font-medium text-ink">可能想说：{u.underlying}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Meter value={u.confidence} color="#8a72e0" className="h-1" />
                    <span className="shrink-0 text-[9.5px] text-muted-foreground tabular" title="判断的把握程度，不是统计概率">
                      把握 {Math.round(u.confidence * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="py-1 text-[11.5px] text-muted-foreground">这句话没有识别到明显的潜台词。</div>
          )
        ) : (
          <Skeleton className="h-16 w-full rounded-xl" />
        )}
      </Section>

      <Section title="切 · 风险" en="Sentinel" right={ins.risk && <RiskBadge level={ins.risk.level} />}>
        {ins.risk ? (
          <div className="space-y-2">
            <div className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3, 4].map((l) => (
                <div key={l} className="h-1.5 flex-1 rounded-full transition-colors duration-500" style={{ background: l <= ins.risk!.level ? RISK_LEVELS[l as 0].color : "#efece6" }} />
              ))}
            </div>
            <p className="text-[10.5px] text-muted-foreground">{RISK_LEVELS[ins.risk.level].desc}。风险在一次会话里累积，不会因为对方语气缓和就自动消失。</p>
            {safetyOpen && <ReportingClock />}
            {ins.risk.signals.length === 0 && <div className="py-1 text-[11.5px] text-muted-foreground">没有发现显著风险。</div>}
            {ins.risk.signals.map((s) => (
              <SignalRow key={s.id} s={s} current={ins.turn ?? 1} />
            ))}
          </div>
        ) : (
          <Skeleton className="h-24 w-full rounded-xl" />
        )}
      </Section>

      <Section title="笔 · 回复草稿" en="Scribe" right={<span className="text-[10px] text-muted-foreground">灵犀起草，坐席决定</span>}>
        {ins.drafts ? (
          <div className="space-y-2">
            {ins.drafts.map((d) => (
              <DraftCard key={d.id} d={d} recommended={d.style === ins.recommended?.style} reason={ins.recommended?.reason} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}
      </Section>


      <Section title="典 · 依据" en="Citations" right={<BookOpenText className="size-3.5 text-muted-foreground" />}>
        {ins.citations ? (
          <div className="space-y-1.5">
            {ins.citations.length === 0 && <div className="rounded-xl bg-[#fdf0dc]/70 px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">知识库没有命中依据。涉及政策、金额或时限时，请先向主管确认。</div>}
            {ins.citations.map((c, i) => (
              <div key={c.docId} className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded bg-muted text-[9px] tabular">{i + 1}</span>
                  <span className="line-clamp-1 flex-1 text-[11.5px] font-medium">{c.title}</span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">“{c.snippet}”</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[9.5px] text-muted-foreground">命中：</span>
                  {c.matched.map((m) => (
                    <span key={m} className="rounded bg-muted px-1 text-[9.5px] text-ink-soft">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Skeleton className="h-16 w-full rounded-xl" />
        )}
      </Section>

      <Section title="执行轨迹" en="Trace">
        <TraceList />
        {selected && !analyzing && (
          <div className="mt-2.5 space-y-1 border-t border-line pt-2 text-[10.5px] text-muted-foreground">
            <div>判断来源：{{ script: "演示脚本（代替大模型的判断）", rules: "规则引擎", llm: "大模型，规则引擎同时把关" }[selected.source]}</div>
            {selected.degraded.length > 0 && <div className="text-[#8a5306]">有 {selected.degraded.length} 个智能体的模型调用没有成功，已由规则引擎接替。</div>}
            {selected.route && (
              <div>
                省 · 路由：<span className="font-medium text-ink-soft">{ROUTES[selected.route.route].cn}</span>（{selected.route.reason}），模型调用 {selected.usage.length} 次
              </div>
            )}
            {selected.usage.map((c, i) => (
              <div key={i} className="tabular">
                {c.name}：{c.ok ? `${(c.ms / 1000).toFixed(1)} 秒 · ${c.tokens} tokens${c.cachedTokens ? `（其中 ${c.cachedTokens} 命中缓存）` : ""}` : "失败"} · {c.model}
              </div>
            ))}
          </div>
        )}
      </Section>
        </div>
      </details>
    </div>
  )
}

/** 策 · every proposed action, each with its live task status; approvals go through the server. */
function ActionsSection({ ins }: { ins: Partial<Insight> }) {
  const customerId = useConsole((s) => s.scenario.customer.id)
  const data = useRecord((s) => s.byCustomer[customerId])
  const rest = ins.actions?.filter((a) => !a.primary) ?? []
  if (!ins.actions) return <Skeleton className="h-24 w-full rounded-xl" />
  if (!rest.length) return null
  return (
    <Section title="策 · 其他可选行动" en="Options" right={<Compass className="size-3.5 text-muted-foreground" />}>
      <div className="space-y-1.5">
        {rest.map((a) => (
          <ActionItem key={`${ins.turn}-${a.id}`} a={a} customerId={customerId} tasks={data?.tasks ?? []} now={data?.now} />
        ))}
        <p className="pt-1 text-[10.5px] leading-relaxed text-muted-foreground">审批人由服务端按行动类型、金额和此前的履约情况计算，不取自起草者的建议。批准并生成工单之后，才能对消费者说“已安排”。</p>
      </div>
    </Section>
  )
}
