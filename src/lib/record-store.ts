"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Task, TaskAction, TaskLogEntry } from "./tasks"
import type { StoredRiskEvent } from "./events"
import { DEFAULT_STAFF } from "./staff"

/**
 * The browser's view of the system of record. Nothing here is the truth — the server's SQLite is.
 * Each call refetches what changed, so a second agent opening the same case sees the same tasks.
 * The only thing kept locally is which person is at the console (the identity switcher).
 */
interface CaseData {
  now: string
  clockOffsetHours: number
  tasks: Task[]
  tickets: { id: string; task_id: string; title: string; detail: string; created_at: string; demo_at: string }[]
  log: TaskLogEntry[]
}

interface RecordState {
  actorId: string
  setActor: (id: string) => void
  byCustomer: Record<string, CaseData>
  events: Record<string, StoredRiskEvent[]>
  busy: Record<string, boolean>
  /** bumps after every write, so analyses can be rerun against the new record */
  revision: number
  refresh: (customerId: string) => Promise<void>
  propose: (customerId: string, action: unknown, sessionId?: string) => Promise<{ task?: Task; error?: string }>
  move: (customerId: string, taskId: string, action: TaskAction, note?: string) => Promise<{ task?: Task; error?: string }>
  eventAction: (body: { customerId: string; eventKey: string; action: "claim" | "close" | "reopen" | "invalidate"; title?: string; category?: string; level?: number; note?: string; evidence?: string }) => Promise<{ event?: StoredRiskEvent; error?: string }>
  demo: (op: "advance" | "reset" | "fail_next_submit", hours?: number) => Promise<void>
}

const idem = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

async function post<T>(url: string, body: unknown): Promise<T & { error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return res.json().catch(() => ({ error: `服务返回 ${res.status}` }))
}

export const useRecord = create<RecordState>()(
  persist(
    (set, get) => ({
      actorId: DEFAULT_STAFF,
      setActor: (id) => set({ actorId: id }),
      byCustomer: {},
      events: {},
      busy: {},
      revision: 0,
      async refresh(customerId) {
        const [t, e] = await Promise.all([fetch(`/api/tasks?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json()), fetch(`/api/events?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json())])
        set((st) => ({ byCustomer: { ...st.byCustomer, [customerId]: t }, events: { ...st.events, [customerId]: e.events ?? [] } }))
      },
      async propose(customerId, action, sessionId) {
        // one key per click: a double click sends the same key, and the server does the work once
        const key = idem()
        set((st) => ({ busy: { ...st.busy, [JSON.stringify(action)]: true } }))
        try {
          const r = await post<{ task?: Task }>("/api/tasks", { customerId, sessionId, action, actorId: get().actorId, idemKey: key })
          await get().refresh(customerId)
          set((st) => ({ revision: st.revision + 1 }))
          return r
        } finally {
          set((st) => ({ busy: { ...st.busy, [JSON.stringify(action)]: false } }))
        }
      },
      async move(customerId, taskId, action, note) {
        set((st) => ({ busy: { ...st.busy, [taskId]: true } }))
        try {
          const r = await post<{ task?: Task }>(`/api/tasks/${taskId}`, { action, note, actorId: get().actorId, idemKey: idem() })
          await get().refresh(customerId)
          set((st) => ({ revision: st.revision + 1 }))
          return r
        } finally {
          set((st) => ({ busy: { ...st.busy, [taskId]: false } }))
        }
      },
      async eventAction(body) {
        const r = await post<{ event?: StoredRiskEvent }>("/api/events", { ...body, actorId: get().actorId, idemKey: idem() })
        await get().refresh(body.customerId)
        set((st) => ({ revision: st.revision + 1 }))
        return r
      },
      async demo(op, hours) {
        await post("/api/demo", { op, hours, actorId: get().actorId })
        const ids = Object.keys(get().byCustomer)
        await Promise.all(ids.map((id) => get().refresh(id)))
        set((st) => ({ revision: st.revision + 1, ...(op === "reset" ? { byCustomer: {}, events: {} } : {}) }))
      },
    }),
    { name: "lingxi-actor-v1", partialize: (s) => ({ actorId: s.actorId }), skipHydration: true },
  ),
)
