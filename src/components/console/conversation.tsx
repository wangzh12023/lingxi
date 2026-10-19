"use client"

import { cn } from "@/lib/utils"
import { latestInsight, useConsole } from "@/lib/store"
import { EMOTIONS } from "@/lib/constants"
import { maskAbuse } from "@/lib/engine/heuristics"
import { ChannelMark, EmotionChip, PersonAvatar, RiskBadge, TierBadge } from "@/components/lingxi/primitives"
import { LingxiMark } from "@/components/lingxi/mark"
import type { Attachment, Message, VisionFinding } from "@/lib/types"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { CheckCheck, EyeOff, Info, PenLine, ScanEye, Shield, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

const SEVERITY = { none: "未见异常", mild: "轻度", moderate: "中度", severe: "重度" } as const

/**
 * An uploaded image as the agent sees it. Until it has been looked at, the whole image is blurred.
 * After analysis, privacy regions are covered by the boxes the vision step returned; if a face is
 * present and there are no boxes to cover it, the image stays blurred.
 */
function GuardedImage({ att, vision, analyzing }: { att: Attachment; vision?: VisionFinding; analyzing: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const covered = Boolean(vision && vision.privacy.length)
  const blurred = !vision || (vision.containsFace && !covered && !revealed)
  return (
    <div className="relative overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={att.url} alt={att.caption ?? "消费者上传的图片"} className={cn("block w-full transition-[filter] duration-500", blurred && "blur-xl")} />
      {vision?.privacy.map((p) => (
        <div key={p.label} className="lx-only absolute flex items-center justify-center rounded-md bg-ink/90 text-[10px] tracking-[0.2em] text-white/80" style={{ left: `${p.box[0] * 100}%`, top: `${p.box[1] * 100}%`, width: `${p.box[2] * 100}%`, height: `${p.box[3] * 100}%` }}>
          已遮盖{p.label}
        </div>
      ))}
      {vision && !blurred && (
        <>
          <motion.div initial={{ top: "-12%" }} animate={{ top: "112%" }} transition={{ duration: 1.4, ease: "easeInOut" }} className="lx-only pointer-events-none absolute right-0 left-0 h-12 bg-gradient-to-b from-transparent via-[#c3b5f4]/60 to-transparent motion-reduce:hidden" />
          {vision.findings
            .filter((f) => f.box)
            .map((f, i) => {
              const [x, y, w, h] = f.box!
              return (
                <motion.div key={f.label} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1 + i * 0.2 }} className="lx-only absolute rounded-md border-[1.5px] border-white shadow-[0_0_0_1px_rgba(138,114,224,0.9)]" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}>
                  <span className="absolute -top-5 left-0 rounded bg-ink/85 px-1.5 py-0.5 text-[9.5px] whitespace-nowrap text-white">{f.label}</span>
                </motion.div>
              )
            })}
        </>
      )}
      {blurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-[11px] text-ink">
          <Shield className="size-4" />
          {analyzing && !vision ? "正在识别图片…" : vision?.source === "none" ? "图片未经识别，已模糊处理" : "可能含有人脸，已模糊处理"}
          {vision && (
            <button onClick={() => setRevealed(true)} className="rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-medium shadow-[var(--shadow-soft)]">
              我需要查看原图
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ConsumerBubble({ m }: { m: Message }) {
  const shield = useConsole((s) => s.shield)
  const insight = useConsole((s) => s.insights[m.id])
  const live = useConsole((s) => (s.analyzing && s.activeInsightId === m.id ? s.partial : undefined))
  const select = useConsole((s) => s.selectInsight)
  const active = useConsole((s) => s.activeInsightId === m.id)
  const [zoom, setZoom] = useState<Attachment | null>(null)
  const { masked, hits } = maskAbuse(m.text)
  const view = insight ?? live
  const vision = view?.vision ?? m.vision

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[82%] items-end gap-2">
      <div className="space-y-1.5">
        {m.attachments?.map((a) => (
          <button key={a.id} onClick={() => setZoom(a)} className="block w-[220px] overflow-hidden rounded-2xl rounded-bl-md bg-white p-1.5 text-left shadow-[var(--shadow-soft)]">
            <GuardedImage att={a} vision={vision} analyzing={Boolean(live)} />
            <div className="flex items-center gap-1 px-1.5 pt-1.5 pb-0.5 text-[10.5px] text-muted-foreground">
              <ScanEye className="size-3 shrink-0" />
              {vision ? (
                vision.source === "none" ? (
                  <span className="text-[#8a5306]">未经识别，请人工查看</span>
                ) : (
                  <span className="lx-only text-ink-soft">
                    望 · {SEVERITY[vision.severity]}
                    {vision.source === "preset" && <span className="ml-1 text-muted-foreground">（演示图片的预置结果）</span>}
                  </span>
                )
              ) : (
                "等待识别…"
              )}
            </div>
          </button>
        ))}
        <button onClick={() => insight && select(m.id)} aria-pressed={active} className={cn("relative block rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed text-ink shadow-[var(--shadow-soft)] transition-shadow", active && insight && "ring-1 ring-[#c3b5f4]")}>
          {shield ? masked : m.text}
          {shield && hits.length > 0 && (
            <span className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-soft">
              <EyeOff className="size-3" /> 护 · 已遮盖 {hits.length} 处攻击性词汇
            </span>
          )}
        </button>
        {view?.emotion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lx-only flex flex-wrap items-center gap-1.5 pl-1">
            <EmotionChip emotion={view.emotion.dominant} intensity={view.emotion.intensity} />
            {view.risk && <RiskBadge level={view.risk.level} compact />}
            {view.unspoken?.[0] && <span className="line-clamp-1 max-w-[280px] text-[10.5px] text-muted-foreground">潜台词：{view.unspoken[0].underlying}</span>}
          </motion.div>
        )}
      </div>
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-lg p-3">
          <DialogTitle className="px-1 pt-1 text-[14px]">望 · 图片识别</DialogTitle>
          <DialogDescription className="sr-only">消费者上传的图片与识别结果</DialogDescription>
          {zoom && <GuardedImage att={zoom} vision={vision} analyzing={Boolean(live)} />}
          {vision && (
            <div className="space-y-1 px-1 pt-1 text-[12.5px]">
              <div className="text-ink-soft">{vision.summary}</div>
              <div className="text-[11px] text-muted-foreground">
                {vision.source === "model" ? "由视觉模型识别；只描述可见特征，不做医学判断。" : vision.source === "preset" ? "这是演示图片附带的预置识别结果，不是实时识别。" : "没有经过识别。"}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function AgentBubble({ m }: { m: Message }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ml-auto flex max-w-[78%] flex-col items-end gap-1">
      <div className="rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[13.5px] leading-relaxed text-porcelain shadow-[var(--shadow-lift)]">{m.text}</div>
      <div className="flex items-center gap-1.5 pr-1 text-[10.5px] text-muted-foreground">
        {m.origin === "ai" && (
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-[#8a72e0]" /> 采用草稿
          </span>
        )}
        {m.origin === "ai_edited" && (
          <span className="flex items-center gap-1">
            <PenLine className="size-3 text-[#8a72e0]" /> 草稿，坐席修改后发送
          </span>
        )}
        {m.origin === "manual" && <span>坐席手写</span>}
        <CheckCheck className="size-3" />
      </div>
    </motion.div>
  )
}

export function ConversationPane() {
  const scenario = useConsole((s) => s.scenario)
  const messages = useConsole((s) => s.messages)
  const shield = useConsole((s) => s.shield)
  const setShield = useConsole((s) => s.setShield)
  const analyzing = useConsole((s) => s.analyzing)
  const latest = useConsole(latestInsight)
  const ref = useRef<HTMLDivElement>(null)
  const c = scenario.customer

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, analyzing, latest?.messageId])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white/70 px-5 py-3 backdrop-blur">
        <div className="relative">
          <PersonAvatar seed={c.avatarSeed} name={c.name} size={38} />
          <ChannelMark channel={scenario.channel} className="absolute -right-1 -bottom-1 ring-2 ring-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold">{c.name}</span>
            <TierBadge tier={c.tier} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{c.id}</span>
          </div>
          <div className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
            {c.skinType} · {c.orders} 单 · 累计 ¥{c.ltv.toLocaleString()} · 偏好：{c.preferredTone}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {latest && (
            <div className="lx-only hidden shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] whitespace-nowrap xl:flex" title="情绪效价：−1 最负面，+1 最正面">
              <span className="size-1.5 rounded-full" style={{ background: EMOTIONS[latest.emotion.dominant].color }} />
              <span className="font-medium text-ink">{EMOTIONS[latest.emotion.dominant].cn}</span>
              <span className="text-muted-foreground">· 效价</span>
              <span className="tabular">
                {latest.emotion.valence > 0 ? "+" : ""}
                {latest.emotion.valence.toFixed(2)}
              </span>
            </div>
          )}
          <button onClick={() => setShield(!shield)} aria-pressed={shield} className={cn("lx-only flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] whitespace-nowrap transition", shield ? "bg-[#f0eaf8] text-ink" : "bg-muted text-muted-foreground")} title="护 · 遮盖消费者消息中的攻击性词汇">
            <EyeOff className="size-3" />
            情绪护盾{shield ? "已开" : "已关"}
          </button>
        </div>
      </div>

      <div ref={ref} className="scrollbar-thin bg-dot-grid min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.map((m) => {
          if (m.role === "system")
            return (
              <div key={m.id} className="flex justify-center">
                <span className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] text-muted-foreground shadow-[var(--shadow-soft)]">
                  <Info className="size-3" />
                  {m.text}
                </span>
              </div>
            )
          if (m.role === "consumer") return <ConsumerBubble key={m.id} m={m} />
          return <AgentBubble key={m.id} m={m} />
        })}
        <AnimatePresence>
          {analyzing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 pl-1 text-[11.5px] text-muted-foreground">
              <LingxiMark size={18} thinking />
              灵犀正在分析这句话…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
