"use client"

import { cn } from "@/lib/utils"
import { useRecord } from "@/lib/record-store"
import { useConsole } from "@/lib/store"
import { STAFF, STAFF_MAP } from "@/lib/staff"
import { TASK_STATUS_CN, isCommitted, isTaskOverdue, type Task } from "@/lib/tasks"
import { canApprove } from "@/lib/policy"
import { fmtDemo } from "@/lib/clock"
import type { Insight, NextBestAction } from "@/lib/types"
import { RISK_LEVELS } from "@/lib/constants"
import { useEffect, useState } from "react"
import { AlertTriangle, BadgeCheck, CircleCheck, ClipboardList, Clock3, FileCheck2, Hourglass, RotateCcw, Send, ShieldAlert, UserRound, XCircle } from "lucide-react"
import { toast } from "sonner"

/**
 * The plugin's first card: what an agent needs in the first ten seconds, before any chart.
 *   已知 — what we already have, so it is not asked again
 *   欠消费者 — promises and open problems, with how late they are
 *   最要紧的风险 — the top signal and its evidence
 *   推荐回复 + 主行动 — and the action's real status, from the system of record
 */

const STATUS_TONE: Record<Task["status"], string> = {
  pending_approval: "bg-[#fdf0dc] text-[#8a5306]",
  approved: "bg-[#efe9fb] text-[#5b44b5]",
  rejected: "bg-muted text-muted-foreground",
  submit_failed: "bg-[#fde8e5] text-[#a32626]",
  submitted: "bg-[#e4f4ea] text-[#1f6b3a]",
  executed: "bg-[#e6ecf6] text-[#34507e]",
  reopened: "bg-[#fde8e5] text-[#a32626]",
  closed: "bg-[#e4f4ea] text-[#1f6b3a]",
  cancelled: "bg-muted text-muted-foreground",
}

export function TaskChip({ t, now }: { t: Task; now?: string }) {
  const late = now ? isTaskOverdue(t, new Date(now)) : false
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium", late ? "bg-[#a32626] text-white" : STATUS_TONE[t.status])}>
      {late ? "已逾期" : TASK_STATUS_CN[t.status]}
      {t.ticketId && <span className="font-mono">· {t.ticketId}</span>}
    </span>
  )
}

