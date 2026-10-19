"use client"

import { useRecord } from "@/lib/record-store"
import { useConsole } from "@/lib/store"
import { ActorSwitch } from "./case-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useEffect, useRef } from "react"
import { FastForward, SlidersHorizontal, TriangleAlert, Trash2 } from "lucide-react"
import { toast } from "sonner"

/**
 * Operator controls for the demonstration, labelled as such: who is at the console, and three
 * switches a presenter needs — move the demo clock forward to show a deadline passing, make the next
 * ticket submission fail once, and start the record over.
 *
 * After every write to the record the latest turn is analysed again, so what the panel says (a draft
 * that may now name a ticket, a promise now overdue) always matches the record.
 */
export function DemoControls() {
  const demo = useRecord((s) => s.demo)
  const revision = useRecord((s) => s.revision)
  const retry = useConsole((s) => s.retryAnalysis)
  const hasInsight = useConsole((s) => Object.keys(s.insights).length > 0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (hasInsight) retry()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only when the record changes
  }, [revision])

  return (
    <div className="flex items-center gap-1.5">
      <ActorSwitch compact />
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex h-7 items-center gap-1 rounded-lg border border-line bg-white px-2 text-[11px] text-ink-soft hover:bg-muted" aria-label="演示控制">
            <SlidersHorizontal className="size-3.5" />
            演示控制
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="text-[12px] font-semibold">演示控制</div>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">只用于演示。时钟是服务数据的“现在”，不是真实时间；工单系统是模拟的。</p>
          <div className="mt-2 space-y-1.5">
            <button onClick={() => demo("advance", 9).then(() => toast("演示时钟前进 9 小时"))} className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[11.5px] hover:bg-muted">
              <FastForward className="size-3.5" />
              时钟前进 9 小时（看逾期提醒）
            </button>
            <button onClick={() => demo("fail_next_submit").then(() => toast("下一次提交工单会失败一次"))} className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[11.5px] hover:bg-muted">
              <TriangleAlert className="size-3.5" />
              下一次提交工单失败一次
            </button>
            <button onClick={() => demo("reset").then(() => toast("已清空任务、事件和操作日志，时钟回到起点"))} className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[11.5px] text-[#a32626] hover:bg-muted">
              <Trash2 className="size-3.5" />
              重置记录
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
