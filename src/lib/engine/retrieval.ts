import type { Citation, KnowledgeDoc, Product } from "../types"
import { KNOWLEDGE, PRODUCTS } from "../data"

/**
 * 典 · Scholar — keyword retrieval over the knowledge base: BM25 on CJK character bigrams, with a
 * boost for documents whose tags appear in the query or match the detected intent.
 * There is no embedding model here. Results carry the terms that matched instead of a relevance
 * score, so a reader can see why a document was returned.
 */

const STOP = new Set("的了是我你他她它们这那和与及或在有也都就还很吗呢吧啊呀哦嘛么".split(""))

function tokenize(text: string): string[] {
  const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")
  const tokens: string[] = []
  for (const seg of clean.split(/\s+/).filter(Boolean)) {
    if (/^[a-z0-9]+$/.test(seg)) {
      tokens.push(seg)
      continue
    }
    const chars = [...seg].filter((c) => !STOP.has(c))
    for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1])
    if (chars.length === 1) tokens.push(chars[0])
  }
  return tokens
}

interface Indexed {
  doc: KnowledgeDoc
  text: string
  tf: Map<string, number>
  len: number
}

/** A document's searchable text: its body, or its clauses with the situations they apply to. */
const docText = (doc: KnowledgeDoc) => doc.body || (doc.clauses ?? []).map((c) => `${c.title}：${c.applies}。${c.text}`).join("\n")

const INDEX: Indexed[] = KNOWLEDGE.map((doc) => {
  const text = `${doc.title} ${doc.tags.join(" ")} ${docText(doc)}`
  const toks = tokenize(`${doc.title} ${text}`) // title counted twice
  const tf = new Map<string, number>()
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
  return { doc, text, tf, len: toks.length }
})

const AVG_LEN = INDEX.reduce((s, d) => s + d.len, 0) / INDEX.length
const DF = new Map<string, number>()
for (const d of INDEX) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) ?? 0) + 1)

/** Human-readable terms a match can be explained with: every tag, plus product names. */
const VOCAB = [...new Set([...KNOWLEDGE.flatMap((d) => d.tags), ...PRODUCTS.flatMap((p) => p.aliases)])].sort((a, b) => b.length - a.length)

const idf = (t: string) => {
  const n = DF.get(t) ?? 0
  return Math.log(1 + (INDEX.length - n + 0.5) / (n + 0.5))
}

function bestSnippet(body: string, qTokens: Set<string>): string {
  const sentences = body
    .split(/(?<=[。；\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
  let best = sentences[0] ?? body
  let bestScore = -1
  for (const s of sentences) {
    const toks = tokenize(s)
    const score = toks.filter((t) => qTokens.has(t)).length / Math.sqrt(toks.length + 1)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best.length > 96 ? best.slice(0, 94) + "…" : best
}

/** For a clause-structured document: the clause that matches the query best (its whole text is returned, not a cut sentence). */
function bestClause(doc: KnowledgeDoc, q: Set<string>) {
  if (!doc.clauses?.length) return undefined
  let best = doc.clauses[0]
  let bestScore = -1
  for (const c of doc.clauses) {
    const toks = tokenize(`${c.title} ${c.applies} ${c.text}`)
    const score = toks.filter((t) => q.has(t)).length / Math.sqrt(toks.length + 1)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

export interface RetrieveOptions {
  k?: number
  kinds?: KnowledgeDoc["kind"][]
  /** tags implied by the detected intent — documents carrying them rank higher */
  boostTags?: string[]
  /** when the product is known, product sheets about other products are left out */
  product?: Product
}

/** A result must score at least this share of the best result — keeps one-word coincidences out. */
const RELATIVE_CUTOFF = 0.45

export function retrieve(query: string, opts: RetrieveOptions = {}): Citation[] {
  const q = new Set(tokenize(query))
  if (!q.size) return []
  const k1 = 1.4
  const b = 0.72

  const p = opts.product
  const pool = INDEX.filter((d) => (!opts.kinds || opts.kinds.includes(d.doc.kind)) && (d.doc.kind !== "product" || !p || p.aliases.some((a) => d.text.includes(a))))
  const scored = pool.map((d) => {
    let s = 0
    for (const t of q) {
      const f = d.tf.get(t)
      if (f) s += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / AVG_LEN)))
    }
    const tagHits = d.doc.tags.filter((tag) => query.includes(tag))
    const boostHits = d.doc.tags.filter((tag) => opts.boostTags?.includes(tag) && !tagHits.includes(tag))
    s += tagHits.length * 2.2 + boostHits.length * 1.6
    const termHits = VOCAB.filter((term) => query.includes(term) && d.text.includes(term) && !tagHits.includes(term))
    return { d, s, matched: [...tagHits, ...termHits, ...boostHits.map((t) => `${t}（按意图）`)] }
  })

  const top = Math.max(0, ...scored.map((x) => x.s))
  return scored
    .filter((x) => x.s > 1.2 && x.s >= top * RELATIVE_CUTOFF && x.matched.length > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.k ?? 3)
    .map(({ d, matched }) => {
      const clause = bestClause(d.doc, q)
      return clause
        ? { docId: d.doc.id, clauseId: clause.id, version: d.doc.updatedAt, applies: clause.applies, title: `${d.doc.title} · ${clause.title}`, kind: d.doc.kind, snippet: clause.text, matched: matched.slice(0, 4) }
        : { docId: d.doc.id, version: d.doc.updatedAt, title: d.doc.title, kind: d.doc.kind, snippet: bestSnippet(d.doc.body, q), matched: matched.slice(0, 4) }
    })
}

/** Plain search for the knowledge page: same ranking, no intent boost, more results. */
export function search(query: string, kinds?: KnowledgeDoc["kind"][]): Citation[] {
  return retrieve(query, { k: 8, kinds })
}
