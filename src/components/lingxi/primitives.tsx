"use client"

import { cn } from "@/lib/utils"
import { CHANNELS, EMOTIONS, EMOTION_ORDER, RISK_LEVELS } from "@/lib/constants"
import type { Channel, CustomerProfile, EmotionKey, EmotionVector, RiskLevel } from "@/lib/types"
import { motion } from "motion/react"

export function EmotionDot({ emotion, className, pulse }: { emotion: EmotionKey; className?: string; pulse?: boolean }) {
  const e = EMOTIONS[emotion]
  return (
    <span className={cn("relative inline-flex size-2", className)} title={e.cn}>
      {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ background: e.color }} />}
      <span className="relative inline-flex size-full rounded-full" style={{ background: e.color }} />
    </span>
  )
}

/** Emotion label: the coloured dot carries identity, the text stays in ink so it is always legible. */
export function EmotionChip({ emotion, intensity, className }: { emotion: EmotionKey; intensity?: number; className?: string }) {
  const e = EMOTIONS[emotion]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink", className)} style={{ background: e.soft }}>
      <span className="size-1.5 rounded-full" style={{ background: e.color }} />
      {e.cn}
      {intensity !== undefined && <span className="text-ink-soft tabular">{Math.round(intensity * 100)}</span>}
    </span>
  )
}

export function RiskBadge({ level, className, compact }: { level: RiskLevel; className?: string; compact?: boolean }) {
  const r = RISK_LEVELS[level]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide", className)} style={{ background: r.soft, color: r.ink }} title={`${r.en} ${r.cn}：${r.desc}`}>
      {level >= 3 && <span className="size-1.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: r.color }} />}
      {r.en}
      {!compact && <span className="font-sans font-medium tracking-normal">{r.cn}</span>}
    </span>
  )
}

/** The emotion vector as one stacked bar, with 2px gaps between segments. */
export function EmotionPrism({ vector, className, height = 10 }: { vector: EmotionVector; className?: string; height?: number }) {
  const total = EMOTION_ORDER.reduce((s, k) => s + vector[k], 0) || 1
  return (
    <div className={cn("flex w-full gap-[2px]", className)} style={{ height }} role="img" aria-label={EMOTION_ORDER.filter((k) => vector[k] > 0.05).map((k) => `${EMOTIONS[k].cn} ${Math.round((vector[k] / total) * 100)}%`).join("，")}>
      {EMOTION_ORDER.map((k) => {
        const w = (vector[k] / total) * 100
        if (w < 1) return null
        return <motion.div key={k} initial={{ flexGrow: 0 }} animate={{ flexGrow: w }} transition={{ type: "spring", stiffness: 120, damping: 22 }} style={{ background: EMOTIONS[k].color, flexBasis: 0 }} className="h-full rounded-[3px]" title={`${EMOTIONS[k].cn} ${Math.round(w)}%`} />
      })}
    </div>
  )
}

/** Radar of the eight emotions — the signature visual of 闻. */
export function EmotionWheel({ vector, size = 168, className }: { vector: EmotionVector; size?: number; className?: string }) {
  const c = size / 2
  const r = size / 2 - 22
  const n = EMOTION_ORDER.length
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const
  }
  const reach = (k: EmotionKey) => 0.12 + 0.88 * Math.min(1, vector[k])
  const poly = EMOTION_ORDER.map((k, i) => pt(i, reach(k)))
    .map(([x, y]) => `${x},${y}`)
    .join(" ")
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={`情绪构成：${EMOTION_ORDER.filter((k) => vector[k] >= 0.1).map((k) => `${EMOTIONS[k].cn} ${Math.round(vector[k] * 100)}`).join("，")}`}>
      <defs>
        <radialGradient id="ew-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c3b5f4" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#d76a95" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      {[0.33, 0.66, 1].map((s) => (
        <polygon key={s} points={EMOTION_ORDER.map((_, i) => pt(i, s)).map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#e9e6e0" strokeWidth={1} />
      ))}
      {EMOTION_ORDER.map((k, i) => {
        const [x, y] = pt(i, 1)
        return <line key={k} x1={c} y1={c} x2={x} y2={y} stroke="#e9e6e0" strokeWidth={1} />
      })}
      <motion.polygon initial={false} animate={{ points: poly }} transition={{ type: "spring", stiffness: 90, damping: 18 }} fill="url(#ew-fill)" stroke="#8a72e0" strokeWidth={1.5} strokeLinejoin="round" />
      {EMOTION_ORDER.map((k, i) => {
        const [x, y] = pt(i, reach(k))
        const [lx, ly] = pt(i, 1.2)
        return (
          <g key={k}>
            <motion.circle initial={false} animate={{ cx: x, cy: y }} r={4} fill={EMOTIONS[k].color} stroke="#fff" strokeWidth={1.5} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#6f6c78" fontSize={9.5}>
              {EMOTIONS[k].cn}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ChannelMark({ channel, className }: { channel: Channel; className?: string }) {
  const ch = CHANNELS[channel]
  return (
    <span className={cn("inline-flex size-4 items-center justify-center rounded-[5px] text-[9px] font-bold text-white", className)} style={{ background: ch.color }} title={ch.cn}>
      {ch.mark}
    </span>
  )
}

const AVATAR_PALETTES = [
  ["#f3b4cb", "#c3b5f4"],
  ["#a9d3f5", "#a8e6d2"],
  ["#f4e3c1", "#f3b4cb"],
  ["#c3b5f4", "#a9d3f5"],
  ["#a8e6d2", "#f4e3c1"],
]

export function PersonAvatar({ seed, name, size = 36, className }: { seed: string; name: string; size?: number; className?: string }) {
  const h = [...seed].reduce((s, ch) => s + ch.charCodeAt(0), 0)
  const [a, b] = AVATAR_PALETTES[h % AVATAR_PALETTES.length]
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-cn-serif font-semibold text-ink/80 ring-2 ring-white", className)} style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.4 }}>
      {name.slice(0, 1)}
    </span>
  )
}

export function TierBadge({ tier }: { tier: CustomerProfile["tier"] }) {
  const map = {
    新客: "bg-muted text-muted-foreground",
    银卡: "bg-[#eef1f5] text-[#4a5466]",
    金卡: "bg-[#faf1d9] text-[#7a5a0c]",
    黑金: "bg-ink text-[#f4e3c1]",
  } as const
  return <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider", map[tier])}>{tier}</span>
}

/** A ratio against a limit. The track is a lighter step of the fill colour. */
export function Meter({ value, color = "#8a72e0", className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full", className)} style={{ background: `${color}26` }}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
    </div>
  )
}
