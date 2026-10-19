"use client"

import { cn } from "@/lib/utils"
import { useConsole } from "@/lib/store"
import { RISK_LEVELS } from "@/lib/constants"
import { DEMO_NOW, daysBetween } from "@/lib/dataset"
import { buildJourney, type JourneyEvent } from "@/lib/engine/journey"
import { useMemo, useState } from "react"
import { ChevronDown, MessageSquareText, Package, Ticket } from "lucide-react"

const KIND = {
  order: { icon: Package, cn: "订单" },
  ticket: { icon: Ticket, cn: "工单" },
  contact: { icon: MessageSquareText, cn: "进线" },
} as const

const TONE: Record<JourneyEvent["tone"], string> = { neutral: "#b9b5ad", good: "#2c7a3f", warn: "#c27410", bad: "#d03b3b" }

const when = (at: string) => {
  const d = daysBetween(at, DEMO_NOW)
  return d < 1 ? `今天 ${at.slice(11)}` : d < 2 ? "昨天" : `${Math.floor(d)} 天前`
}

/**
 * 忆 · 服务轨迹 — orders, after-sales tickets and past contacts on one timeline, available the
 * moment a conversation opens. The facts on top exist only across sources (repeat contact,
 * overdue promise, repeat refunds), which is why an agent switching between systems misses them.
 */
export function JourneyPanel() {
  const customer = useConsole((s) => s.scenario.customer)
  const [all, setAll] = useState(false)
  const j = useMemo(() => buildJourney(customer.id), [customer.id])
  const flagged = j.facts.filter((f) => f.level >= 1)
  const info = j.facts.filter((f) => f.level === 0)
  const shown = all ? j.events : j.events.slice(0, 4)
  const o = j.currentOrder

  return (
    <section className="rounded-2xl border border-line bg-white p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h3 className="font-cn-serif text-[13px] font-semibold">忆 · 服务轨迹</h3>
          <span className="font-serif text-[11px] text-muted-foreground italic">Journey</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular">
          订单 {j.counts.orders} · 工单 {j.counts.tickets} · 进线 {j.counts.contacts}
        </span>
      </div>

      {o && (
        <div className="mb-2 rounded-xl bg-muted/70 px-2.5 py-2 text-[11.5px] leading-relaxed">
          <span className="text-muted-foreground">最近订单　</span>
          <span className="font-medium text-ink">{o.product}</span>
          <span className="text-muted-foreground">
            {" "}
            · {o.status}
            {o.signedAt ? ` ${Math.floor(daysBetween(o.signedAt, DEMO_NOW))} 天` : ""} · <span className="font-mono text-[10.5px]">{o.id}</span>
          </span>
          <div className="text-[10.5px] text-muted-foreground">订单号已经在这里，不需要再向消费者询问。</div>
        </div>
      )}

      {flagged.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {flagged.map((f) => (
            <li key={f.key + f.label} className="rounded-xl border border-line px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-1 rounded-full" style={{ background: RISK_LEVELS[f.level].color }} />
                <span className="text-[12px] font-medium">{f.label}</span>
                <span className="rounded bg-[#e6ecf6] px-1 py-px text-[9.5px] font-medium text-[#34507e]">跨数据源</span>
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{f.detail}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{f.action}</div>
            </li>
          ))}
        </ul>
      )}
      {!flagged.length && j.events.length > 0 && <p className="mb-2 text-[11px] text-muted-foreground">轨迹里没有发现重复进线、重复退款或逾期的承诺。</p>}
      {info.map((f) => (
        <p key={f.key} className="mb-2 text-[11px] text-ink-soft">
          {f.label}：{f.detail}
        </p>
      ))}

      {j.events.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">这位消费者没有订单、工单或进线记录。</p>
      ) : (
        <ol className="relative space-y-2 pl-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-line">
          {shown.map((e) => {
            const Icon = KIND[e.kind].icon
            return (
              <li key={e.kind + e.ref} className="relative">
                <span className="absolute top-1.5 -left-4 size-[11px] rounded-full border-2 border-white" style={{ background: TONE[e.tone] }} />
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <Icon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-1 font-medium text-ink">{e.title}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular">{when(e.at)}</span>
                </div>
                <div className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{e.detail}</div>
              </li>
            )
          })}
        </ol>
      )}
      {j.events.length > 4 && (
        <button onClick={() => setAll(!all)} aria-expanded={all} className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-ink">
          <ChevronDown className={cn("size-3 transition", all && "rotate-180")} />
          {all ? "收起" : `展开全部 ${j.events.length} 条`}
        </button>
      )}
    </section>
  )
}
