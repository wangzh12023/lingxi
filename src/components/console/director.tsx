"use client"

import { cn } from "@/lib/utils"
import { DemoControls } from "./demo-controls"
import { BREAK_MINUTES, activeCase, recommendedDraft, useConsole } from "@/lib/store"
import { EMOTIONS } from "@/lib/constants"
import { SCENARIOS } from "@/lib/scenarios"
import type { Attachment } from "@/lib/types"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { Coffee, FastForward, HeartHandshake, ImagePlus, Keyboard, Pause, Play, RotateCcw, Shuffle, Sparkles, Users, X, Zap } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"

/** Valence per consumer turn — a small line from −1 to +1 with the dominant emotion on each point. */
export function EmotionJourney() {
  const trail = useConsole((s) => s.emotionTrail)
  const W = 220
  const H = 46
  if (!trail.length) return <div className="lx-only hidden h-[46px] w-[220px] items-center justify-center rounded-xl border border-dashed border-line text-[10.5px] text-muted-foreground lg:flex">情绪走势 · 等待对话</div>
  const pts = trail.map((t, i) => ({ x: trail.length === 1 ? W / 2 : 8 + (i / (trail.length - 1)) * (W - 16), y: H / 2 - t.valence * (H / 2 - 7), t }))
  const first = trail[0].valence
  const last = trail.at(-1)!.valence
  return (
    <div className="lx-only hidden items-center gap-3 lg:flex">
      <svg width={W} height={H} className="overflow-visible" role="img" aria-label={`情绪效价从 ${first.toFixed(2)} 变为 ${last.toFixed(2)}`}>
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#e9e6e0" />
        <motion.path d={pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")} fill="none" stroke="#8a72e0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={EMOTIONS[p.t.dominant].color} stroke="#fff" strokeWidth={2}>
            <title>{`第 ${p.t.turn} 轮 · ${EMOTIONS[p.t.dominant].cn} · 效价 ${p.t.valence}`}</title>
          </circle>
        ))}
      </svg>
      <div className="text-[10.5px] leading-tight">
        <div className="text-muted-foreground">情绪效价</div>
        <div className="font-semibold text-ink tabular">
          {first > 0 ? "+" : ""}
          {first.toFixed(2)} → {last > 0 ? "+" : ""}
          {last.toFixed(2)}
        </div>
      </div>
    </div>
  )
}

export function GuardianCard() {
  const w = useConsole((s) => s.wellbeing)
  const breakEndsAt = useConsole((s) => s.breakEndsAt)
  const startBreak = useConsole((s) => s.startBreak)
  const endBreak = useConsole((s) => s.endBreak)
  const [now, setNow] = useState(() => Date.now())
  const nudged = useRef(false)
  const tone = w.stress > 70 ? "#d03b3b" : w.stress > 50 ? "#c27410" : "#2c7a3f"

  useEffect(() => {
    if (!breakEndsAt) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= breakEndsAt) endBreak()
    }, 1000)
    return () => clearInterval(t)
  }, [breakEndsAt, endBreak])

  useEffect(() => {
    if (w.stress > 70 && !nudged.current) {
      nudged.current = true
      toast("护 · 坐席守护", { description: `小禾，你已经连续 ${w.streakNegative} 轮面对负面情绪。这单结束后，给自己 ${BREAK_MINUTES} 分钟喝口水吧。`, icon: <HeartHandshake className="size-4 text-[#d0688b]" />, duration: 7000 })
    }
    if (w.stress < 55) nudged.current = false
  }, [w.stress, w.streakNegative])

  const left = breakEndsAt ? Math.max(0, Math.round((breakEndsAt - now) / 1000)) : 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="lx-only flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-1.5 hover:shadow-[var(--shadow-soft)]" aria-label={`坐席压力 ${w.stress}`}>
          <HeartHandshake className="size-3.5" style={{ color: tone }} />
          <div className="text-left leading-tight">
            <div className="text-[10px] text-muted-foreground">{breakEndsAt ? "静音时刻" : "坐席压力"}</div>
            <div className="text-[12px] font-semibold text-ink tabular">{breakEndsAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : w.stress}</div>
          </div>
          <div className="h-6 w-1 overflow-hidden rounded-full" style={{ background: `${tone}26` }}>
            <motion.div className="w-full rounded-full" style={{ background: tone }} animate={{ height: `${w.stress}%`, marginTop: `${100 - w.stress}%` }} />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-4 text-[#d0688b]" />
          <span className="font-cn-serif text-[14px] font-semibold">护 · 坐席守护</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">双向共情的另一半：服务者也需要被照顾。压力指数随每一轮消费者的负面情绪累加，正面情绪和休息会让它回落。</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "今日接待", v: w.sessionsToday },
            { k: "高压会话", v: w.hardSessions },
            { k: "距上次休息", v: `${w.lastBreakMin} 分` },
          ].map((x) => (
            <div key={x.k} className="rounded-lg bg-muted py-1.5">
              <div className="text-[13px] font-semibold tabular">{x.v}</div>
              <div className="text-[10px] text-muted-foreground">{x.k}</div>
            </div>
          ))}
        </div>
        {breakEndsAt ? (
          <button onClick={endBreak} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12px]">
            提前结束静音时刻
          </button>
        ) : (
          <button
            onClick={() => {
              startBreak()
              toast.success(`静音时刻开始，${BREAK_MINUTES} 分钟`, { description: "演示环境中只是一个倒计时，不会真的改变会话分配", icon: <Coffee className="size-4" /> })
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink py-1.5 text-[12px] text-white"
          >
            <Coffee className="size-3.5" />
            休息 {BREAK_MINUTES} 分钟
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

const SAMPLES = [
  "我买的面霜用了两次脸上起了好多小疙瘩，痒得不行，你们说怎么办吧",
  "呵呵，又是这套话术，你们客服是不是都是机器人",
  "我妈过生日想送她一套抗老的，她皮肤比较干，有什么推荐吗",
  "快递显示签收了但我根本没收到！！里面是我准备送人的礼物",
  "上次那个顾问说给我留的赠品到现在都没寄，算了，我也懒得说了",
]

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error("只支持 PNG、JPEG、WebP 和 GIF 图片"))
    if (file.size > 5 * 1024 * 1024) return reject(new Error("图片不能超过 5MB"))
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error("读取图片失败"))
    r.readAsDataURL(file)
  })
}

