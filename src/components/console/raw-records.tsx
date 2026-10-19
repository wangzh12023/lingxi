"use client"

import { contactsOf, ordersOf, ticketsOf, TICKET_TYPE_CN } from "@/lib/dataset"
import { useConsole } from "@/lib/store"
import { Search } from "lucide-react"
import { useState } from "react"

/**
 * What an agent has today without Lingxi: the raw records, one list each, no analysis, no highlighting.
 * Shown when the plugin is collapsed, so a comparison “with vs without Lingxi” gives both sides the same
 * information and differs only in the assistance.
 */
export function RawRecords() {
  const customer = useConsole((s) => s.scenario.customer)
  const [tab, setTab] = useState<"orders" | "tickets" | "contacts">("orders")
  const [q, setQ] = useState("")
  const orders = ordersOf(customer.id)
  const tickets = ticketsOf(customer.id)
  const contacts = contactsOf(customer.id)
  const match = (t: string) => !q.trim() || t.includes(q.trim())
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-line px-3 py-2">
        <div className="text-[12px] font-medium text-ink">客户记录（原始数据）</div>
        <div className="mt-1.5 flex gap-1 text-[11px]" role="tablist">
          {(
            [
              ["orders", `订单 ${orders.length}`],
              ["tickets", `工单 ${tickets.length}`],
              ["contacts", `进线 ${contacts.length}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tab === k ? "rounded-md bg-ink px-2 py-0.5 text-white" : "rounded-md px-2 py-0.5 text-ink-soft hover:bg-muted"}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-1.5 flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[11px]">
          <Search className="size-3 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="搜索客户记录" />
        </label>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2 text-[11px] leading-relaxed">
        {tab === "orders" &&
          orders
            .filter((o) => match(`${o.id}${o.product}${o.status}`))
            .map((o) => (
              <div key={o.id} className="border-b border-line/60 py-1.5">
                <div className="font-mono text-[10.5px] text-muted-foreground">{o.id}</div>
                <div className="text-ink">{o.product}</div>
                <div className="text-muted-foreground">
                  ¥{o.price} · {o.status} · 下单 {o.paidAt.replace("T", " ")}
                  {o.batch ? ` · 批次 ${o.batch}` : ""}
                </div>
              </div>
            ))}
        {tab === "tickets" &&
          tickets
            .filter((t) => match(`${t.id}${t.summary}`))
            .map((t) => (
              <div key={t.id} className="border-b border-line/60 py-1.5">
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {t.id} · {TICKET_TYPE_CN[t.type]} · {{ open: "待处理", processing: "处理中", closed: "已结案" }[t.status]}
                </div>
                <div className="text-ink">{t.summary}</div>
                <div className="text-muted-foreground">
                  建单 {t.createdAt.replace("T", " ")}
                  {t.dueAt ? ` · 约定 ${t.dueAt.replace("T", " ")}` : ""}
                </div>
                {t.promiseLog?.map((p) => (
                  <div key={p.at} className="text-muted-foreground">
                    {p.at.replace("T", " ")} {p.by}：“{p.text}”
                  </div>
                ))}
              </div>
            ))}
        {tab === "contacts" &&
          contacts
            .filter((c) => match(`${c.topic}${c.lines.join("")}`))
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((c) => (
              <div key={c.id} className="border-b border-line/60 py-1.5">
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {c.at.replace("T", " ")} · {c.topic}
                  {c.resolved ? "" : " · 未解决"}
                </div>
                <div className="text-ink">{c.lines.join(" / ")}</div>
              </div>
            ))}
      </div>
    </div>
  )
}
