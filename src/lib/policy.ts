import { COMP_MATRIX } from "./data"
import type { NextBestAction } from "./types"

/**
 * Who may decide what. This is the only place approvals are decided: an action arriving from a
 * model, a script or the browser is a *proposal* — its own `approver` field, if any, is discarded.
 *
 *   · a cost is checked against the compensation matrix (一线 ≤ ¥50 · 组长 ≤ ¥200 · 主管 ≤ ¥800 · above that, 会诊)
 *   · a compensation without a valid amount cannot be approved at all — it has to be verified first
 *   · assigning people (escalations) needs a team lead; convening a roundtable needs the duty manager
 *   · reporting an adverse reaction is a duty, not a favour: nobody has to approve it
 */
export const ROLES = ["一线坐席", "组长", "主管", "跨部门会诊"] as const
export type Role = (typeof ROLES)[number]

/** A role may approve anything that needs its own rank or below. */
export const canApprove = (role: Role, needed: Role) => ROLES.indexOf(role) >= ROLES.indexOf(needed) && role !== "一线坐席"

export const ACTION_KINDS: NextBestAction["kind"][] = ["compensation", "escalate", "followup", "education", "recommend", "verify", "report"]

export interface ActionPolicy {
  /** the lowest role that may approve; undefined when a frontline agent may act alone */
  approver?: Role
  /** set when the action cannot be approved as proposed */
  blocked?: string
  /** one line explaining the decision — shown next to the action */
  basis: string
}

const costRole = (cost: number): Role => COMP_MATRIX.find((r) => cost <= r.limit)!.role as Role

export interface PolicyContext {
  /** promises to this consumer that are already overdue */
  brokenPromises?: number
}

export function policyFor(a: Pick<NextBestAction, "kind" | "title" | "cost" | "commitment" | "resolves">, ctx: PolicyContext = {}): ActionPolicy {
  const hasCost = a.cost !== undefined && a.cost !== null
  if (hasCost && !(typeof a.cost === "number" && Number.isFinite(a.cost) && a.cost >= 0)) return { blocked: "金额无效，需先核实", basis: "金额不是有效数字" }
  if (a.kind === "compensation" && !hasCost) return { blocked: "补偿没有写明金额，需先核实", basis: "补偿必须有金额才能审批" }
  const byCost: Role | undefined = hasCost && a.cost! > COMP_MATRIX[0].limit ? costRole(a.cost!) : undefined
  let byKind: Role | undefined
  if (a.kind === "escalate") byKind = /会诊/.test(a.title) ? "主管" : "组长"
  // after a broken promise, a new promise has to be one somebody senior has checked can be kept
  const recommit = (ctx.brokenPromises ?? 0) > 0 && Boolean(a.commitment || a.resolves) && (a.kind === "followup" || a.kind === "compensation")
  if (recommit && (!byKind || ROLES.indexOf(byKind) < ROLES.indexOf("组长"))) byKind = "组长"
  const needed = [byCost, byKind].filter(Boolean).sort((x, y) => ROLES.indexOf(y!) - ROLES.indexOf(x!))[0]
  const prev = byCost ? COMP_MATRIX[ROLES.indexOf(byCost) - 1] : undefined
  const basis = byCost && prev && ROLES.indexOf(byCost) >= ROLES.indexOf(byKind ?? "一线坐席")
    ? `¥${a.cost} 超过${prev.role}权限（¥${prev.limit}）`
    : recommit
      ? "此前的承诺已逾期，新的承诺需组长确认能兑现"
      : byKind
      ? a.kind === "escalate" && /会诊/.test(a.title)
        ? "召集会诊需值班主管同意"
        : "调派人员需组长同意"
      : a.kind === "report"
        ? "不良反应登记是义务，无需审批"
        : hasCost
          ? `¥${a.cost} 在一线坐席权限内`
          : "不涉及金额与调派，坐席可直接执行"
  return { approver: needed, basis }
}

/**
 * Only these fields of a proposed action are kept. Anything else a model or a client sends —
 * `approver`, `approved`, `status`, `limit` … — is dropped before the policy runs.
 */
export function sanitizeAction(raw: unknown): Omit<NextBestAction, "id"> | null {
  if (!raw || typeof raw !== "object") return null
  const a = raw as Record<string, unknown>
  const kind = ACTION_KINDS.includes(a.kind as NextBestAction["kind"]) ? (a.kind as NextBestAction["kind"]) : undefined
  const title = typeof a.title === "string" ? a.title.trim().slice(0, 24) : ""
  if (!kind || !title) return null
  const cost = a.cost === undefined || a.cost === null || a.cost === "" ? undefined : typeof a.cost === "number" ? a.cost : Number.isFinite(Number(a.cost)) ? Number(a.cost) : NaN
  return {
    kind,
    title,
    detail: typeof a.detail === "string" ? a.detail.slice(0, 60) : "",
    cost: cost === 0 && kind !== "compensation" ? undefined : cost,
    impact: typeof a.impact === "string" ? a.impact.slice(0, 24) : "",
    primary: a.primary === true,
    commitment: typeof a.commitment === "string" && a.commitment.trim() ? a.commitment.trim().slice(0, 60) : undefined,
    dueInHours: typeof a.dueInHours === "number" && Number.isFinite(a.dueInHours) ? Math.max(1, Math.min(168, Math.round(a.dueInHours))) : undefined,
    // only a reference to an existing promise record survives; the pipeline checks it against the fact pack
    resolves: typeof a.resolves === "string" && /^[A-Z]{1,3}-[A-Z0-9-]{3,20}$/.test(a.resolves) ? a.resolves : undefined,
  }
}