/** Drives the rehearsed demo, and hosts free mode where anyone can type as a consumer. */
export function DirectorBar() {
  const scenario = useConsole((s) => s.scenario)
  const cursor = useConsole((s) => s.cursor)
  const analyzing = useConsole((s) => s.analyzing)
  const playNext = useConsole((s) => s.playNext)
  const sendAgent = useConsole((s) => s.sendAgent)
  const load = useConsole((s) => s.loadScenario)
  const pushConsumer = useConsole((s) => s.pushConsumer)
  const composer = useConsole((s) => s.composer)
  const autoplay = useConsole((s) => s.autoplay)
  const setAutoplay = useConsole((s) => s.setAutoplay)
  const huddleOpen = useConsole((s) => s.huddleOpen)
  const setHuddleOpen = useConsole((s) => s.setHuddleOpen)
  const huddleCase = useConsole(activeCase)
  const huddleHeld = useConsole((s) => Boolean(huddleCase && s.huddles[huddleCase.id]))
  const draft = useConsole(recommendedDraft)
  const prefer = useConsole((s) => s.prefer)
  const setPrefer = useConsole((s) => s.setPrefer)
  const serverMode = useConsole((s) => s.serverMode)
  const [mode, setMode] = useState<"script" | "free">("script")
  const [free, setFree] = useState("")
  const [image, setImage] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const step = scenario.script[cursor]
  const finished = cursor >= scenario.script.length

  const advance = () => {
    if (step?.role === "agent" && composer) return void sendAgent()
    if (step?.role === "huddle" && huddleHeld) return setHuddleOpen(false)
    void playNext()
  }

  // autoplay: consumer line → analysis → adopt draft → send → … the huddle step waits for its resolution
  // a reply the send gate held back stops autoplay: a person has to look at it
  const gateHeld = useConsole((s) => Boolean(s.gate && s.gate.text === s.composer.trim()))
  useEffect(() => {
    if (gateHeld && autoplay) {
      setAutoplay(false)
      return
    }
    if (!autoplay || analyzing) return
    if (finished) return setAutoplay(false)
    if (step?.role === "huddle" && huddleOpen && !huddleHeld) return
    const delay = step?.role === "consumer" ? 1400 : step?.role === "huddle" ? (huddleHeld ? 2600 : 1200) : composer ? 2200 : 2800
    const t = setTimeout(advance, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, analyzing, finished, step, composer, huddleOpen, huddleHeld, gateHeld])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || el?.isContentEditable || mode !== "script") return
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault()
        if (!analyzing && !finished) advance()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const label = finished
    ? "演示结束"
    : step.role === "consumer"
      ? "播放消费者下一句"
      : step.role === "huddle"
        ? huddleHeld
          ? "会诊结束，继续对话"
          : "召集跨部门会诊"
        : composer
          ? "发送这条回复"
          : draft
            ? "采用推荐草稿"
            : "等待分析结果"
  const Icon = finished ? Sparkles : step.role === "consumer" ? Zap : step.role === "huddle" ? Users : composer ? FastForward : Sparkles

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1 rounded-xl bg-muted p-0.5 text-[11.5px]" role="tablist">
        <button role="tab" aria-selected={mode === "script"} onClick={() => setMode("script")} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1", mode === "script" && "bg-white shadow-[var(--shadow-soft)]")}>
          <Play className="size-3" />
          剧本演示
        </button>
        <button
          role="tab"
          aria-selected={mode === "free"}
          onClick={() => {
            setMode("free")
            setAutoplay(false)
          }}
          className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1", mode === "free" && "bg-white shadow-[var(--shadow-soft)]")}
        >
          <Keyboard className="size-3" />
          自由模式
        </button>
      </div>

      {mode === "script" ? (
        <>
          <select value={scenario.id} onChange={(e) => load(e.target.value)} aria-label="选择演示场景" className="h-8 rounded-lg border border-line bg-white px-2 text-[12px] outline-none">
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1" aria-label={`第 ${Math.min(cursor + 1, scenario.script.length)} / ${scenario.script.length} 步`}>
            {scenario.script.map((s, i) => (
              <span key={s.id} title={{ consumer: "消费者发言", agent: "坐席回复", huddle: "跨部门会诊" }[s.role]} className={cn("h-1.5 rounded-full transition-all", i < cursor ? "w-4 bg-ink" : i === cursor ? "w-6 bg-pearl-animated" : "w-3 bg-line", s.role === "huddle" && i >= cursor && "bg-[#c3b5f4]")} />
            ))}
          </div>
          <button onClick={advance} disabled={analyzing || finished || (step?.role === "agent" && !draft && !composer)} className="flex h-8 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12px] font-medium text-white disabled:opacity-40">
            <Icon className="size-3.5" />
            {label}
          </button>
          <button onClick={() => setAutoplay(!autoplay)} disabled={finished} aria-pressed={autoplay} className={cn("flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[11.5px] disabled:opacity-40", autoplay ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:bg-muted")}>
            {autoplay ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {autoplay ? "暂停" : "自动演示"}
          </button>
          <button onClick={() => load(scenario.id)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="重新开始这个场景" aria-label="重新开始">
            <RotateCcw className="size-3.5" />
          </button>
          {serverMode === "llm" && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="勾选时，剧本里的消费者发言也交给大模型实时分析">
              <input type="checkbox" checked={prefer === "auto"} onChange={(e) => setPrefer(e.target.checked ? "auto" : "script")} className="accent-[#16151c]" />
              剧本也用大模型分析
            </label>
          )}
        </>
      ) : (
        <form
          className="flex min-w-[320px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!free.trim() || analyzing) return
            void pushConsumer(free.trim(), image ? [image] : undefined)
            setFree("")
            setImage(null)
          }}
        >
          <input value={free} onChange={(e) => setFree(e.target.value)} aria-label="以消费者身份输入" placeholder="以消费者的身份输入一句话，看九个智能体如何分析…" className="h-8 flex-1 rounded-lg border border-line bg-white px-3 text-[12.5px] outline-none focus:border-[#c3b5f4]" />
          {image ? (
            <span className="flex h-8 items-center gap-1 rounded-lg bg-muted pr-1 pl-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="size-6 rounded object-cover" />
              <button type="button" onClick={() => setImage(null)} aria-label="移除图片" className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white">
                <X className="size-3" />
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title={serverMode === "llm" ? "附加一张图片（由视觉模型识别）" : "附加一张图片（未配置视觉模型时不会被识别）"} aria-label="附加图片">
              <ImagePlus className="size-3.5" />
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (!f) return
              try {
                setImage({ id: `up-${Date.now()}`, kind: "image", url: await readImage(f), caption: f.name })
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          />
          <button type="button" onClick={() => setFree(SAMPLES[(SAMPLES.indexOf(free) + 1) % SAMPLES.length])} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="换一个示例" aria-label="换一个示例">
            <Shuffle className="size-3.5" />
          </button>
          <button disabled={analyzing || !free.trim()} className="h-8 rounded-xl bg-ink px-3.5 text-[12px] font-medium text-white disabled:opacity-40">
            以消费者身份发送
          </button>
        </form>
      )}

      <div className="ml-auto flex items-center gap-3">
        <DemoControls />
        <EmotionJourney />
        <GuardianCard />
      </div>
    </div>
  )
}
