import path from "node:path"
import { mkdirSync } from "node:fs"
import type { DatabaseSync as DB } from "node:sqlite"
import { demoNow, isoLocal } from "../clock"
import { canApprove, policyFor, sanitizeAction } from "../policy"
import { STAFF_MAP, type Staff } from "../staff"
import { nextStatus, isCommitted, type Task, type TaskAction, type TaskLogEntry } from "../tasks"
import type { EventStatus, StoredRiskEvent } from "../events"
import type { RiskSignal } from "../types"
import { buildFactPack, brokenPromises } from "../engine/facts"

/**
 * The demo's system of record: tasks, approvals, risk events, the mock ticket service and the
 * operation log, in one SQLite file (lingxi/.data/lingxi.db; `LINGXI_DB=:memory:` for tests).
 * Everything an agent does that is meant to last — a proposal, an approval, a correction — is
 * written here, so it survives a reload and is the same for whoever opens the case next.
 *
 * SQLite comes from Node itself (node:sqlite), loaded through process.getBuiltinModule so that no
 * bundler tries to resolve it.
 */

type Sqlite = typeof import("node:sqlite")
const g = globalThis as unknown as { __lingxiDb?: DB }

function open(): DB {
  if (g.__lingxiDb) return g.__lingxiDb
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as Sqlite
  const file = process.env.LINGXI_DB ?? path.join(process.cwd(), ".data", "lingxi.db")
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, status TEXT NOT NULL, due_at TEXT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, event_key TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, UNIQUE (customer_id, event_key));
    CREATE TABLE IF NOT EXISTS op_log (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, event_id TEXT, customer_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, demo_at TEXT NOT NULL, note TEXT, idem_key TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS mock_tickets (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL, demo_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, decision TEXT NOT NULL, actor TEXT NOT NULL, rank TEXT NOT NULL, at TEXT NOT NULL, note TEXT);
    CREATE TABLE IF NOT EXISTS reviews (hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
  `)
  g.__lingxiDb = db
  return db
}

/* ───────────────────────── settings & the demo clock ───────────────────────── */

const getSetting = (key: string) => (open().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value
const setSetting = (key: string, value: string) => open().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value)

export const clockOffsetMs = () => Number(getSetting("clock_offset_ms") ?? 0)
/** The demo clock: the dataset's "now" plus however far the operator has advanced it. */
export const now = () => demoNow(clockOffsetMs())
const demoAt = () => isoLocal(now())
const wallAt = () => new Date().toISOString()

const nextSeq = (name: string) => {
  const n = Number(getSetting(`seq_${name}`) ?? 0) + 1
  setSetting(`seq_${name}`, String(n))
  return n
}

/* ───────────────────────── log ───────────────────────── */

function log(e: Omit<TaskLogEntry, "id" | "at" | "demoAt">) {
  open()
    .prepare("INSERT INTO op_log (task_id, event_id, customer_id, action, actor, at, demo_at, note, idem_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(e.taskId ?? null, e.eventId ?? null, e.customerId, e.action, e.actor, wallAt(), demoAt(), e.note ?? null, e.idemKey ?? null)
}

/** Has this click been processed already? A repeated idempotency key changes nothing. */
const seen = (idemKey?: string) => Boolean(idemKey && open().prepare("SELECT 1 FROM op_log WHERE idem_key = ?").get(idemKey))

export function logFor(customerId: string, limit = 60): TaskLogEntry[] {
  return (open().prepare("SELECT * FROM op_log WHERE customer_id = ? ORDER BY id DESC LIMIT ?").all(customerId, limit) as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    taskId: (r.task_id as string) ?? undefined,
    eventId: (r.event_id as string) ?? undefined,
    customerId: r.customer_id as string,
    action: r.action as string,
    actor: r.actor as string,
    at: r.at as string,
    demoAt: r.demo_at as string,
    note: (r.note as string) ?? undefined,
  }))
}

/* ───────────────────────── tasks ───────────────────────── */

const readTask = (r?: { data: string }) => (r ? (JSON.parse(r.data) as Task) : undefined)
const saveTask = (t: Task) => open().prepare("INSERT INTO tasks (id, customer_id, status, due_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, due_at = excluded.due_at, data = excluded.data").run(t.id, t.customerId, t.status, t.dueAt ?? null, JSON.stringify(t))

export const getTask = (id: string) => readTask(open().prepare("SELECT data FROM tasks WHERE id = ?").get(id) as { data: string } | undefined)
export const listTasks = (customerId?: string): Task[] =>
  ((customerId ? open().prepare("SELECT data FROM tasks WHERE customer_id = ? ORDER BY id").all(customerId) : open().prepare("SELECT data FROM tasks ORDER BY id").all()) as { data: string }[]).map((r) => JSON.parse(r.data) as Task)

export type Result<T> = { ok: true; value: T; replayed?: boolean } | { ok: false; error: string; status: number }
const fail = <T,>(error: string, status = 400): Result<T> => ({ ok: false, error, status })

const actorOf = (id: string): Staff | undefined => STAFF_MAP[id]

/**
 * Propose an action as a task. The action is re-sanitised and its approver recomputed here, from the
 * consumer's own record — whatever the client sent as approver or status is ignored.
 */
export async function proposeTask(input: { customerId: string; sessionId?: string; action: unknown; actorId: string; idemKey: string; autoSubmit?: boolean }): Promise<Result<Task>> {
  const actor = actorOf(input.actorId)
  if (!actor) return fail("未知的操作人", 403)
  const existing = open().prepare("SELECT task_id FROM op_log WHERE idem_key = ?").get(input.idemKey) as { task_id: string } | undefined
  if (existing?.task_id) return { ok: true, value: getTask(existing.task_id)!, replayed: true }
  const a = sanitizeAction(input.action)
  if (!a) return fail("行动格式不正确")
  const pack = buildFactPack(input.customerId, now(), listTasks(input.customerId))
  if (a.resolves && !pack.commitments.some((c) => c.ref === a.resolves)) a.resolves = undefined
  const p = policyFor(a, { brokenPromises: brokenPromises(pack).length })
  if (p.blocked) return fail(p.blocked)
  // the same promise is not made twice: an open task already making good on it is returned instead
  if (a.resolves) {
    const dup = listTasks(input.customerId).find((t) => t.resolves === a.resolves && t.title === a.title && !["rejected", "cancelled", "closed"].includes(t.status))
    if (dup) return { ok: true, value: dup, replayed: true }
  }
  const at = demoAt()
  const t: Task = {
    id: `TK-${String(nextSeq("task")).padStart(4, "0")}`,
    customerId: input.customerId,
    sessionId: input.sessionId,
    kind: a.kind,
    title: a.title,
    detail: a.detail,
    cost: a.cost,
    approver: p.approver,
    policyBasis: p.basis,
    status: p.approver ? "pending_approval" : "approved",
    commitment: a.commitment,
    dueAt: a.dueInHours ? isoLocal(new Date(now().getTime() + a.dueInHours * 3600000)) : undefined,
    resolves: a.resolves,
    proposedBy: actor.name,
    proposedAt: at,
    attempts: 0,
    updatedAt: at,
  }
  saveTask(t)
  log({ taskId: t.id, customerId: t.customerId, action: "propose", actor: actor.name, note: p.approver ? `提交审批（${p.approver}）：${p.basis}` : `无需审批：${p.basis}`, idemKey: input.idemKey })
  if (!p.approver && input.autoSubmit) return submit(t, actor)
  return { ok: true, value: t }
}

/** Send an approved task to the ticket system. Only a successful answer with a ticket id counts. */
async function submit(t: Task, actor: Staff): Promise<Result<Task>> {
  const { mockTicketService } = await import("./tickets")
  // a task that already got a ticket is not submitted twice
  const prior = open().prepare("SELECT id FROM mock_tickets WHERE task_id = ?").get(t.id) as { id: string } | undefined
  const res = prior ? { ok: true as const, ticketId: prior.id } : await mockTicketService.create(t)
  const at = demoAt()
  const next: Task = res.ok ? { ...t, status: "submitted", ticketId: res.ticketId, attempts: t.attempts + 1, lastError: undefined, updatedAt: at } : { ...t, status: "submit_failed", attempts: t.attempts + 1, lastError: res.error, updatedAt: at }
  saveTask(next)
  log({ taskId: t.id, customerId: t.customerId, action: res.ok ? "submitted" : "submit_failed", actor: actor.name, note: res.ok ? `模拟工单系统受理：${res.ticketId}` : `提交失败：${res.error}` })
  return { ok: true, value: next }
}

export async function transitionTask(id: string, action: TaskAction, input: { actorId: string; idemKey: string; note?: string }): Promise<Result<Task>> {
  const actor = actorOf(input.actorId)
  if (!actor) return fail("未知的操作人", 403)
  const t = getTask(id)
  if (!t) return fail("任务不存在", 404)
  if (seen(input.idemKey)) return { ok: true, value: t, replayed: true }
  const move = nextStatus(t, action)
  if ("error" in move) return fail(move.error, 409)
  if ((action === "approve" || action === "reject") && !(t.approver && canApprove(actor.rank, t.approver))) return fail(`${actor.name}（${actor.rank}）没有审批这项任务的权限，需要${t.approver}`, 403)
  if (action === "record_result" && !input.note?.trim()) return fail("请写明执行结果")
  if ((action === "reopen" || action === "reject") && !input.note?.trim()) return fail("请写明原因")
  const at = demoAt()
  log({ taskId: t.id, customerId: t.customerId, action, actor: actor.name, note: input.note, idemKey: input.idemKey })

  if (action === "approve") {
    open().prepare("INSERT INTO approvals (task_id, decision, actor, rank, at, note) VALUES (?, 'approved', ?, ?, ?, ?)").run(t.id, actor.name, actor.rank, wallAt(), input.note ?? null)
    const approved: Task = { ...t, status: "approved", decidedBy: actor.name, decidedAt: at, note: input.note, updatedAt: at }
    saveTask(approved)
    // approval goes straight to the ticket system; if that fails the task stays approved-not-submitted
    return submit(approved, actor)
  }
  if (action === "reject") {
    open().prepare("INSERT INTO approvals (task_id, decision, actor, rank, at, note) VALUES (?, 'rejected', ?, ?, ?, ?)").run(t.id, actor.name, actor.rank, wallAt(), input.note ?? null)
    const rejected: Task = { ...t, status: "rejected", decidedBy: actor.name, decidedAt: at, note: input.note, updatedAt: at }
    saveTask(rejected)
    return { ok: true, value: rejected }
  }
  if (action === "submit") return submit(t, actor)
  const next: Task = { ...t, status: move.status, updatedAt: at, ...(action === "record_result" ? { result: input.note } : {}), ...(action === "reopen" || action === "verify" ? { note: input.note } : {}) }
  saveTask(next)
  return { ok: true, value: next }
}

export const ticketsFor = (customerId: string) =>
  open().prepare("SELECT * FROM mock_tickets WHERE customer_id = ? ORDER BY id").all(customerId) as { id: string; task_id: string; title: string; detail: string; created_at: string; demo_at: string }[]

export function createMockTicket(t: Task): string {
  const d = now()
  const id = `MT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(nextSeq("ticket")).padStart(4, "0")}`
  open().prepare("INSERT INTO mock_tickets (id, task_id, customer_id, title, detail, created_at, demo_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, t.id, t.customerId, t.title, `${t.detail}${t.commitment ? `；对消费者承诺：${t.commitment}` : ""}`, wallAt(), demoAt())
  return id
}

/** Fault injection for the demo: the next submission to the ticket system fails once. */
export const failNextSubmit = () => getSetting("fail_next_submit") === "1"
export const setFailNextSubmit = (v: boolean) => setSetting("fail_next_submit", v ? "1" : "0")

/* ───────────────────────── risk events ───────────────────────── */

const readEvent = (r: { data: string }) => JSON.parse(r.data) as StoredRiskEvent
const saveEvent = (e: StoredRiskEvent) => open().prepare("INSERT INTO events (id, customer_id, event_key, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data").run(e.id, e.customerId, e.eventKey, e.status, JSON.stringify(e))

export const listEvents = (customerId?: string): StoredRiskEvent[] =>
  ((customerId ? open().prepare("SELECT data FROM events WHERE customer_id = ?").all(customerId) : open().prepare("SELECT data FROM events").all()) as { data: string }[]).map(readEvent)
const findEvent = (customerId: string, eventKey: string) => {
  const r = open().prepare("SELECT data FROM events WHERE customer_id = ? AND event_key = ?").get(customerId, eventKey) as { data: string } | undefined
  return r ? readEvent(r) : undefined
}

/**
 * Record what a conversation turn found. A new problem opens a new event; new evidence on a closed
 * event reopens it (the closed status does not cover the new problem); an event marked invalid stays
 * invalid — the pipeline already kept it out.
 */
export function recordSignals(customerId: string, signals: RiskSignal[], actor = "灵犀"): StoredRiskEvent[] {
  const at = demoAt()
  const out: StoredRiskEvent[] = []
  for (const s of signals.filter((x) => x.level >= 2 && x.eventKey)) {
    const old = findEvent(customerId, s.eventKey!)
    const evidence = s.evidenceList ?? [s.evidence]
    if (!old) {
      const e: StoredRiskEvent = { id: `EV-${String(nextSeq("event")).padStart(4, "0")}`, customerId, eventKey: s.eventKey!, category: s.category, level: s.level, title: s.title, status: "open", firstSeen: at, lastSeen: at, evidence, version: 1 }
      saveEvent(e)
      log({ eventId: e.id, customerId, action: "event_open", actor, note: `${s.title}（L${s.level}）` })
      out.push(e)
      continue
    }
    if (old.status === "invalid") {
      out.push(old)
      continue
    }
    const added = evidence.filter((x) => !old.evidence.includes(x))
    if (!added.length && s.level <= old.level) {
      out.push(old)
      continue
    }
    const reopen = old.status === "closed"
    const e: StoredRiskEvent = { ...old, level: Math.max(old.level, s.level) as StoredRiskEvent["level"], title: s.level > old.level ? s.title : old.title, evidence: [...old.evidence, ...added].slice(-8), lastSeen: at, version: old.version + 1, status: reopen ? "open" : old.status }
    saveEvent(e)
    log({ eventId: e.id, customerId, action: reopen ? "event_reopen" : "event_evidence", actor, note: reopen ? `已闭环的事件出现新证据，重新打开：${added.join("；") || `等级升至 L${s.level}`}` : `新增证据：${added.join("；")}` })
    out.push(e)
  }
  return out
}

/** Board actions on an event. Marking invalid needs a reason and evidence, and the right person. */
export function transitionEvent(input: { customerId: string; eventKey: string; title?: string; category?: StoredRiskEvent["category"]; level?: StoredRiskEvent["level"]; action: "claim" | "close" | "reopen" | "invalidate"; actorId: string; idemKey: string; note?: string; evidence?: string }): Result<StoredRiskEvent> {
  const actor = actorOf(input.actorId)
  if (!actor) return fail("未知的操作人", 403)
  let e = findEvent(input.customerId, input.eventKey)
  if (seen(input.idemKey)) return e ? { ok: true, value: e, replayed: true } : fail("事件不存在", 404)
  const at = demoAt()
  // an alert found in the service data has no stored event yet: the first action creates it
  if (!e) {
    if (!input.title || !input.category) return fail("事件不存在", 404)
    e = { id: `EV-${String(nextSeq("event")).padStart(4, "0")}`, customerId: input.customerId, eventKey: input.eventKey, category: input.category, level: input.level ?? 2, title: input.title, status: "open", firstSeen: at, lastSeen: at, evidence: [], version: 1 }
  }
  const to: Record<typeof input.action, EventStatus> = { claim: "processing", close: "closed", reopen: "open", invalidate: "invalid" }
  if (input.action === "close" && !input.note?.trim()) return fail("请写下处理结果，再标记闭环")
  if (input.action === "invalidate") {
    if (!input.note?.trim() || !input.evidence?.trim()) return fail("标记无效需要写明原因并附上依据")
    const qa = actor.dept === "质量法规部"
    if (e.category === "safety" ? !qa : !(qa || actor.rank !== "一线坐席")) return fail(e.category === "safety" ? "产品安全类事件只能由质量法规部纠正" : "需要组长或以上才能标记无效", 403)
  }
  const next: StoredRiskEvent = { ...e, status: to[input.action], lastSeen: at, ...(input.action === "invalidate" ? { invalidReason: `${input.note}（依据：${input.evidence}）`, invalidBy: actor.name } : {}), ...(input.action === "reopen" ? { invalidReason: undefined, invalidBy: undefined } : {}) }
  saveEvent(next)
  log({ eventId: next.id, customerId: next.customerId, action: `event_${input.action}`, actor: actor.name, note: input.note, idemKey: input.idemKey })
  return { ok: true, value: next }
}

/* ───────────────────────── send-time reviews ───────────────────────── */

export const logSend = (customerId: string, actor: string, note: string) => log({ customerId, action: "send_reviewed", actor, note })

export const saveReview = (hash: string, customerId: string, data: unknown) => open().prepare("INSERT INTO reviews (hash, customer_id, at, data) VALUES (?, ?, ?, ?) ON CONFLICT(hash) DO UPDATE SET at = excluded.at, data = excluded.data").run(hash, customerId, wallAt(), JSON.stringify(data))
export const getReview = <T,>(hash: string) => {
  const r = open().prepare("SELECT data FROM reviews WHERE hash = ?").get(hash) as { data: string } | undefined
  return r ? (JSON.parse(r.data) as T) : undefined
}

/* ───────────────────────── demo controls ───────────────────────── */

export function advanceClock(hours: number, actorId: string) {
  const actor = actorOf(actorId)?.name ?? "演示"
  setSetting("clock_offset_ms", String(clockOffsetMs() + hours * 3600000))
  log({ customerId: "*", action: "clock_advance", actor, note: `演示时钟前进 ${hours} 小时，现在 ${demoAt()}` })
}

/** Back to the state the demo starts in: no tasks, no events, the clock at the dataset's "now". */
export function resetDemo() {
  open().exec("DELETE FROM tasks; DELETE FROM events; DELETE FROM op_log; DELETE FROM mock_tickets; DELETE FROM approvals; DELETE FROM reviews; DELETE FROM settings;")
}

export const committedTasks = (customerId: string) => listTasks(customerId).filter(isCommitted)
