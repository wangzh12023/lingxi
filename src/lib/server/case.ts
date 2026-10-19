import { buildFactPack } from "../engine/facts"
import { listEvents, listTasks, now } from "./db"

/**
 * What the server hands the pipeline for one consumer: the fact pack with the live tasks folded in,
 * the board's risk events (corrections included) and the demo clock. Built from the customer id
 * alone — nothing the browser sends can add a fact.
 */
export function caseContext(customerId: string) {
  const t = now()
  // batch-level events are recorded without a consumer ("*"): a correction there applies to everyone
  return { facts: buildFactPack(customerId, t, listTasks(customerId)), storedEvents: [...listEvents(customerId), ...listEvents("*")], now: t.toISOString() }
}
