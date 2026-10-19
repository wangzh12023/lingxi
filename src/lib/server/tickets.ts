import { createMockTicket, failNextSubmit, setFailNextSubmit } from "./db"
import type { Task } from "../tasks"

/**
 * The ticket system, behind an adapter. This prototype ships one implementation: a MOCK ticket
 * service that writes into the demo database and returns ids like MT-20261011-0001. It is labelled
 * as such everywhere it appears. A real deployment would implement `create` against the company's
 * ticket API; nothing else in the app would change.
 */
export interface TicketAdapter {
  readonly name: string
  create(task: Task): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }>
}

export const mockTicketService: TicketAdapter = {
  name: "模拟工单系统（演示）",
  async create(task) {
    // fault injection for the demo: the next call fails once, to show that nothing is promised on a failure
    if (failNextSubmit()) {
      setFailNextSubmit(false)
      return { ok: false, error: "模拟工单系统返回 503（演示：故障注入）" }
    }
    return { ok: true, ticketId: createMockTicket(task) }
  },
}
