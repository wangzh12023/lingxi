"use client"

import { create } from "zustand"
import { ADR_INTERNAL_HOURS } from "./engine/adr"
import type { AgentId, AgentTrace, AgentWellbeing, HuddleRecord, Insight, Message, Scenario } from "./types"
import { CHANNELS } from "./constants"
import { SCENARIOS } from "./scenarios"
import { maskAbuse } from "./engine/heuristics"

/** What the composer needs from the server's send gate (see server/gate.ts). */
export interface GateResult {
  status: "pass" | "blocked" | "needs_human"
  summary: string
  issues: import("./types").ComplianceIssue[]
  text: string
}

/**
 * Console store — one active conversation, driven either by a rehearsed scenario (scripted consumer
 * lines through the real pipeline) or by free typing in 自由模式. Holds only session state; every
 * finding comes from /api/analyze.
 */

/** "script": rehearsed judgments for scripted lines · "auto": the model when configured, else the rule engine */
export type Prefer = "script" | "auto"

export const BREAK_MINUTES = 5
const ADR_WINDOW_MS = ADR_INTERNAL_HOURS * 3600 * 1000

interface ConsoleState {
  scenario: Scenario
  messages: Message[]
  cursor: number // index into scenario.script of the next step to play
  insights: Record<string, Insight> // by consumer message id, in arrival order
  activeInsightId?: string
  partial?: Partial<Insight>
  traces: Partial<Record<AgentId, AgentTrace>> // the run in progress; finished runs keep their own insight.trace
  analyzing: boolean
  analysisError?: string
  /** server mode reported by /api/health */
  serverMode: "llm" | "offline"
  prefer: Prefer
  composer: string
  composerOrigin: "manual" | "ai" | "ai_edited"
  adoptedDraftText?: string
  shield: boolean
  autoplay: boolean
  huddleOpen: boolean
  /** the assist plugin is shown; off leaves the plain workbench */
  pluginOn: boolean
  setPlugin: (v: boolean) => void
  /** roundtables held in this conversation, by case id */
  huddles: Record<string, HuddleRecord>
  wellbeing: AgentWellbeing
  breakEndsAt?: number
  /** when a safety signal (L2+) was first identified — the internal 24-hour reporting window counts from here */
  adrClockStartedAt?: number
  emotionTrail: { turn: number; valence: number; dominant: Insight["emotion"]["dominant"] }[]

  loadScenario: (id: string) => void
  pushConsumer: (text: string, attachments?: Message["attachments"], stepId?: string) => Promise<void>
  retryAnalysis: () => Promise<void>
  playNext: () => Promise<void>
  /** send the composer text — only after the server's send gate passes this exact text */
  sendAgent: (opts?: { reviewedBy?: string }) => Promise<void>
  /** the gate's verdict for the composer text, when it did not pass */
  gate?: GateResult
  sending: boolean
  setComposer: (text: string) => void
  adoptDraft: (text: string) => void
  setShield: (v: boolean) => void
  setAutoplay: (v: boolean) => void
  setHuddleOpen: (v: boolean) => void
  recordHuddle: (r: HuddleRecord) => void
  selectInsight: (id: string) => void
  setServerMode: (m: "llm" | "offline") => void
  setPrefer: (p: Prefer) => void
  startBreak: () => void
  endBreak: () => void
}

// A letter prefix keeps ids from ever looking like integers, so object key order stays arrival order.
const uid = () => `m${Math.random().toString(36).slice(2, 10)}`

const initialWellbeing: AgentWellbeing = { agentName: "小禾", stress: 34, sessionsToday: 37, hardSessions: 4, streakNegative: 0, lastBreakMin: 52 }

const greet = (s: Scenario): Message[] => [{ id: `sys-${s.id}`, role: "system", text: `${s.customer.name}通过${CHANNELS[s.channel].cn}发起会话 · 已载入客户档案`, at: 0 }]

export const latestInsight = (s: Pick<ConsoleState, "insights">): Insight | undefined => Object.values(s.insights).at(-1)

export const adrDeadline = (s: Pick<ConsoleState, "adrClockStartedAt">) => (s.adrClockStartedAt ? s.adrClockStartedAt + ADR_WINDOW_MS : undefined)

/** The open huddle case of this conversation, if any (a conversation escalates at most once). */
export const activeCase = (s: Pick<ConsoleState, "insights">) => Object.values(s.insights).findLast((i) => i.huddleCase)?.huddleCase

/** The recommended draft of the latest turn. */
export function recommendedDraft(s: Pick<ConsoleState, "insights">) {
  const ins = latestInsight(s)
  return ins?.drafts.find((d) => d.style === ins.recommended.style)
}


