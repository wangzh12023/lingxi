"use client"

import { cn } from "@/lib/utils"
import { SCENARIOS } from "@/lib/scenarios"
import { useConsole } from "@/lib/store"
import { analyzeIntent, detectRisk, emotionVector, mergeRisk, summarizeEmotion } from "@/lib/engine/heuristics"
import { buildJourney } from "@/lib/engine/journey"
import { INTENTS } from "@/lib/constants"
import { ChannelMark, EmotionDot, PersonAvatar, RiskBadge, TierBadge } from "@/components/lingxi/primitives"
import type { RiskLevel } from "@/lib/types"
import { motion } from "motion/react"
import { useMemo } from "react"

const TIER_WEIGHT = { 新客: 0.4, 银卡: 0.6, 金卡: 0.8, 黑金: 1 } as const
const SLA_SEC = 60

/**
 * The waiting queue. Each conversation is triaged by the rule track on the consumer's first message
 * (the same rules the pipeline runs), and sorted by a priority that is printed on screen:
 *   priority = 30 × risk level + 20 × negative intensity + 10 × min(wait / SLA, 2) + 10 × tier weight
 */
function useTriage(plugin: boolean) {
  return useMemo(
    () =>
      SCENARIOS.map((s) => {
        const first = s.script.find((x) => x.role === "consumer")
        const text = first && first.role === "consumer" ? first.text : ""
        const emotion = summarizeEmotion(emotionVector(text))
        const facts = buildJourney(s.customer.id).facts.filter((f) => f.level >= 1)
        const risk = mergeRisk([], [...detectRisk(text, { customer: s.customer, valence: emotion.valence, batchCodes: [] }), ...facts.map((f) => ({ category: f.category, level: f.level, title: f.label, evidence: f.detail, origin: "data" as const }))], 1)
        const negative = emotion.valence < 0 ? emotion.intensity : 0
        const priority = Math.round(30 * risk.level + 20 * negative + 10 * Math.min(s.waitingSec / SLA_SEC, 2) + 10 * TIER_WEIGHT[s.customer.tier])
        return { s, text, emotion, level: risk.level as RiskLevel, intent: analyzeIntent(text).primary, priority, flag: facts[0]?.label }
      }).sort((a, b) => (plugin ? b.priority - a.priority : b.s.waitingSec - a.s.waitingSec)),
    [plugin],
  )
}

export function ConsoleQueue() {
  const active = useConsole((s) => s.scenario.id)
  const load = useConsole((s) => s.loadScenario)
  const busy = useConsole((s) => s.analyzing)
  const plugin = useConsole((s) => s.pluginOn)
  const queue = useTriage(plugin)
  const high = queue.filter((q) => q.level >= 3).length
  const overdue = queue.filter((q) => q.s.waitingSec > SLA_SEC).length

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="font-cn-serif text-[15px] font-semibold">会话队列</div>
        <div className="lx-only mt-0.5 text-[11px] leading-relaxed text-muted-foreground">按优先级排序：风险等级、负面情绪、等待时长与会员等级加权</div>
        <div className="lx-off mt-0.5 text-[11px] leading-relaxed text-muted-foreground">现有工作台：按进线顺序接待</div>
        <div className={cn("mt-3 grid gap-1.5 text-center", plugin ? "grid-cols-3" : "grid-cols-2")}>
          {[
            { k: "排队", v: queue.length },
            ...(plugin ? [{ k: "L3 及以上", v: high }] : []),
            { k: `超过 ${SLA_SEC} 秒`, v: overdue },
          ].map((x) => (
            <div key={x.k} className="rounded-lg bg-white py-1.5 shadow-[var(--shadow-soft)]">
              <div className="text-[14px] font-semibold tabular">{x.v}</div>
              <div className="text-[10px] text-muted-foreground">{x.k}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {queue.map(({ s, text, emotion, level, intent, priority, flag }, i) => {
          const isActive = s.id === active
          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => !isActive && load(s.id)}
              disabled={busy && !isActive}
              aria-current={isActive}
              className={cn("group relative w-full rounded-xl px-3 py-2.5 text-left transition-all disabled:opacity-60", isActive ? "bg-white shadow-[var(--shadow-lift)]" : "hover:bg-white/70")}
            >
              {isActive && <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-pearl-animated" />}
              <div className="flex items-start gap-2.5">
                <div className="relative">
                  <PersonAvatar seed={s.customer.avatarSeed} name={s.customer.name} size={34} />
                  <ChannelMark channel={s.channel} className="absolute -right-1 -bottom-1 ring-2 ring-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium">{s.customer.name}</span>
                    <TierBadge tier={s.customer.tier} />
                    <span className="ml-auto text-[10px] text-muted-foreground tabular">{s.waitingSec} 秒</span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">{text}</div>
                  <div className="lx-only mt-1.5 flex items-center gap-1.5">
                    <EmotionDot emotion={emotion.dominant} pulse={level >= 3} />
                    <RiskBadge level={level} compact />
                    <span className="line-clamp-1 text-[10px] text-muted-foreground">{flag ?? INTENTS[intent].cn}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular" title="优先级分数">
                      {priority}
                    </span>
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
      <p className="lx-only border-t border-line px-4 py-2.5 text-[10.5px] leading-relaxed text-muted-foreground">排队时已经用规则初筛首句话，并查过订单、工单与进线记录；接入会话后才运行完整分析。</p>
    </div>
  )
}
