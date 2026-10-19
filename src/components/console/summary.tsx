"use client"

import { activeCase, useConsole } from "@/lib/store"
import { EMOTIONS, RISK_LEVELS } from "@/lib/constants"
import { ClipboardCheck, Copy } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

/**
 * Service summary for the ticket, compiled from this session only: turns, how replies were written,
 * the emotion at the start and the end, open risks, the huddle decision and the commitments made.
 * It records what happened in the conversation — it does not claim an outcome that did not happen.
 */
export function ServiceSummary() {
  const scenario = useConsole((s) => s.scenario)
  const messages = useConsole((s) => s.messages)
  const insights = useConsole((s) => s.insights)
  const huddles = useConsole((s) => s.huddles)
  const huddleCase = useConsole(activeCase)

  const summary = useMemo(() => {
    const all = Object.values(insights)
    const first = all[0]
    const last = all.at(-1)
    const agentMsgs = messages.filter((m) => m.role === "agent")
    const adopted = agentMsgs.filter((m) => m.origin === "ai").length
    const edited = agentMsgs.filter((m) => m.origin === "ai_edited").length
    const record = huddleCase ? huddles[huddleCase.id] : undefined
    // a commitment is a clause that names a time frame; repeats across replies are kept once
    const clauses = agentMsgs.flatMap((m) => m.text.split(/[，。！？；\n]/)).map((c) => c.trim())
    const timed = clauses.filter((c) => /\d+\s*小时内|今天\s*\d+:\d+\s*前|周末|明天|预计/.test(c) && c.length <= 40)
    const commitments = [...new Set(timed)].sort((a, b) => a.length - b.length).slice(0, 3)
    return { first, last, agentMsgs, adopted, edited, record, commitments }
  }, [insights, messages, huddles, huddleCase])

  const { first, last, agentMsgs, adopted, edited, record, commitments } = summary
  if (!first || !last) return null

  const lines = [
    `客户：${scenario.customer.name}（${scenario.customer.id}）· 消费者发言 ${last.turn} 轮`,
    `情绪：${EMOTIONS[first.emotion.dominant].cn}（效价 ${first.emotion.valence}）→ ${EMOTIONS[last.emotion.dominant].cn}（效价 ${last.emotion.valence}）`,
    `风险：最高 L${last.risk.level}（${RISK_LEVELS[last.risk.level].cn}）；未关闭信号 ${last.risk.signals.length} 个：${last.risk.signals.map((s) => s.title).join("、") || "无"}`,
    record ? `会诊：${huddleCase!.id} · ${record.resolution.decision}（共识度 ${Math.round(record.resolution.consensus * 100)}%）` : huddleCase ? `会诊：${huddleCase.id} 已建议，尚未召开` : "会诊：未触发",
    `回复：${agentMsgs.length} 条，其中采用草稿 ${adopted} 条、修改后发送 ${edited} 条、手写 ${agentMsgs.length - adopted - edited} 条`,
    commitments.length ? `承诺事项：${commitments.join("；")}` : "承诺事项：无",
  ]

  return (
    <div className="border-t border-line bg-[#f7f5f1] px-4 py-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-[#2c7a3f]" />
        <span className="font-cn-serif text-[13px] font-semibold">服务小结</span>
        <span className="text-[10.5px] text-muted-foreground">由本次会话的记录生成，可直接写入工单</span>
        <button
          onClick={() => {
            if (!navigator.clipboard) return toast.error("当前浏览器不支持一键复制")
            navigator.clipboard.writeText(lines.join("\n")).then(
              () => toast.success("服务小结已复制"),
              () => toast.error("复制失败，请手动选择文本"),
            )
          }}
          className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-white"
        >
          <Copy className="size-3" />
          复制
        </button>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-[11.5px] leading-relaxed text-ink-soft xl:grid-cols-2">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}
