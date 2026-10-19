"use client"

import { cn } from "@/lib/utils"
import { latestInsight, useConsole } from "@/lib/store"
import { useRecord } from "@/lib/record-store"
import { STAFF_MAP } from "@/lib/staff"
import { canApprove } from "@/lib/policy"
import { applyFixes, checkCompliance } from "@/lib/engine/audit"
import { PRODUCT_MAP } from "@/lib/data"
import type { ComplianceIssue } from "@/lib/types"
import { AnimatePresence, motion } from "motion/react"
import { Fragment, useMemo, useRef, useState } from "react"
import { CornerDownLeft, LoaderCircle, PenLine, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

/** The same text as the textarea, transparent, with wavy underlines under each issue. */
function Underlay({ text, issues }: { text: string; issues: ComplianceIssue[] }) {
  const parts: React.ReactNode[] = []
  let cur = 0
  for (const it of issues) {
    if (it.index < cur) continue
    parts.push(<Fragment key={`t${it.index}`}>{text.slice(cur, it.index)}</Fragment>)
    parts.push(
      <span key={`m${it.index}`} className={cn("underline decoration-wavy decoration-[1.5px] underline-offset-[5px]", it.severity === "block" ? "decoration-[#d03b3b]" : "decoration-[#c27410]")}>
        {it.phrase}
      </span>,
    )
    cur = it.index + it.phrase.length
  }
  parts.push(<Fragment key="end">{text.slice(cur)}</Fragment>)
  // a trailing newline needs a character after it, or the underlay is one line short
  return (
    <>
      {parts}
      {"​"}
    </>
  )
}

export function Composer() {
  const composer = useConsole((s) => s.composer)
  const origin = useConsole((s) => s.composerOrigin)
  const setComposer = useConsole((s) => s.setComposer)
  const send = useConsole((s) => s.sendAgent)
  const productId = useConsole((s) => latestInsight(s)?.productId)
  const serverMode = useConsole((s) => s.serverMode)
  const product = productId ? PRODUCT_MAP[productId] : undefined
  const overlayRef = useRef<HTMLDivElement>(null)
  const [reviewing, setReviewing] = useState(false)
  const gate = useConsole((s) => s.gate)
  const sending = useConsole((s) => s.sending)
  const actorId = useRecord((s) => s.actorId)
  const canReview = Boolean(STAFF_MAP[actorId] && canApprove(STAFF_MAP[actorId].rank, "组长"))
  // the server's verdict counts only for the exact text it was made for — any edit makes it stale
  const verdict = gate && gate.text === composer.trim() ? gate : undefined
  const local = useMemo(() => checkCompliance(composer, { product }), [composer, product])
  const issues = useMemo(() => {
    const extra = (verdict?.issues ?? []).filter((v) => !local.some((l) => l.index === v.index && l.phrase === v.phrase))
    return [...local, ...extra].sort((a, b) => a.index - b.index)
  }, [local, verdict])
  const blocking = issues.filter((i) => i.severity === "block")
  const fixable = issues.some((i) => i.replace !== undefined)

  const trySend = async () => {
    if (!composer.trim() || sending) return
    if (blocking.length) {
      toast.error("检 · 已拦截发送", { description: blocking[0].reason })
      return
    }
    await send()
    const g = useConsole.getState().gate
    if (g && g.text === composer.trim()) (g.status === "blocked" ? toast.error : toast.warning)("检 · 发送前审查", { description: g.summary })
  }

  const fixWithRules = () => {
    const r = applyFixes(composer, { product })
    if (r.text === composer) return toast("这些问题没有安全的自动替换", { description: "请按提示手动修改" })
    setComposer(r.text)
    toast.success(`已修正 ${r.fixed} 处`, { description: r.remaining.length ? `还有 ${r.remaining.length} 处需要手动修改` : "改写后已重新检查" })
  }

  const deepReview = async () => {
    setReviewing(true)
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: composer, productId }) })
      if (!res.ok) throw new Error(String(res.status))
      const data: { source: "llm" | "rules"; rewrite: string; remaining: ComplianceIssue[]; notes: { phrase: string; reason: string }[] } = await res.json()
      if (data.rewrite !== composer) setComposer(data.rewrite)
      if (data.source === "llm") toast.success("大模型已复核并改写", { description: data.notes.length ? data.notes.map((n) => `“${n.phrase}”：${n.reason}`).join("；") : "改写结果已再次通过规则检查" })
      else toast(data.rewrite === composer ? "没有发现需要修改的地方" : "已按规则修正", { description: "当前没有配置大模型，只做了规则检查" })
    } catch {
      toast.error("深度审查没有完成", { description: "规则检查仍在实时运行，不受影响" })
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="border-t border-line bg-white px-4 pt-3 pb-3">
      <AnimatePresence>
        {issues.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={cn("mb-2 rounded-xl px-3 py-2", blocking.length ? "bg-[#fdf3f1]" : "bg-[#fdf6ea]")} role="status">
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium">
                <ShieldAlert className={cn("size-3.5", blocking.length ? "text-[#a32626]" : "text-[#8a5306]")} />
                检 · 发现 {issues.length} 处问题{blocking.length ? `，其中 ${blocking.length} 处会拦截发送` : ""}
                {fixable && (
                  <button onClick={fixWithRules} className="ml-auto flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-[10.5px] text-white">
                    <Wand2 className="size-3" />
                    按建议修正
                  </button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {issues.map((i) => (
                  <li key={i.id} className="text-[11px] leading-relaxed">
                    <span className="font-medium">“{i.phrase}”</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {i.reason}。{i.suggestion}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {verdict && verdict.status !== "pass" && !issues.some((i) => i.severity === "block") && (
        <div className="mb-2 rounded-xl bg-[#fdf8ec] px-3 py-2 text-[11.5px] leading-relaxed text-[#8a5306]" role="status">
          检 · 发送前审查：{verdict.summary}
        </div>
      )}
      <div className={cn("relative rounded-2xl border bg-porcelain transition-colors", blocking.length ? "border-[#d03b3b]/50" : "border-line focus-within:border-[#c3b5f4]")}>
        <div className="relative">
          <div ref={overlayRef} aria-hidden className="scrollbar-none pointer-events-none absolute inset-0 overflow-hidden px-3.5 py-3 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-transparent">
            <Underlay text={composer} issues={issues} />
          </div>
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onScroll={(e) => {
              if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                trySend()
              }
            }}
            rows={3}
            aria-label="回复消费者"
            placeholder="输入回复，或从右侧采用草稿。可以试着输入：这肯定是过敏了，绝对不是产品问题"
            className="relative block h-[90px] w-full resize-none bg-transparent px-3.5 py-3 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
            {origin === "ai" && (
              <>
                <Sparkles className="size-3 text-[#8a72e0]" /> 采用的草稿
              </>
            )}
            {origin === "ai_edited" && (
              <>
                <PenLine className="size-3 text-[#8a72e0]" /> 草稿，已修改
              </>
            )}
            {origin === "manual" && composer && "手写"}
          </span>
          {composer.trim() && !issues.length && !verdict && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground" title="输入时只做了本地的规则检查；按发送时，服务端会再核对事实、政策与权限">
              <ShieldCheck className="size-3" />
              规则未发现问题 · 发送时再核对事实
            </span>
          )}
          <span className="ml-auto" />
          {composer.trim() && (
            <button onClick={deepReview} disabled={reviewing} className="flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11.5px] text-muted-foreground hover:bg-muted disabled:opacity-50" title={serverMode === "llm" ? "让大模型复核并改写，结果会再过一遍规则" : "当前没有配置大模型，只做规则检查"}>
              {reviewing ? <LoaderCircle className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}
              深度审查
            </button>
          )}
          {verdict?.status === "needs_human" && (
            <button
              onClick={() => (canReview ? void send({ reviewedBy: actorId }) : toast("需要组长或以上过目", { description: "在右上角把操作人切换为王组长或赵主管" }))}
              className={cn("flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-medium", canReview ? "bg-[#8a5306] text-white" : "border border-[#f1dfb8] bg-[#fdf8ec] text-[#8a5306]")}
            >
              {canReview ? `我（${STAFF_MAP[actorId].name}）已过目，发送` : "需组长过目"}
            </button>
          )}
          <button
            onClick={trySend}
            disabled={!composer.trim() || sending}
            aria-disabled={blocking.length > 0}
            className={cn("flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-medium transition", blocking.length ? "bg-[#fbe6e6] text-[#a32626]" : "bg-ink text-white hover:bg-ink/85 disabled:opacity-40")}
          >
            {sending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {sending ? "发送前审查…" : blocking.length ? "已拦截" : "发送"}
            {!sending && <CornerDownLeft className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