/** Who is at the console. Approvals and corrections are checked against this person's rank on the server. */
export function ActorSwitch({ compact }: { compact?: boolean }) {
  const actorId = useRecord((s) => s.actorId)
  const setActor = useRecord((s) => s.setActor)
  useEffect(() => {
    void useRecord.persist.rehydrate()
  }, [])
  const me = STAFF_MAP[actorId] ?? STAFF[0]
  return (
    <label className={cn("flex items-center gap-1.5 rounded-lg border border-line bg-white text-[11px]", compact ? "h-7 px-1.5" : "h-8 px-2")} title="当前操作人：审批与纠正按此人的权限在服务端核验">
      <UserRound className="size-3.5 text-muted-foreground" />
      <select value={me.id} onChange={(e) => setActor(e.target.value)} aria-label="切换当前操作人" className="bg-transparent outline-none">
        {STAFF.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function ActionControls({ a, task, customerId }: { a: NextBestAction; task?: Task; customerId: string }) {
  const propose = useRecord((s) => s.propose)
  const move = useRecord((s) => s.move)
  const actorId = useRecord((s) => s.actorId)
  const busyMap = useRecord((s) => s.busy)
  const sessionId = useConsole((s) => s.scenario.id)
  const [note, setNote] = useState("")
  const me = STAFF_MAP[actorId]
  const busy = task ? busyMap[task.id] : busyMap[JSON.stringify(a)]
  const run = async (p: Promise<{ error?: string; task?: Task }>, ok: (t: Task) => string) => {
    const r = await p
    if (r.error) toast.error(r.error)
    else if (r.task) toast.success(ok(r.task))
  }
  if (a.policy?.blocked) return <div className="text-[10.5px] text-[#a32626]">{a.policy.blocked}</div>
  if (!task)
    return (
      <button
        disabled={busy}
        onClick={() => run(propose(customerId, a, sessionId), (t) => (t.status === "pending_approval" ? `已提交${t.approver}审批：${t.title}` : t.ticketId ? `已生成模拟工单 ${t.ticketId}` : `已建立任务 ${t.id}`))}
        className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white disabled:opacity-50"
      >
        <Send className="size-3" />
        {a.approver ? `提交${a.approver}审批` : "建立任务"}
      </button>
    )
  if (task.status === "pending_approval") {
    const allowed = me && task.approver && canApprove(me.rank, task.approver)
    return allowed ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <button disabled={busy} onClick={() => run(move(customerId, task.id, "approve", note || undefined), (t) => (t.ticketId ? `已批准并生成模拟工单 ${t.ticketId}` : `已批准；工单提交失败：${t.lastError}`))} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white disabled:opacity-50">
          <BadgeCheck className="size-3" />
          批准
        </button>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="驳回原因 / 批注" className="h-7 w-28 rounded-lg border border-line bg-white px-2 text-[11px] outline-none" />
        <button disabled={busy} onClick={() => (note.trim() ? run(move(customerId, task.id, "reject", note), () => "已驳回，不会执行") : toast.error("驳回请写明原因"))} className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-ink-soft disabled:opacity-50">
          <XCircle className="size-3" />
          驳回
        </button>
      </div>
    ) : (
      <div className="text-[10.5px] text-muted-foreground">
        等待{task.approver}审批。切换到{task.approver}身份（右上角操作人）即可审批。
      </div>
    )
  }
  if (task.status === "approved" || task.status === "submit_failed" || task.status === "reopened")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {task.lastError && <span className="text-[10.5px] text-[#a32626]">{task.lastError}</span>}
        <button disabled={busy} onClick={() => run(move(customerId, task.id, "submit"), (t) => (t.ticketId ? `已生成模拟工单 ${t.ticketId}` : `提交仍失败：${t.lastError}`))} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white disabled:opacity-50">
          <RotateCcw className="size-3" />
          {task.status === "approved" ? "提交工单" : "重新提交"}
        </button>
      </div>
    )
  if (task.status === "submitted")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="执行结果，如：顺丰 SF… 已揽收" className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-[11px] outline-none" />
        <button disabled={busy} onClick={() => (note.trim() ? run(move(customerId, task.id, "record_result", note), () => "已登记执行结果，待回访") : toast.error("请写明执行结果"))} className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-ink-soft disabled:opacity-50">
          <FileCheck2 className="size-3" />
          登记结果
        </button>
      </div>
    )
  if (task.status === "executed")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="回访记录" className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-[11px] outline-none" />
        <button disabled={busy} onClick={() => run(move(customerId, task.id, "verify", note || "消费者确认"), () => "回访确认，已闭环")} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white disabled:opacity-50">
          <CircleCheck className="size-3" />
          回访确认
        </button>
        <button disabled={busy} onClick={() => (note.trim() ? run(move(customerId, task.id, "reopen", note), () => "已重新打开") : toast.error("重新打开请写明原因"))} className="h-7 rounded-lg border border-line px-2 text-[11px] text-ink-soft disabled:opacity-50">
          未解决，重新打开
        </button>
      </div>
    )
  if (task.status === "closed")
    return (
      <button disabled={busy} onClick={() => (note.trim() ? run(move(customerId, task.id, "reopen", note), () => "已重新打开") : toast.error("重新打开请写明原因"))} className="flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-ink">
        <input value={note} onChange={(e) => setNote(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="有新问题？写明原因" className="h-6 w-36 rounded border border-line bg-white px-1.5 text-[10.5px] outline-none" />
        重新打开
      </button>
    )
  return null
}

/** One proposed action, with its live status from the system of record. */
export function ActionItem({ a, customerId, tasks, now }: { a: NextBestAction; customerId: string; tasks: Task[]; now?: string }) {
  const task = tasks.find((t) => t.title === a.title && (a.resolves ? t.resolves === a.resolves : true) && !["cancelled"].includes(t.status))
  return (
    <div className={cn("rounded-xl px-2.5 py-2", a.primary ? "bg-[#f3f0fc]" : "border border-line")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-medium text-ink">{a.title}</span>
        {a.primary && <span className="rounded bg-ink px-1 py-px text-[9px] text-white">首选</span>}
        {task ? <TaskChip t={task} now={now} /> : a.approver ? <span className="rounded border border-line px-1 py-px text-[9.5px] text-muted-foreground">需{a.approver}审批</span> : null}
        {a.cost !== undefined && !Number.isNaN(a.cost) && <span className="ml-auto text-[11px] tabular text-ink">¥{a.cost}</span>}
      </div>
      <div className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
        {a.detail}
        {a.policy?.basis && <span className="text-ink-soft"> · {a.policy.basis}</span>}
      </div>
      {a.commitment && (
        <div className="mt-1 text-[10.5px] text-ink-soft">
          对消费者的承诺：<b className="font-medium">{a.commitment}</b>
          {task && isCommitted(task) ? (
            <span className="text-[#1f6b3a]"> · 已有工单，可以告知</span>
          ) : (
            <span className="text-[#8a5306]"> · 提交工单之前不能说“已安排”</span>
          )}
        </div>
      )}
      <div className="mt-1.5">
        <ActionControls a={a} task={task} customerId={customerId} />
      </div>
    </div>
  )
}

/** The first card of the plugin. */
export function CaseCard({ ins }: { ins: Partial<Insight> }) {
  const scenario = useConsole((s) => s.scenario)
  const adopt = useConsole((s) => s.adoptDraft)
  const customerId = scenario.customer.id
  const data = useRecord((s) => s.byCustomer[customerId])
  const refresh = useRecord((s) => s.refresh)
  useEffect(() => {
    void refresh(customerId)
  }, [customerId, refresh])

  const pack = ins.pack
  const tasks = data?.tasks ?? []
  const top = ins.risk?.signals[0]
  const rec = ins.drafts?.find((d) => d.style === ins.recommended?.style)
  const main = ins.actions?.find((a) => a.primary)
  const owed = pack?.unresolved ?? []
  const lateTasks = tasks.filter((t) => data?.now && isTaskOverdue(t, new Date(data.now)))

  return (
    <section className="rounded-2xl border border-line bg-white p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <h3 className="font-cn-serif text-[13.5px] font-semibold text-ink">这位消费者</h3>
          <span className="text-[10px] text-muted-foreground">已知 · 尚未兑现 · 最要紧的事</span>
        </div>
        {data?.now && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular" title="演示时钟：服务数据的“现在”，可在顶部推进">
            <Clock3 className="size-3" />
            {fmtDemo(data.now)}
          </span>
        )}
      </div>

      {lateTasks.length > 0 && (
        <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-[#a32626] px-2.5 py-1.5 text-[11px] text-white">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            到期未兑现：{lateTasks.map((t) => `${t.title}（${t.ticketId ?? t.id}，期限 ${t.dueAt ? fmtDemo(t.dueAt) : "—"}）`).join("；")}。请主动联系消费者说明情况，不要等对方再来问。
          </span>
        </div>
      )}

      {owed.length > 0 && (
        <div className="mb-2 space-y-1">
          {owed.map((u) => (
            <div key={u.ref} className="flex items-start gap-1.5 rounded-lg bg-[#fdf3f1] px-2.5 py-1.5 text-[11.5px]">
              <Hourglass className="mt-0.5 size-3.5 shrink-0 text-[#a32626]" />
              <span className="text-ink">
                欠消费者：{u.text}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{u.ref}</span>
              </span>
            </div>
          ))}
          {pack?.commitments
            .filter((c) => c.times > 1 && c.status !== "kept")
            .map((c) => (
              <div key={c.ref} className="pl-6 text-[10.5px] text-muted-foreground">
                同一件事答应过 {c.times} 次，最近一次的期限 {fmtDemo(c.dueAt)} 也已过。
              </div>
            ))}
        </div>
      )}

      {pack && pack.known.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <ClipboardList className="size-3" />
            已知，不用再问
          </div>
          <div className="flex flex-wrap gap-1">
            {pack.known.map((k) => (
              <span key={k.label} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-ink-soft" title={`来源 ${k.ref}`}>
                {k.label}：{k.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {top && (
        <div className="mb-2 rounded-lg border border-line px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <ShieldAlert className="size-3.5" style={{ color: RISK_LEVELS[top.level].color }} />
            <span className="font-medium text-ink">最要紧：{top.title}</span>
            <span className="rounded px-1 text-[10px] font-medium" style={{ background: RISK_LEVELS[top.level].soft, color: RISK_LEVELS[top.level].ink }}>
              L{top.level}
            </span>
            {top.unverified && <span className="rounded bg-[#fdf0dc] px-1 text-[9.5px] text-[#8a5306]">待核实</span>}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[10.5px] text-muted-foreground">证据：{(top.evidenceList ?? [top.evidence]).join("；")}</div>
        </div>
      )}

      {ins.corrections && ins.corrections.length > 0 && (
        <div className="mb-2 rounded-lg bg-muted px-2.5 py-1.5 text-[10.5px] text-ink-soft">
          已按人工纠正排除：{ins.corrections.map((c) => `${c.title}（${c.by}：${c.reason}）`).join("；")}
        </div>
      )}

      {rec && (
        <div className="mb-2 rounded-lg bg-porcelain px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            推荐回复 · {rec.issues.some((i) => i.severity === "block") ? <span className="text-[#a32626]">有需要修改的说法</span> : <span>规则未发现问题</span>}
            {rec.claims && rec.claims.some((c) => c.supported && c.by) && <span>· 引用 {[...new Set(rec.claims.filter((c) => c.by).map((c) => c.by))].join("、")}</span>}
          </div>
          <p className="text-[12px] leading-[1.7] text-ink">{rec.text}</p>
          <button onClick={() => adopt(rec.text)} className="mt-1.5 h-7 rounded-lg bg-ink px-2.5 text-[11px] font-medium text-white">
            采用并编辑
          </button>
        </div>
      )}

      {main && <ActionItem a={main} customerId={customerId} tasks={tasks} now={data?.now} />}
    </section>
  )
}
