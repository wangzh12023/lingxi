"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { KNOWLEDGE, KNOWLEDGE_MAP, PRODUCTS, COMP_MATRIX } from "@/lib/data"
import { search } from "@/lib/engine/retrieval"
import type { KnowledgeDoc } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useMemo, useState } from "react"
import { BadgeCheck, BookOpenText, ExternalLink, FileText, Landmark, Package, Scale, Search, TriangleAlert } from "lucide-react"

const KINDS: { k: KnowledgeDoc["kind"]; cn: string }[] = [
  { k: "sop", cn: "作业规范" },
  { k: "policy", cn: "售后政策" },
  { k: "regulation", cn: "法规原文" },
  { k: "product", cn: "产品资料" },
  { k: "case", cn: "案例" },
]
const KIND_CN = Object.fromEntries(KINDS.map((x) => [x.k, x.cn])) as Record<KnowledgeDoc["kind"], string>

const EXAMPLES = ["A醇 刺痛 能退吗", "不良反应 报告时限", "假一赔十", "孩子 防晒", "快递没到 送人的礼物"]

export default function KnowledgePage() {
  const [q, setQ] = useState("")
  const [kinds, setKinds] = useState<KnowledgeDoc["kind"][]>([])
  const [open, setOpen] = useState<string>(KNOWLEDGE[0].id)
  const results = useMemo(() => (q.trim() ? search(q.trim(), kinds.length ? kinds : undefined) : []), [q, kinds])
  const list = q.trim() ? results.map((r) => ({ doc: KNOWLEDGE_MAP[r.docId], hit: r })) : KNOWLEDGE.filter((d) => !kinds.length || kinds.includes(d.kind)).map((doc) => ({ doc, hit: undefined }))
  const doc = KNOWLEDGE_MAP[open]

  return (
    <div className="px-8 pb-12">
      <PageHeader
        className="px-0"
        eyebrow="典 · Knowledge"
        title="知识中枢"
        desc="灵犀给出的每条建议都尽量有出处。这里的检索和工作台用的是同一套：对中文做二元分词的 BM25，再按标签加权。结果列出命中的词，而不是一个看不懂的相关度分数。"
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#f1dfb8] bg-[#fdf8ec] px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#8a5306]" />
        <span>
          <b className="font-semibold text-ink">哪些是真的，哪些是演示。</b>作业规范、售后政策、产品资料和案例是为演示虚构的。{KNOWLEDGE.filter((d) => d.kind === "regulation").length} 篇法规文档里标着【原文】的段落，逐字摘自官方发布的文本（{KNOWLEDGE.find((d) => d.verifiedAt)?.verifiedAt} 核对，附出处链接）；【客服场景怎么用】是我们的理解，不是法律意见，正式使用前需要法务审核。
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3.5 focus-within:border-[#c3b5f4]">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="像消费者那样提问，例如：A醇 刺痛 能退吗" aria-label="检索知识库" className="h-full flex-1 bg-transparent text-[13.5px] outline-none" />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {KINDS.map((x) => {
              const on = kinds.includes(x.k)
              return (
                <button key={x.k} aria-pressed={on} onClick={() => setKinds(on ? kinds.filter((k) => k !== x.k) : [...kinds, x.k])} className={cn("rounded-full border px-2.5 py-0.5 text-[11.5px]", on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:bg-muted")}>
                  {x.cn}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-line" />
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setQ(e)} className="rounded-full px-2 py-0.5 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-ink">
                {e}
              </button>
            ))}
          </div>

          <div className="mt-4 text-[11.5px] text-muted-foreground">{q.trim() ? (list.length ? `命中 ${list.length} 篇，按相关程度排序` : "没有命中的文档。灵犀遇到这种情况时，不会陈述任何政策、金额或时限。") : `共 ${list.length} 篇`}</div>
          <ul className="mt-2 space-y-2">
            {list.map(({ doc: d, hit }) => (
              <li key={d.id}>
                <button onClick={() => setOpen(d.id)} aria-current={d.id === open} className={cn("w-full rounded-2xl border bg-white p-3.5 text-left transition", d.id === open ? "border-ink shadow-[var(--shadow-lift)]" : "border-line hover:border-[#d9d0f5]")}>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-ink-soft">{KIND_CN[d.kind]}</span>
                    <span className="line-clamp-1 flex-1 text-[13px] font-medium">{d.title}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{d.updatedAt}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{hit ? `“${hit.snippet}”` : d.body}</p>
                  {hit && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="text-[10.5px] text-muted-foreground">命中：</span>
                      {hit.matched.map((m) => (
                        <span key={m} className="rounded bg-[#efe9fb] px-1.5 text-[10.5px] text-[#5b44b5]">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5">
          {doc && (
            <article className="rounded-3xl border border-line bg-white p-6">
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                {doc.kind === "regulation" ? <Landmark className="size-3.5" /> : doc.kind === "product" ? <Package className="size-3.5" /> : <FileText className="size-3.5" />}
                {KIND_CN[doc.kind]} · {doc.source} · 更新于 {doc.updatedAt}
              </div>
              <h2 className="mt-2 font-cn-serif text-[20px] font-semibold">{doc.title}</h2>
              <div className="mt-4 space-y-2.5 text-[13px] leading-[1.9] text-ink-soft">
                {doc.body.split("\n").map((p) => {
                  // regulation documents mark verbatim articles with 【原文…】 and our own reading with 【客服场景怎么用】
                  const m = p.match(/^【(原文[^】]*|客服场景怎么用)】(.*)$/)
                  if (!m) return <p key={p}>{p}</p>
                  const quote = m[1].startsWith("原文")
                  return (
                    <div key={p} className={cn("rounded-xl px-3.5 py-2.5", quote ? "border-l-2 border-[#c3b5f4] bg-porcelain" : "bg-[#fdf8ec]")}>
                      <div className="mb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground">{m[1]}</div>
                      <p className={cn(quote && "font-cn-serif text-ink")}>{m[2]}</p>
                    </div>
                  )
                })}
              </div>
              {doc.refs && (
                <div className="mt-4 rounded-xl border border-line px-3.5 py-2.5 text-[11.5px]">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <BadgeCheck className="size-3.5 text-[#319a56]" />
                    原文已于 {doc.verifiedAt} 对照官方文本核对
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {doc.refs.map((r) => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#5b44b5] hover:underline">
                          {r.label}
                          <ExternalLink className="size-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {doc.tags.map((t) => (
                  <button key={t} onClick={() => setQ(t)} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-ink-soft hover:bg-[#efe9fb]">
                    #{t}
                  </button>
                ))}
              </div>
            </article>
          )}

          <section className="rounded-3xl border border-line bg-white p-6">
            <div className="flex items-center gap-2">
              <BookOpenText className="size-4 text-[#6a52c9]" />
              <h2 className="font-cn-serif text-[16px] font-semibold">产品功效备案</h2>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">「检」会对照这张表检查回复：说到某个产品没有备案的功效，就会拦下来。例如对 A 醇精华说“祛痘”。</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 font-normal">产品</th>
                    <th className="font-normal">备案功效</th>
                    <th className="font-normal">注意事项</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTS.map((p) => (
                    <tr key={p.id} className="border-t border-line align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p.brand}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {p.claims.map((c) => (
                            <span key={c} className="rounded bg-[#e9f5ec] px-1.5 text-[11px] text-[#2c7a3f]">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-[11.5px] text-muted-foreground">
                        {p.strongActive && <span className="mr-1 rounded bg-[#fdf0dc] px-1 text-[10.5px] text-[#8a5306]">强活性成分</span>}
                        {p.cautions.join("；") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-white p-6">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-[#6a52c9]" />
              <h2 className="font-cn-serif text-[16px] font-semibold">补偿权限矩阵</h2>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">工作台上每一项带金额的行动，审批人都按这张表自动判定。</p>
            <ol className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {COMP_MATRIX.map((r, i) => (
                <li key={r.role} className="rounded-xl bg-muted px-3 py-2">
                  <div className="text-[12.5px] font-semibold">{r.role}</div>
                  <div className="text-[11px] text-muted-foreground tabular">{Number.isFinite(r.limit) ? `${i ? `${COMP_MATRIX[i - 1].limit + 1}–` : "≤ "}${r.limit} 元` : `${COMP_MATRIX[i - 1].limit} 元以上`}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