// One analysis stream at a time: a newer run, or a scenario switch, aborts and outdates the older one.
let runSeq = 0
let runAbort: AbortController | null = null
let lastRequest: { msgId: string; stepId?: string } | null = null

export const useConsole = create<ConsoleState>((set, get) => {
  async function analyze(msgId: string, stepId?: string) {
    const run = ++runSeq
    runAbort?.abort()
    const ac = new AbortController()
    runAbort = ac
    lastRequest = { msgId, stepId }
    const live = () => run === runSeq
    const { scenario, messages, prefer } = get()
    const prior = Object.values(get().insights).filter((i) => i.messageId !== msgId).at(-1)
    set({ analyzing: true, analysisError: undefined, partial: {}, traces: {}, activeInsightId: msgId })

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          // only the newest message carries its image — keeps requests small
          messages: messages.map((m) => (m.id === msgId ? m : { ...m, attachments: undefined })),
          scenarioId: scenario.id,
          stepId,
          prefer,
          prior: prior && { risk: prior.risk, emotion: prior.emotion, turn: prior.turn, productId: prior.productId, huddleCase: prior.huddleCase },
        }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 400 ? "请求格式不正确" : `分析服务返回 ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let finished = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (!live()) return
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const ev = raw.match(/^event: (.+)$/m)?.[1]
          const data = raw.match(/^data: (.+)$/m)?.[1]
          if (!ev || !data) continue
          const payload = JSON.parse(data)
          if (ev === "trace") set((st) => ({ traces: { ...st.traces, [payload.trace.agent]: payload.trace } }))
          else if (ev === "partial") set((st) => ({ partial: { ...st.partial, ...payload.patch } }))
          else if (ev === "error") throw new Error(payload.message ?? "分析失败")
          else if (ev === "done") {
            finished = true
            const ins: Insight = payload.insight
            set((st) => {
              // 护: the agent's load follows what the consumer actually expressed this turn
              const neg = ins.emotion.valence < -0.3
              const stress = Math.max(8, Math.min(96, st.wellbeing.stress + (neg ? ins.emotion.intensity * 14 : -6)))
              const safety = ins.risk.signals.some((x) => x.category === "safety" && x.level >= 2)
              return {
                insights: { ...st.insights, [msgId]: ins },
                // remember what was seen in the image, so a re-run of this turn does not re-analyse it
                messages: ins.vision ? st.messages.map((m) => (m.id === msgId ? { ...m, vision: ins.vision } : m)) : st.messages,
                partial: undefined,
                analyzing: false,
                adrClockStartedAt: st.adrClockStartedAt ?? (safety ? Date.now() : undefined),
                emotionTrail: [...st.emotionTrail.filter((e) => e.turn !== ins.turn), { turn: ins.turn, valence: ins.emotion.valence, dominant: ins.emotion.dominant }],
                wellbeing: {
                  ...st.wellbeing,
                  stress: Math.round(stress),
                  streakNegative: neg ? st.wellbeing.streakNegative + 1 : 0,
                  hardSessions: st.wellbeing.hardSessions + (neg && ins.emotion.intensity > 0.7 ? 1 : 0),
                },
              }
            })
          }
        }
      }
      if (!finished) throw new Error("分析在完成之前中断了")
    } catch (e) {
      if (!live() || (e as Error).name === "AbortError") return
      console.error("[lingxi] analysis failed:", e)
      set({ analyzing: false, partial: undefined, autoplay: false, analysisError: (e as Error).message || "分析失败" })
    }
  }

  return {
    scenario: SCENARIOS[0],
    messages: greet(SCENARIOS[0]),
    cursor: 0,
    insights: {},
    traces: {},
    analyzing: false,
    serverMode: "offline",
    prefer: "script",
    composer: "",
    composerOrigin: "manual",
    shield: true,
    autoplay: false,
    huddleOpen: false,
    pluginOn: true,
    setPlugin: (v) => set({ pluginOn: v }),
    huddles: {},
    wellbeing: initialWellbeing,
    emotionTrail: [],

    loadScenario(id) {
      runSeq++ // outdate any stream still in flight
      runAbort?.abort()
      lastRequest = null
      const s = SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0]
      set({
        scenario: s,
        messages: greet(s),
        cursor: 0,
        insights: {},
        activeInsightId: undefined,
        partial: undefined,
        traces: {},
        analyzing: false,
        analysisError: undefined,
        composer: "",
        composerOrigin: "manual",
        adoptedDraftText: undefined,
        huddleOpen: false,
        huddles: {},
        autoplay: false,
        adrClockStartedAt: undefined,
        emotionTrail: [],
        // the agent's own load carries over between customers — that is the point of 护
        wellbeing: { ...get().wellbeing, streakNegative: 0 },
      })
    },

    async pushConsumer(text, attachments, stepId) {
      const msg: Message = { id: uid(), role: "consumer", text, at: Date.now(), attachments }
      const abusive = maskAbuse(text).hits.length
      set((st) => ({
        messages: [...st.messages, msg],
        wellbeing: abusive ? { ...st.wellbeing, stress: Math.min(96, st.wellbeing.stress + abusive * 8) } : st.wellbeing,
      }))
      await analyze(msg.id, stepId)
    },

    async retryAnalysis() {
      if (lastRequest && !get().analyzing) await analyze(lastRequest.msgId, lastRequest.stepId)
    },

    async playNext() {
      const st = get()
      if (st.analyzing || st.huddleOpen) return
      const step = st.scenario.script[st.cursor]
      if (!step) return
      if (step.role === "consumer") {
        set({ cursor: st.cursor + 1 })
        await get().pushConsumer(step.text, step.attachments, step.id)
      } else if (step.role === "agent") {
        // pre-fill the recommended draft; the cursor moves on only when the human actually sends
        const d = recommendedDraft(st)
        if (d) get().adoptDraft(d.text)
      } else {
        // the roundtable convenes; the cursor moves on when the sheet is closed after a resolution
        get().setHuddleOpen(true)
      }
    },

    async sendAgent(opts) {
      const { composer, composerOrigin, messages, scenario, cursor, insights } = get()
      const body = composer.trim()
      if (!body || get().sending) return
      const ins = Object.values(insights).at(-1)
      set({ sending: true })
      let verdict: GateResult
      try {
        const res = await fetch("/api/send-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId: scenario.id,
            text: body,
            productId: ins?.productId,
            level: ins?.risk.level ?? 0,
            situation: ins && { safety: ins.intent.primary === "adverse_reaction" || ins.risk.signals.some((x) => x.category === "safety" && x.level >= 2), logistics: ins.intent.primary === "logistics", refund: ins.intent.primary === "return_refund" },
            reviewedBy: opts?.reviewedBy,
          }),
        })
        verdict = await res.json()
        if (!res.ok) throw new Error(String((verdict as unknown as { error?: string }).error ?? res.status))
      } catch (e) {
        set({ sending: false, gate: { status: "blocked", summary: `发送前审查没有完成（${(e as Error).message}），请重试`, issues: [], text: body } })
        return
      }
      set({ sending: false })
      if (verdict.status !== "pass") {
        set({ gate: { ...verdict, text: body } })
        return
      }
      set({
        gate: undefined,
        messages: [...messages, { id: uid(), role: "agent", text: body, at: Date.now(), origin: composerOrigin }],
        composer: "",
        composerOrigin: "manual",
        adoptedDraftText: undefined,
        ...(scenario.script[cursor]?.role === "agent" ? { cursor: cursor + 1 } : {}),
      })
    },

    sending: false,

    setComposer(text) {
      const { adoptedDraftText } = get()
      if (!text) return set({ composer: "", composerOrigin: "manual", adoptedDraftText: undefined })
      set({ composer: text, composerOrigin: adoptedDraftText ? (text === adoptedDraftText ? "ai" : "ai_edited") : "manual" })
    },

    adoptDraft: (text) => set({ composer: text, composerOrigin: "ai", adoptedDraftText: text }),
    setShield: (v) => set({ shield: v }),
    setAutoplay: (v) => set({ autoplay: v }),

    setHuddleOpen(v) {
      const st = get()
      if (v) return set({ huddleOpen: Boolean(activeCase(st)) })
      // closing the room after a resolution completes a scripted huddle step
      const c = activeCase(st)
      const atHuddleStep = st.scenario.script[st.cursor]?.role === "huddle"
      set({ huddleOpen: false, ...(atHuddleStep && c && st.huddles[c.id] ? { cursor: st.cursor + 1 } : {}) })
    },

    recordHuddle: (r) => set((st) => ({ huddles: { ...st.huddles, [r.caseId]: { ...r, caseVersion: r.caseVersion ?? activeCase(st)?.version ?? 1 } } })),
    selectInsight: (id) => set({ activeInsightId: id }),
    setServerMode: (m) => set({ serverMode: m }),
    setPrefer: (p) => set({ prefer: p }),

    startBreak: () =>
      set((st) => ({
        autoplay: false,
        breakEndsAt: Date.now() + BREAK_MINUTES * 60 * 1000,
        wellbeing: { ...st.wellbeing, stress: Math.max(8, st.wellbeing.stress - 15), streakNegative: 0, lastBreakMin: 0 },
      })),
    endBreak: () => set({ breakEndsAt: undefined }),
  }
})
