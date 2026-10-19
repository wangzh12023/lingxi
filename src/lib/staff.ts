import type { Role } from "./policy"

/**
 * Who is at the console. A demo directory, not a login: the identity switcher picks one of these,
 * and the server checks the picked person's rank before an approval or a correction. The names are
 * invented and match the agents named in the service history.
 */
export interface Staff {
  id: string
  name: string
  title: string
  /** approval rank, see policy.ts */
  rank: Role
  dept: "客服" | "质量法规部"
}

export const STAFF: Staff[] = [
  { id: "u-xiaohe", name: "小禾", title: "一线坐席", rank: "一线坐席", dept: "客服" },
  { id: "u-xiaolin", name: "小林", title: "一线坐席", rank: "一线坐席", dept: "客服" },
  { id: "u-wang", name: "王组长", title: "客服组长", rank: "组长", dept: "客服" },
  { id: "u-zhao", name: "赵主管", title: "值班主管", rank: "主管", dept: "客服" },
  { id: "u-lu", name: "陆工", title: "质量法规专员", rank: "一线坐席", dept: "质量法规部" },
]

export const STAFF_MAP = Object.fromEntries(STAFF.map((s) => [s.id, s])) as Record<string, Staff>
export const DEFAULT_STAFF = STAFF[0].id
