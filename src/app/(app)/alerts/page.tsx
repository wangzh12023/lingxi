"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { PersonAvatar, RiskBadge, TierBadge } from "@/components/lingxi/primitives"
import { ActorSwitch } from "@/components/console/case-card"
import { ALERT_ORDER, ALERT_TYPES, STATUS_CN, caseDueAt, overdueAlerts, toCases, type Alert, type AlertCase, type AlertStatus, type AlertType } from "@/lib/alerts"
import { useRecord } from "@/lib/record-store"
import { ALL_CUSTOMERS, CONTACTS, ORDERS, TICKETS } from "@/lib/dataset"
import { fmtDemo, hoursBetween } from "@/lib/clock"
import type { TaskLogEntry } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Ban, CheckCircle2, ChevronDown, CircleDot, FlaskConical, Hand, RotateCcw, Timer } from "lucide-react"
import { toast } from "sonner"

/** Status marks. Open is the darkest so unhandled work is what the eye lands on; closed recedes. */
const STATUS_COLOR: Record<AlertStatus, string> = { open: "#16151c", processing: "#8975ce", closed: "#cfccc6", invalid: "#e8e4dc" }
const STATUSES: AlertStatus[] = ["open", "processing", "closed"]

type BoardAlert = Alert & { eventId?: string }
interface Board {
  now: string
  alerts: BoardAlert[]
  log: TaskLogEntry[]
}

