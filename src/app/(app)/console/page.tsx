"use client"

import { ConsoleQueue } from "@/components/console/queue"
import { ConversationPane } from "@/components/console/conversation"
import { InsightPanel } from "@/components/console/insight-panel"
import { Composer } from "@/components/console/composer"
import { DirectorBar } from "@/components/console/director"
import { ServiceSummary } from "@/components/console/summary"
import { activeCase, useConsole } from "@/lib/store"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { HuddleRoom } from "@/components/lingxi/huddle-room"
import { RISK_LEVELS } from "@/lib/constants"
import { briefFor } from "@/lib/huddle"
import { useEffect } from "react"
import { PanelRightClose, PanelRightOpen, Puzzle } from "lucide-react"
import { RawRecords } from "@/components/console/raw-records"
import { cn } from "@/lib/utils"

/** The one-page brief the duty manager reads first; the simulated roundtable is below it. */
function DecisionBrief({ c }: { c: import("@/lib/types").HuddleCase }) {
  const b = briefFor(c)
  return (
    <div className="mb-3 rounded-xl border border-line bg-white p-3 text-[11.5px] leading-relaxed">
      <div className="mb-1.5 text-[12px] font-semibold text-ink">决策简报</div>
      {b.missing.length > 0 && (
        <div className="mb-1">
          <span className="text-muted-foreground">还缺：</span>
          {b.missing.join("；")}
        </div>
      )}
      {b.tensions.length > 0 && (
        <div className="mb-1">
          <span className="text-muted-foreground">需要权衡：</span>
          {b.tensions.join("；")}
        </div>
      )}
      <div>
        <span className="text-muted-foreground">谁来决定：</span>
        {b.authority}
      </div>
      <div className="mt-1.5 text-[10.5px] text-muted-foreground">下面的圆桌讨论是多角色模拟（一次生成），用来帮助看清各方顾虑，不代表各部门的真实意见。</div>
    </div>
  )
}

export default function ConsolePage() {
  const huddleOpen = useConsole((s) => s.huddleOpen)
  const setHuddleOpen = useConsole((s) => s.setHuddleOpen)
  const setServerMode = useConsole((s) => s.setServerMode)
  const recordHuddle = useConsole((s) => s.recordHuddle)
  const prefer = useConsole((s) => s.prefer)
  const huddleCase = useConsole(activeCase)
  const record = useConsole((s) => (huddleCase ? s.huddles[huddleCase.id] : undefined))
  const finished = useConsole((s) => s.cursor >= s.scenario.script.length && s.messages.some((m) => m.role === "agent"))

  // Lingxi is a plugin on the right of an existing workbench; switching it off shows what agents have today
  const plugin = useConsole((s) => s.pluginOn)
  const setPlugin = useConsole((s) => s.setPlugin)

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setServerMode(h.mode === "llm" ? "llm" : "offline"))
      .catch(() => setServerMode("offline"))
  }, [setServerMode])

  return (
    <div data-plugin={plugin ? "on" : "off"} className="flex h-dvh flex-col">
      <DirectorBar />
      <div className={cn("grid min-h-0 flex-1", plugin ? "grid-cols-[272px_minmax(0,1fr)_440px] 2xl:grid-cols-[296px_minmax(0,1fr)_480px]" : "grid-cols-[272px_minmax(0,1fr)_300px_52px] 2xl:grid-cols-[296px_minmax(0,1fr)_320px_52px]")}>
        <div className="min-h-0 border-r border-line bg-sidebar/60">
          <ConsoleQueue />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <ConversationPane />
          </div>
          {finished && <ServiceSummary />}
          <Composer />
        </div>
        {plugin ? (
          <div className="flex min-h-0 flex-col border-l border-line bg-[#f6f4f0]">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-white/70 px-3.5 text-[11.5px]">
              <Puzzle className="size-3.5 text-[#6a52c9]" />
              <span className="font-medium text-ink">灵犀 · 智能接待辅助插件</span>
              <span className="hidden text-muted-foreground 2xl:inline">嵌在现有客服工作台右侧，不改变坐席原有操作</span>
              <button onClick={() => setPlugin(false)} title="收起插件，查看没有灵犀时的工作台" aria-label="收起插件" className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink">
                <PanelRightClose className="size-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <InsightPanel />
            </div>
          </div>
        ) : (
          <div className="min-h-0 border-l border-line">
            <RawRecords />
          </div>
        )}
        {!plugin && (
          <div className="flex min-h-0 flex-col items-center border-l border-line bg-[#f6f4f0] pt-2">
            <button onClick={() => setPlugin(true)} title="打开灵犀插件" aria-label="打开灵犀插件" className="flex size-9 items-center justify-center rounded-xl bg-ink text-white shadow-[var(--shadow-soft)]">
              <PanelRightOpen className="size-4" />
            </button>
            <span className="mt-3 text-[11px] tracking-[0.3em] text-muted-foreground [writing-mode:vertical-rl]">灵犀插件已收起 · 这是现有工作台</span>
          </div>
        )}
      </div>

      <Sheet open={huddleOpen} onOpenChange={setHuddleOpen}>
        <SheetContent side="right" className="w-[560px] max-w-[92vw] overflow-y-auto bg-porcelain sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-cn-serif text-[20px]">
              议 · 跨部门会诊
              {huddleCase && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: RISK_LEVELS[huddleCase.level].soft, color: RISK_LEVELS[huddleCase.level].ink }}>
                  L{huddleCase.level}
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-[12px] leading-relaxed">{huddleCase?.summary ?? "当前会话没有需要会诊的个案。"}</SheetDescription>
          </SheetHeader>
          {huddleCase && record && (record.caseVersion ?? 1) < (huddleCase.version ?? 1) && (
            <div className="mx-4 mb-3 rounded-xl border border-[#f1dfb8] bg-[#fdf8ec] px-3 py-2 text-[11.5px] leading-relaxed text-[#8a5306]">
              会诊是在第 {record.caseVersion ?? 1} 版材料上召开的，之后又出现了新证据（当前第 {huddleCase.version} 版）。决议需要复核：{(huddleCase.newEvidence ?? []).join("；") || "见下方证据列表"}
            </div>
          )}
          {huddleCase && (
            <div className="px-4 pb-6">
              <DecisionBrief c={huddleCase} />
              <div className="mb-1.5 text-[11px] text-muted-foreground">已知事实（证据）</div>
              <ul className="mb-4 space-y-1 rounded-xl border border-line bg-white p-3">
                {huddleCase.evidence.map((e) => (
                  <li key={e} className="text-[11.5px] leading-relaxed text-ink-soft">
                    {e}
                  </li>
                ))}
              </ul>
              {huddleOpen && <HuddleRoom key={huddleCase.id} huddleCase={huddleCase} compact autoStart record={record} onResolved={recordHuddle} prefer={prefer} />}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
