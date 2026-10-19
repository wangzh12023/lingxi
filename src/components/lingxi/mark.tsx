"use client"

import { cn } from "@/lib/utils"
import { motion } from "motion/react"
import { useId } from "react"

/**
 * 灵犀 mark — two arcs (consumer & agent) meeting at a single luminous point:
 * “心有灵犀一点通”. The point pulses while the system is thinking.
 */
export function LingxiMark({ className, thinking = false, size = 28 }: { className?: string; thinking?: boolean; size?: number }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={cn("shrink-0", className)} aria-label="灵犀">
      <defs>
        <linearGradient id={`g-${id}`} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d76a95" />
          <stop offset="0.38" stopColor="#8a72e0" />
          <stop offset="0.7" stopColor="#4c9ad8" />
          <stop offset="1" stopColor="#2fb391" />
        </linearGradient>
        <radialGradient id={`p-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#fff" />
          <stop offset="0.45" stopColor="#f6eefe" />
          <stop offset="1" stopColor="#c3b5f4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M4 22C6.5 12 12 7 16 16" stroke={`url(#g-${id})`} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M28 10C25.5 20 20 25 16 16" stroke={`url(#g-${id})`} strokeWidth="2.4" strokeLinecap="round" />
      <motion.circle
        cx="16"
        cy="16"
        r="5.5"
        fill={`url(#p-${id})`}
        animate={thinking ? { scale: [1, 1.5, 1], opacity: [0.9, 0.4, 0.9] } : { scale: 1, opacity: 0.9 }}
        transition={thinking ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        style={{ transformOrigin: "16px 16px" }}
      />
      <circle cx="16" cy="16" r="2.1" fill="#16151c" />
    </svg>
  )
}

export function Wordmark({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LingxiMark />
      <div className="leading-none">
        <div className="font-cn-serif text-[17px] font-semibold tracking-[0.18em] text-ink">灵犀</div>
        {sub && <div className="mt-1 font-serif text-[11px] italic tracking-wide text-muted-foreground">Lingxi · Empathy Copilot</div>}
      </div>
    </div>
  )
}
