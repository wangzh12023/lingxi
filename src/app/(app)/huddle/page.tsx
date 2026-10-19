"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { HuddleRoom } from "@/components/lingxi/huddle-room"
import { HUDDLE_ROLE_MAP } from "@/lib/huddle"
import { RISK_LEVELS } from "@/lib/constants"
import type { HuddleCase } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FileText, GitMerge, LoaderCircle, Scale, Timer } from "lucide-react"
import { useEffect, useState } from "react"

/**
 * The roundtable on its own page. The cases are not hand-listed: the server runs each rehearsed
 * scenario through the console pipeline and returns the cases they escalate.
 */
export default function HuddlePage() {
  const [cases, setCases] = useState<HuddleCase[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<string>()

  useEffect(() => {
    fetch("/api/huddle")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { cases: HuddleCase[] }) => {
        setCases(d.cases)
        setActive(d.cases[0]?.id)
      })
      .catch(() => setFailed(true))
  }, [])

  const c = cases?.find((x) => x.id === active)

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="议 · Cross-department Huddle"
        title="会诊圆桌"
        desc="风险达到 L3，并且属于产品安全、舆情、法律、流失或异常索赔这类需要多个部门一起处置的情况时，灵犀按风险归属召集相关部门的角色智能体。每个席位只持有本部门的目标与红线；讨论后形成带责任部门和时限的决议，少数意见写入保留意见。"
      />
      {failed && <div className="mx-8 mb-4 rounded-2xl border border-[#f1c9c9] bg-[#fdf4f3] px-4 py-3 text-[12.5px] text-[#a32626]">没有加载到个案，请确认服务正在运行后刷新页面。</div>}
      {!cases && !failed && (
        <div className="mx-8 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在用控制台同一套流程梳理需要会诊的个案…
        </div>
      )}
      {cases && (
        <>
          <div className="mb-4 flex flex-wrap gap-2 px-8" role="tablist">
            {cases.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === active} onClick={() => setActive(x.id)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition", x.id === active ? "border-ink bg-white shadow-[var(--shadow-lift)]" : "border-line bg-white/60 hover:bg-white")}>
                <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ background: RISK_LEVELS[x.level].soft, color: RISK_LEVELS[x.level].ink }}>
                  L{x.level}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium text-ink">{x.title}</span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    {x.id} · {x.roles.length} 个部门入席
                  </span>
                </span>
              </button>
            ))}
          </div>
          {c && (
            <div className="grid gap-6 px-8 xl:grid-cols-[1fr_340px]">
              <div className="rounded-3xl border border-line bg-white p-6">
                {/* a different case gets a fresh room: state, stream and seats reset */}
                <HuddleRoom key={c.id} huddleCase={c} prefer="auto" />
              </div>
              <aside className="space-y-4">
                <div className="rounded-3xl border border-line bg-white p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="font-cn-serif text-[15px] font-semibold">个案卷宗</span>
                    <span className="ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ background: RISK_LEVELS[c.level].soft, color: RISK_LEVELS[c.level].ink }}>
                      L{c.level} {RISK_LEVELS[c.level].cn}
                    </span>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-[1.8] text-ink-soft">{c.summary}</p>
                  <ul className="mt-3 space-y-1.5">
                    {c.evidence.map((e) => (
                      <li key={e} className="rounded-lg bg-muted px-2.5 py-1.5 text-[11.5px] leading-relaxed">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-3xl border border-line bg-white p-5">
                  <div className="font-cn-serif text-[15px] font-semibold">本次入席</div>
                  <div className="mt-3 space-y-2.5">
                    {(["moderator", ...c.roles] as const).map((id) => {
                      const r = HUDDLE_ROLE_MAP[id]
                      return (
                        <div key={r.id} className="flex items-start gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full font-cn-serif text-[12px] font-semibold text-white" style={{ background: r.color }}>
                            {r.name.slice(0, 1)}
                          </span>
                          <div>
                            <div className="text-[12.5px] font-medium">
                              {r.name} <span className="text-[11px] font-normal text-muted-foreground">{r.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">{r.stance}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="rounded-3xl border border-line bg-white p-5">
                  <div className="font-cn-serif text-[15px] font-semibold">机制设计</div>
                  <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-ink-soft">
                    <div className="flex gap-2.5">
                      <Scale className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
                      <span>
                        <b className="font-semibold text-ink">按风险归属入席</b>：产品安全请质量与研发，舆情请公关与法务，流失请会员运营，异常索赔请风控。与个案无关的部门不占席位。
                      </span>
                    </div>
                    <div className="flex gap-2.5">
                      <GitMerge className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
                      <span>
                        <b className="font-semibold text-ink">共识度可以复算</b>：取各席位最后一次表态的平均值（赞同 1、审慎 0.5、反对 0），不采信任何模型自报的数字。
                      </span>
                    </div>
                    <div className="flex gap-2.5">
                      <Timer className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
                      <span>
                        <b className="font-semibold text-ink">决议可执行</b>：每项行动都写明责任部门和时限。会诊只给出建议，由值班主管确认后执行。
                      </span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}