const fmtLeft = (h: number) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} 分钟` : Math.abs(h) < 48 ? `${Math.round(Math.abs(h))} 小时` : `${Math.round(Math.abs(h) / 24)} 天`)
const ACTION_CN: Record<string, string> = { event_claim: "认领", event_close: "闭环", event_reopen: "重新打开", event_invalidate: "标记无效", event_open: "发现（接待工作台）", event_evidence: "新增证据" }
const CATEGORY_OF: Partial<Record<AlertType, string>> = { batch: "safety", adverse: "safety", pr: "pr", repeat_refund: "fraud" }

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[13px] text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  )
}

function CaseRow({ c, board, onChanged }: { c: AlertCase; board: Board; onChanged: () => void }) {
  const eventAction = useRecord((s) => s.eventAction)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [evidence, setEvidence] = useState("")
  const [wrong, setWrong] = useState("")
  const now = new Date(board.now)
  const statusOf = (a: Alert) => a.status
  const late = overdueAlerts(c, statusOf, now)
  const due = caseDueAt(c, statusOf)
  const title = c.customer ? [...new Set(c.alerts.map((a) => ALERT_TYPES[a.type].cn))].join(" + ") : c.alerts[0].title
  const entries = board.log.filter((l) => c.alerts.some((a) => (a as BoardAlert).eventId === l.eventId))
  const customerId = c.customer?.id ?? "*"
  const done = (a: Alert) => a.status === "closed" || a.status === "invalid"
  const pending = c.alerts.filter((a) => !done(a))
  // a correction is about one alert: "her bottle is not from this batch" says nothing about the post going public
  const wrongKey = pending.length === 1 ? pending[0].eventKey : wrong
  const titleOf = (eventId?: string) => c.alerts.find((a) => (a as BoardAlert).eventId === eventId)?.title

  // claim, close and reopen apply to each still-relevant alert of the case, as its own event; a correction to one
  const act = async (action: "claim" | "close" | "reopen" | "invalidate") => {
    const targets = action === "invalidate" ? pending.filter((a) => a.eventKey === wrongKey) : c.alerts.filter((a) => (action === "reopen" ? done(a) : !done(a)))
    if (!targets.length) return toast.error("请先选择要纠正的是哪一条预警")
    for (const a of targets) {
      const r = await eventAction({ customerId, eventKey: a.eventKey, action, title: a.title, category: CATEGORY_OF[a.type] ?? "service", level: a.level, note: note.trim() || undefined, evidence: evidence.trim() || undefined })
      if (r.error) return toast.error(r.error)
    }
    toast.success({ claim: "已认领", close: "已闭环", reopen: "已重新打开", invalidate: "已标记为无效" }[action])
    setNote("")
    setEvidence("")
    setWrong("")
    onChanged()
  }

  return (
    <li className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <div className="w-[72px] shrink-0 pt-0.5">
          <RiskBadge level={c.level} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {c.customer && (
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <PersonAvatar seed={c.customer.id} name={c.customer.name} size={20} />
                {c.customer.name}
                <TierBadge tier={c.customer.tier} />
              </span>
            )}
            <span className={cn("text-[13.5px]", c.customer ? "text-ink-soft" : "font-semibold")}>{title}</span>
            {c.live && <span className="rounded bg-[#efe9fb] px-1.5 py-px text-[10.5px] font-medium text-[#5b44b5]">来自接待工作台</span>}
          </div>
          <ul className="mt-1.5 space-y-1">
            {c.alerts.map((a) => {
              const left = hoursBetween(now, a.dueAt)
              const done = a.status === "closed" || a.status === "invalid"
              return (
                <li key={a.id} className="flex flex-wrap gap-x-2 text-[12px] leading-relaxed">
                  <span className="mt-px h-fit shrink-0 rounded bg-muted px-1.5 py-px text-[10.5px] text-ink-soft">{ALERT_TYPES[a.type].cn}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="text-ink-soft">{a.title}</span>：{a.evidence}
                  </span>
                  <span className={cn("shrink-0 text-[10.5px] tabular", done ? "text-muted-foreground" : left < 0 ? "font-medium text-[#a32626]" : "text-muted-foreground")}>
                    {done ? STATUS_CN[a.status] : left < 0 ? `超时 ${fmtLeft(left)}` : `剩 ${fmtLeft(left)}`} · 时限 {ALERT_TYPES[a.type].slaHours}h
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span>数据来源</span>
            {c.sources.map((s) => (
              <span key={s} className="rounded bg-[#e6ecf6] px-1.5 py-px font-medium text-[#34507e]">
                {s}
              </span>
            ))}
            <span className="ml-1">责任方 {c.owners.join("、")}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium">
            <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[c.status] }} />
            {STATUS_CN[c.status]}
          </span>
          <span className={cn("flex items-center gap-1 text-[11px] tabular", late.length ? "font-medium text-[#a32626]" : "text-muted-foreground")}>
            <Timer className="size-3" />
            {late.length ? `${late.length} 项超时：${late.map((a) => ALERT_TYPES[a.type].cn).join("、")}` : due ? `最早截止 ${fmtDemo(due)}` : "无待办"}
          </span>
          <div className="flex items-center gap-1.5">
            {c.status === "open" && (
              <button onClick={() => act("claim")} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11.5px] font-medium text-white">
                <Hand className="size-3" />
                认领
              </button>
            )}
            {c.status === "processing" && (
              <button onClick={() => setOpen(true)} className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11.5px] font-medium text-white">
                <CheckCircle2 className="size-3" />
                闭环
              </button>
            )}
            {(c.status === "closed" || c.status === "invalid") && (
              <button onClick={() => act("reopen")} className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11.5px] text-ink-soft">
                <RotateCcw className="size-3" />
                重新打开
              </button>
            )}
            <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="查看跟踪记录" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="grid gap-4 border-t border-line px-4 py-3 md:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 text-[11px] text-muted-foreground">跟踪记录（服务端记录，换人、刷新后仍在）</div>
            <ol className="relative space-y-2 pl-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-line">
              <li className="relative text-[11.5px]">
                <span className="absolute top-1 -left-4 size-[11px] rounded-full border-2 border-white bg-ink" />
                <span className="font-medium">发现</span>
                <span className="text-muted-foreground"> · {fmtDemo(c.firstAt)} · {c.live ? "接待工作台识别" : "规则扫描服务数据"}</span>
              </li>
              {entries.map((l) => (
                <li key={l.id} className="relative text-[11.5px]">
                  <span className="absolute top-1 -left-4 size-[11px] rounded-full border-2 border-white bg-[#8975ce]" />
                  <span className="font-medium">{ACTION_CN[l.action] ?? l.action}</span>
                  {c.alerts.length > 1 && l.action !== "event_open" && <span className="text-ink-soft"> · {titleOf(l.eventId)}</span>}
                  <span className="text-muted-foreground">
                    {" "}
                    · {fmtDemo(l.demoAt)} · {l.actor}
                  </span>
                  {l.note && <div className="text-ink-soft">{l.note}</div>}
                </li>
              ))}
            </ol>
            <div className="mt-3 text-[11px] leading-relaxed text-muted-foreground">触发规则：{[...new Set(c.alerts.map((a) => a.rule))].join("；")}</div>
          </div>
          <div className="space-y-2">
            {c.status === "processing" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!note.trim()) return toast.error("请写下处理结果，再标记闭环")
                  void act("close")
                }}
              >
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor={`note-${c.id}`}>
                  处理结果（闭环必须填写）
                </label>
                <textarea id={`note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="例如：已改派顺丰并致电消费者，对方确认收到" className="w-full resize-none rounded-xl border border-line bg-porcelain px-3 py-2 text-[12px] outline-none focus:border-[#c3b5f4]" />
                <button className="mt-1.5 h-8 rounded-lg bg-ink px-3 text-[11.5px] font-medium text-white">标记闭环</button>
              </form>
            )}
            {c.status !== "closed" && c.status !== "invalid" && (
              <details className="rounded-xl border border-line px-3 py-2 text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">预警有误？标记为无效</summary>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  一次纠正一条，需写明原因并附依据。产品安全类只能由质量法规部纠正，其他类需组长以上。{c.customer ? "纠正后这一事件不再进入这位消费者的分析。" : "这是批次层面的预警，纠正后对所有消费者生效。"}
                </p>
                {pending.length > 1 && (
                  <select value={wrong} onChange={(e) => setWrong(e.target.value)} aria-label="要纠正的预警" className="mt-1.5 h-7 w-full rounded-lg border border-line bg-white px-1.5 outline-none">
                    <option value="">要纠正的是哪一条？</option>
                    {pending.map((a) => (
                      <option key={a.eventKey} value={a.eventKey}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                )}
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="原因，如：批号识别错误" className="mt-1.5 h-7 w-full rounded-lg border border-line bg-white px-2 outline-none" />
                <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="依据，如：瓶身照片放大后为 LX2608B" className="mt-1 h-7 w-full rounded-lg border border-line bg-white px-2 outline-none" />
                <button type="button" onClick={() => act("invalidate")} className="mt-1.5 flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-ink-soft">
                  <Ban className="size-3" />
                  标记无效
                </button>
              </details>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function AlertsPage() {
  const [board, setBoard] = useState<Board | null>(null)
  const [type, setType] = useState<AlertType | "all">("all")
  const [filter, setFilter] = useState<AlertStatus | "all" | "overdue">("all")
  const demo = useRecord((s) => s.demo)
  const load = useCallback(() => {
    fetch("/api/board")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => toast.error("看板数据加载失败"))
  }, [])
  useEffect(load, [load])

  const now = board ? new Date(board.now) : undefined
  const cases = useMemo(() => (board ? toCases(board.alerts, (a) => a.status) : []), [board])
  const count = (s: AlertStatus) => cases.filter((c) => c.status === s).length
  const isLate = (c: AlertCase) => (now ? overdueAlerts(c, (a) => a.status, now).length > 0 : false)
  const overdue = cases.filter(isLate).length
  const shown = cases.filter((c) => (type === "all" || c.types.includes(type)) && (filter === "all" || (filter === "overdue" ? isLate(c) : c.status === filter)))

  return (
    <div className="px-8 pb-12">
      <PageHeader
        className="px-0"
        eyebrow="Risk Watch"
        title="风险预警看板"
        desc="把聊天记录、订单和售后工单放在一起看，才能发现单个会话里看不到的异常：同一件事第四次进线、三个月退了五次款、答应过的事过了期限还没做。同一位消费者的预警合并为一个个案，每条预警保留自己的触发时间和截止时间；认领、闭环、纠正都记在服务端，换人、刷新后仍在。"
      >
        <div className="flex items-center gap-2">
          <ActorSwitch />
          <button onClick={() => demo("advance", 9).then(load)} className="flex h-8 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12px] text-ink-soft hover:bg-muted" title="演示：把服务数据的“现在”向后推 9 小时">
            时钟 +9 小时
          </button>
        </div>
      </PageHeader>

      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-2.5 text-[12px] leading-relaxed text-ink-soft">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
        <span>
          <b className="font-semibold text-ink">预警是算出来的，数据是合成的。</b>
          服务数据共 {ALL_CUSTOMERS.length} 位消费者、{ORDERS.length} 笔订单、{TICKETS.length} 张工单、{CONTACTS.length} 次进线，按赛题说明的三类数据结构自建；看板用和接待工作台同一套规则把异常找出来。演示时钟现在是 {board ? fmtDemo(board.now) : "…"}。
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="待处理" value={`${count("open")}`} unit="个" />
        <Tile label="处理中" value={`${count("processing")}`} unit="个" />
        <Tile label="已闭环" value={`${count("closed")}`} unit="个" />
        <Tile label="有超时的个案" value={`${overdue}`} unit="个" note="至少一条预警超过它自己的时限" />
        <Tile label="闭环率" value={cases.length ? `${Math.round((count("closed") / cases.length) * 100)}` : "0"} unit="%" note={`共 ${cases.length} 个个案`} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {ALERT_ORDER.map((k) => {
          const list = cases.filter((x) => x.types.includes(k))
          if (k === "live" && !list.length) return null
          const active = type === k
          return (
            <button key={k} onClick={() => setType(active ? "all" : k)} aria-pressed={active} title={ALERT_TYPES[k].desc} className={cn("rounded-2xl border bg-white px-4 py-3 text-left transition", active ? "border-ink shadow-[var(--shadow-lift)]" : "border-line hover:border-[#d9d0f5]")}>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">{ALERT_TYPES[k].cn}</span>
                <span className="text-[18px] font-semibold tabular">{list.length}</span>
              </div>
              <div className="mt-2 flex h-1.5 gap-[2px]" aria-hidden>
                {list.length === 0 ? (
                  <span className="h-full flex-1 rounded-full bg-muted" />
                ) : (
                  STATUSES.map((s) => {
                    const n = list.filter((x) => x.status === s).length
                    return n ? <span key={s} className="h-full rounded-full" style={{ flex: n, background: STATUS_COLOR[s] }} /> : null
                  })
                )}
              </div>
              <div className="mt-1.5 text-[10.5px] text-muted-foreground tabular">{STATUSES.map((s) => `${STATUS_CN[s]} ${list.filter((x) => x.status === s).length}`).join(" · ")}</div>
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-muted p-0.5 text-[12px]" role="tablist">
          {(
            [
              ["all", "全部"],
              ["open", "待处理"],
              ["processing", "处理中"],
              ["closed", "已闭环"],
              ["overdue", "超时"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn("rounded-lg px-3 py-1", filter === k && "bg-white shadow-[var(--shadow-soft)]")}>
              {label}
            </button>
          ))}
        </div>
        {type !== "all" && (
          <button onClick={() => setType("all")} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-ink-soft">
            {ALERT_TYPES[type].cn} ×
          </button>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <CircleDot className="size-3" style={{ color: STATUS_COLOR[s] }} />
              {STATUS_CN[s]}
            </span>
          ))}
          <span className="tabular">显示 {shown.length} 个</span>
        </span>
      </div>

      {!board ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-muted-foreground">加载中…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-[12.5px] text-muted-foreground">这个筛选条件下没有个案。</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <CaseRow key={c.id} c={c} board={board} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  )
}
