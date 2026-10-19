"use client"

import { PageHeader } from "@/components/lingxi/shell"
import {
  BATCHES,
  BATCH_ALERT,
  BATCH_ALERT_AT,
  BATCH_BASELINE,
  BATCH_LEAD_HOURS,
  BATCH_TIMELINE,
  BATCH_WATCH,
  EMOTION_WEATHER,
  COUNTERS,
  HEAT,
  RISK_FUNNEL,
  TEAM_LOAD,
  TOPICS,
  WEEKLY_REVIEW_AT,
  buildBrief,
  fmtP,
} from "@/lib/insights"
import { EMOTIONS, EMOTION_ORDER } from "@/lib/constants"
import type { EmotionKey } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Fragment, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, CalendarClock, Copy, EyeOff, FileText, FlaskConical, HeartHandshake, RefreshCw, Table2, Telescope, Users } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { toast } from "sonner"

/* Chart colours. Each ramp was checked with the dataviz palette validator:
 *  · emotion hues in the fixed order anger→gratitude (adjacent CVD ΔE ≥ 9.1, normal vision ≥ 16.4)
 *  · one-hue violet ramp for magnitude (heatmap), with a lighter step of the same hue as meter track
 *  · rose ↔ blue diverging pair around a neutral grey midpoint (sentiment)
 * Text always wears ink tokens; colour lives in the mark beside it. */
const SEQ = ["#f2f0ff", "#dbd6f5", "#c1bae8", "#a59bd6", "#8b7cc5", "#6f5bb0", "#55389a"]
const ACCENT = "#6a52c9"
const ACCENT_TRACK = "#e7e2f8"
const NEG = "#d0587e"
const POS = "#3f86c8"
const CRITICAL = "#d03b3b"
const WARNING = "#c27410"
const GRID = "#ece9e3"
const AXIS = "#8b8894"
const BASELINE = "#d6d3cc"
const TEXT_GOOD = "text-[#2c7a3f]"
const TEXT_BAD = "text-[#a32626]"

function Card({ title, en, children, className, right }: { title: string; en?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <figure className={cn("rounded-3xl border border-line bg-white p-5", className)}>
      <figcaption className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-cn-serif text-[15px] font-semibold text-ink">{title}</div>
          {en && <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{en}</div>}
        </div>
        {right}
      </figcaption>
      {children}
    </figure>
  )
}

function TableToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={cn("flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px]", on ? "bg-ink text-white" : "text-muted-foreground hover:bg-muted")}
    >
      <Table2 className="size-3.5" />
      {on ? "图表" : "表格"}
    </button>
  )
}

function StatTile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-sans text-[28px] font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[13px] text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  )
}

/** Direct label on the last point only (selective labelling — never a number on every point). */
type LabelArgs = { index?: number; x?: number | string; y?: number | string; value?: unknown }
function endLabel(lastIndex: number, suffix: string) {
  const render = (p: LabelArgs) =>
    p.index === lastIndex ? (
      <text x={Number(p.x ?? 0) + 8} y={Number(p.y ?? 0) + 4} fontSize={11} fill="#16151c" fontWeight={600}>
        {String(p.value)}
        {suffix}
      </text>
    ) : (
      <g />
    )
  return render
}


type BatchRow = (typeof BATCH_TIMELINE)[number]
function BatchTip({ active, payload, label }: { active?: boolean; payload?: { payload: BatchRow }[]; label?: string }) {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  return (
    <div className="min-w-[176px] rounded-xl border border-line bg-white/95 px-3 py-2 shadow-[var(--shadow-lift)] backdrop-blur">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold text-ink tabular">{d.rolling} 起</span>
        <span className="text-[11px] text-muted-foreground">滚动 72h 累计</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        本时段新增 {d.count} 起 · {fmtP(d.p)}
      </div>
    </div>
  )
}

function BatchAnomaly() {
  const [table, setTable] = useState(false)
  const anomaly = BATCHES.find((b) => b.status === "anomaly")!
  const alertPoint = BATCH_TIMELINE[BATCH_ALERT_AT]
  const last = BATCH_TIMELINE.length - 1
  const dayTicks = BATCH_TIMELINE.filter((d) => d.t.endsWith("00:00")).map((d) => d.t)
  const dayFmt = (t: string) => t.split(" ")[0]
  return (
    <Card
      title="批次异常雷达"
      en={`${anomaly.batch} · ${anomaly.product} · 滚动 72 小时刺痛类反馈累计，对照泊松基线与显著性阈值`}
      className="col-span-12 xl:col-span-8"
      right={<TableToggle on={table} set={setTable} />}
    >
      {table ? (
        <div className="scrollbar-thin max-h-[404px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 font-normal">时间（每 4 小时）</th>
                <th className="font-normal">本时段新增</th>
                <th className="font-normal">滚动 72h 累计</th>
                <th className="font-normal">显著性</th>
                <th className="font-normal">状态</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {BATCH_TIMELINE.map((d) => (
                <tr key={d.t} className="border-t border-line">
                  <td className="py-1">{d.t}</td>
                  <td>{d.count}</td>
                  <td className={cn(d.state === "alert" && "font-semibold")}>{d.rolling}</td>
                  <td>{fmtP(d.p)}</td>
                  <td>{d.state === "alert" ? "▲ 预警" : d.state === "watch" ? "● 关注" : "正常"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="h-[316px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 300 }}>
              <LineChart data={BATCH_TIMELINE} margin={{ top: 8, right: 136, left: -22, bottom: 0 }} syncId="batch">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" ticks={dayTicks} tickFormatter={dayFmt} tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: BASELINE }} />
                <YAxis domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={false} />
                <ReferenceArea
                  x1={alertPoint.t}
                  x2={BATCH_TIMELINE[last].t}
                  fill={CRITICAL}
                  fillOpacity={0.06}
                  label={{ value: `▲ ${alertPoint.t} 预警`, position: "insideTopLeft", fontSize: 11, fontWeight: 600, fill: "#16151c", offset: 8 }}
                />
                <ReferenceLine y={BATCH_ALERT} stroke={CRITICAL} strokeWidth={1} strokeDasharray="4 3" label={{ value: `预警线 ${BATCH_ALERT} 起 · p<0.001`, position: "right", fontSize: 10.5, fill: "#3a3844" }} />
                <ReferenceLine y={BATCH_WATCH} stroke={WARNING} strokeWidth={1} strokeDasharray="4 3" label={{ value: `关注线 ${BATCH_WATCH} 起 · p<0.05`, position: "right", fontSize: 10.5, fill: "#3a3844" }} />
                <ReferenceLine y={BATCH_BASELINE} stroke="#b9b5ad" strokeWidth={1} label={{ value: `泊松基线 λ = ${BATCH_BASELINE}`, position: "right", fontSize: 10.5, fill: "#6f6c78" }} />
                <Tooltip content={<BatchTip />} cursor={{ stroke: "#c9c5bd", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="rolling"
                  name="滚动 72h 累计"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                  label={endLabel(last, " 起")}
                  isAnimationActive={false}
                />
                <ReferenceDot x={alertPoint.t} y={alertPoint.rolling} r={5} fill={CRITICAL} stroke="#fff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 pl-1 text-[11px] text-muted-foreground">每 4 小时新增反馈（起）</div>
          <div className="h-[104px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 300 }}>
              <BarChart data={BATCH_TIMELINE} margin={{ top: 6, right: 136, left: -22, bottom: 0 }} syncId="batch" barCategoryGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" ticks={dayTicks} tickFormatter={dayFmt} tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: BASELINE }} />
                <YAxis domain={[0, 2]} ticks={[0, 1, 2]} tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#16151c", fillOpacity: 0.05 }} content={() => null} />
                <Bar dataKey="count" name="本时段新增" fill="#8975ce" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "近 72h 反馈", v: `${anomaly.complaints72h} 起` },
          { k: "泊松基线 λ", v: `${anomaly.baseline} 起` },
          { k: "超出基线", v: `${anomaly.ratio}×` },
          { k: "显著性", v: fmtP(anomaly.pValue) },
        ].map((x) => (
          <div key={x.k} className="rounded-xl bg-muted/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{x.k}</div>
            <div className="text-[15px] font-semibold text-ink">{x.v}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function BatchTable() {
  return (
    <Card title="批次健康度" en="近 72h 反馈 ÷ 泊松基线 λ · p < 0.05 关注 · p < 0.001 异常" className="col-span-12 xl:col-span-4">
      <div className="space-y-2">
        {BATCHES.map((b) => {
          const pct = Math.min(1, b.ratio / 5)
          const tone = b.status === "anomaly" ? CRITICAL : b.status === "watch" ? WARNING : "#8975ce"
          return (
            <div key={b.batch} className="rounded-xl border border-line px-3 py-2.5" tabIndex={0} title={`${b.batch}：72h ${b.complaints72h} 起 / 基线 ${b.baseline}，${fmtP(b.pValue)}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold">{b.batch}</span>
                <span className="line-clamp-1 flex-1 text-[11px] text-muted-foreground">{b.product}</span>
                {b.status === "anomaly" ? (
                  <span className="flex items-center gap-1 rounded-md bg-[#fbe6e6] px-1.5 py-0.5 text-[10px] font-semibold text-[#a32626]">
                    <AlertTriangle className="size-3" />
                    异常
                  </span>
                ) : b.status === "watch" ? (
                  <span className="rounded-md bg-[#fdf0dc] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5306]">● 关注</span>
                ) : (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">正常</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative h-1.5 flex-1 rounded-full" style={{ background: `${tone}22` }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} className="h-1.5 rounded-full" style={{ background: tone }} />
                  <div className="absolute -top-0.5 left-[20%] h-2.5 w-px bg-ink/45" />
                </div>
                <span className="w-[104px] text-right text-[11px] text-ink tabular">
                  {b.complaints72h} / {b.baseline} · <b className="font-semibold">{b.ratio}×</b>
                </span>
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">主要症状：{b.topSymptom}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="inline-block h-2.5 w-px bg-ink/45" />
        竖线为基线 1×，条长上限 5×
      </div>
    </Card>
  )
}

/** One emotion = one small panel on a shared y-scale, so eight series never fight in one plot. */
function EmoPanel({ k, idx, hover, setHover, yMax }: { k: EmotionKey; idx: number; hover: number | null; setHover: (i: number | null) => void; yMax: number }) {
  const e = EMOTIONS[k]
  const data = EMOTION_WEATHER.map((d) => d[k])
  const n = data.length
  const x = (i: number) => (i / (n - 1)) * 100
  const y = (v: number) => 100 - (Math.min(v, yMax) / yMax) * 100
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ")
  const cur = data[idx]
  const delta = Math.round((data[n - 1] - data[0]) * 10) / 10
  const worse = e.valence < 0 ? delta > 0 : delta < 0
  return (
    <div
      tabIndex={0}
      aria-label={`${e.cn} ${EMOTION_WEATHER[idx].day} 占比 ${cur.toFixed(1)}%，14 天变化 ${delta} 个百分点`}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:ring-offset-4"
      onKeyDown={(ev) => {
        if (ev.key === "ArrowLeft") setHover(Math.max(0, idx - 1))
        if (ev.key === "ArrowRight") setHover(Math.min(n - 1, idx + 1))
      }}
      onBlur={() => setHover(null)}
    >
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: e.color }} />
        <span className="text-[12px] text-ink-soft">{e.cn}</span>
        <span className="ml-auto text-[13px] font-semibold text-ink tabular">{cur.toFixed(1)}%</span>
      </div>
      <div
        className="relative mt-1.5 h-[76px] cursor-crosshair touch-none"
        onPointerMove={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect()
          setHover(Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left) / r.width) * (n - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1="0" y1="50" x2="100" y2="50" stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="100" x2="100" y2="100" stroke={BASELINE} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={`${line} L 100 100 L 0 100 Z`} fill={e.color} fillOpacity={0.1} />
          <path d={line} fill="none" stroke={e.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover !== null && <span className="absolute top-0 bottom-0 w-px bg-[#b9b5ad]" style={{ left: `${x(idx)}%` }} />}
        <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${x(idx)}%`, top: `${y(cur)}%`, background: e.color }} />
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
        14 天
        <span className={cn("font-medium", delta === 0 ? "text-muted-foreground" : worse ? TEXT_BAD : TEXT_GOOD)}>
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}
          {Math.abs(delta).toFixed(1)}pt
        </span>
      </div>
    </div>
  )
}

const EMO_Y_MAX = Math.ceil(Math.max(...EMOTION_WEATHER.flatMap((d) => EMOTION_ORDER.map((k) => d[k]))) / 10) * 10

function EmotionWeather() {
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const n = EMOTION_WEATHER.length
  const idx = hover ?? n - 1
  const row = EMOTION_WEATHER[idx]
  return (
    <Card
      title="情绪天气"
      en={`全渠道会话的情绪占比 · 近 14 天 · 八种情绪各占一格，共用纵轴 0–${EMO_Y_MAX}%`}
      className="col-span-12 xl:col-span-7"
      right={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground tabular">{hover === null ? `今日 ${row.day}` : row.day}</span>
          <TableToggle on={table} set={setTable} />
        </div>
      }
    >
      {table ? (
        <div className="scrollbar-thin max-h-[330px] overflow-auto">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-white text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 font-normal">日期</th>
                {EMOTION_ORDER.map((k) => (
                  <th key={k} className="font-normal">
                    {EMOTIONS[k].cn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {EMOTION_WEATHER.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1">{d.day}</td>
                  {EMOTION_ORDER.map((k) => (
                    <td key={k}>{d[k]}%</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={`${row.day} 情绪构成`}>
            {EMOTION_ORDER.map((k) => (
              <div
                key={k}
                className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                style={{ flex: `${row[k]} 1 0%`, background: EMOTIONS[k].color }}
                title={`${EMOTIONS[k].cn} ${row[k]}%`}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[10.5px] text-muted-foreground">{row.day} 的情绪构成（合计 100%）</div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 md:grid-cols-4">
            {EMOTION_ORDER.map((k) => (
              <EmoPanel key={k} k={k} idx={idx} hover={hover} setHover={setHover} yMax={EMO_Y_MAX} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted-foreground">
            <span>
              {EMOTION_WEATHER[0].day} → {EMOTION_WEATHER[n - 1].day}
            </span>
            <span>悬停或聚焦后按 ← → 逐日查看</span>
          </div>
        </>
      )}
    </Card>
  )
}

function Topics() {
  return (
    <Card title="话题聚类 · 消费者之声" en="近 7 天会话量、趋势与情绪效价（−1 负面 … +1 正面）" className="col-span-12 xl:col-span-5">
      <div className="space-y-0.5">
        <div className="grid grid-cols-[1fr_52px_86px_116px] gap-2 px-2 pb-1.5 text-[10.5px] text-muted-foreground">
          <span>话题</span>
          <span className="text-right">会话量</span>
          <span className="text-center">7 日趋势</span>
          <span className="text-right">情绪效价</span>
        </div>
        {TOPICS.map((t) => {
          const max = Math.max(...t.trend)
          const pts = t.trend.map((v, i) => `${(i / (t.trend.length - 1)) * 78 + 4},${23 - (v / max) * 18}`).join(" ")
          const neg = t.sentiment < 0
          return (
            <div
              key={t.topic}
              tabIndex={0}
              title={`${t.topic}：${t.volume} 次会话，情绪效价 ${t.sentiment}`}
              className="grid grid-cols-[1fr_52px_86px_116px] items-center gap-2 rounded-xl px-2 py-2 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
            >
              <div>
                <div className="text-[12.5px] font-medium">{t.topic}</div>
                <div className="text-[10.5px] text-muted-foreground">回流：{t.owner}</div>
              </div>
              <div className="text-right text-[12px] tabular">{t.volume.toLocaleString()}</div>
              <svg width={86} height={28} className="mx-auto" aria-hidden>
                <polyline points={pts} fill="none" stroke="#c1bae8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={82} cy={23 - (t.trend.at(-1)! / max) * 18} r={4} fill={ACCENT} stroke="#fff" strokeWidth={2} />
              </svg>
              <div className="flex items-center justify-end gap-2">
                <div className="relative h-1.5 w-16 rounded-full bg-[#eceae4]">
                  <span
                    className="absolute top-0 h-1.5 rounded-full"
                    style={neg ? { right: "50%", width: `${Math.abs(t.sentiment) * 50}%`, background: NEG } : { left: "50%", width: `${t.sentiment * 50}%`, background: POS }}
                  />
                  <span className="absolute -top-[3px] left-1/2 h-3 w-px bg-ink/45" />
                </div>
                <span className="w-9 text-right text-[12px] font-semibold text-ink tabular">
                  {t.sentiment > 0 ? "+" : "−"}
                  {Math.abs(t.sentiment).toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ background: NEG }} />
          负面
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ background: POS }} />
          正面
        </span>
        <span className="ml-auto">每个话题自动回流到对应负责部门</span>
      </div>
    </Card>
  )
}

function Heatmap() {
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
  const hours = Array.from({ length: 16 }, (_, i) => i + 8)
  const max = Math.max(...HEAT.map((h) => h.value))
  const [hover, setHover] = useState<{ day: string; hour: number; value: number } | null>(null)
  return (
    <Card title="高压时段热力" en="负面情绪会话密度指数 · 按星期 × 小时 · 用于排班与坐席守护" className="col-span-12 xl:col-span-7">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[40px_repeat(16,1fr)] gap-[2px]">
            <span />
            {hours.map((h) => (
              <span key={h} className="pb-0.5 text-center text-[10px] text-muted-foreground tabular">
                {h % 2 === 0 ? `${h}时` : ""}
              </span>
            ))}
            {days.map((d) => (
              <Fragment key={d}>
                <span className="pr-1 text-right text-[10.5px] leading-[26px] text-muted-foreground">{d}</span>
                {hours.map((h) => {
                  const cell = HEAT.find((x) => x.day === d && x.hour === h)!
                  const idx = Math.min(SEQ.length - 1, Math.floor((cell.value / max) * SEQ.length))
                  return (
                    <span
                      key={`${d}-${h}`}
                      tabIndex={0}
                      aria-label={`${d} ${h} 时 指数 ${cell.value.toFixed(2)}`}
                      onMouseEnter={() => setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(cell)}
                      onBlur={() => setHover(null)}
                      className="h-[26px] rounded-[4px] outline-none transition hover:ring-2 hover:ring-ink/35 focus-visible:ring-2 focus-visible:ring-ink/45"
                      style={{ background: SEQ[idx] }}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          低
          {SEQ.map((c) => (
            <span key={c} className="h-2.5 w-5 rounded-[3px] ring-1 ring-black/5" style={{ background: c }} />
          ))}
          高
        </div>
        <div className="tabular">{hover ? `${hover.day} ${hover.hour}:00 · 密度指数 ${hover.value.toFixed(2)}` : "悬停或聚焦单元格查看数值"}</div>
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-muted/70 px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
        <span>
          <b className="font-semibold text-ink">排班建议</b>：负面会话集中在每晚 20–22 时与周末午间。建议该时段增配 2 名资深坐席，并把连续高压接待上限设为 6 单，超过后由「护」自动安排 5 分钟静音时刻。
        </span>
      </div>
    </Card>
  )
}

/** Renders the brief without innerHTML: “**bold**” spans and “1. ” list markers only. */
function RichLine({ text }: { text: string }) {
  const clean = text.replace(/^#+\s*/, "").replace(/^[-•]\s+/, "")
  const m = clean.match(/^(\d+)[.、]\s*(.*)$/)
  const parts = (m ? m[2] : clean).split(/\*\*(.+?)\*\*/g)
  return (
    <p className="flex gap-2">
      {m && <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded bg-ink font-mono text-[10px] text-white">{m[1]}</span>}
      <span>
        {parts.map((p, i) =>
          i % 2 ? (
            <b key={i} className="font-semibold text-ink">
              {p}
            </b>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          ),
        )}
      </span>
    </p>
  )
}

function VocReport() {
  const [report, setReport] = useState(buildBrief)
  const [source, setSource] = useState<"template" | "llm">("template")
  const [loading, setLoading] = useState(false)
  const regenerate = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/insights", { method: "POST" }).then((x) => x.json())
      setReport(r.report)
      setSource(r.source === "llm" ? "llm" : "template")
      if (r.source === "llm") toast.success("已由大模型根据上方指标改写")
      else toast(r.fallback ? "大模型没有返回结果，保留模板简报" : "没有配置大模型，简报由模板根据指标生成")
    } catch {
      toast.error("生成失败，已保留上一版简报")
    } finally {
      setLoading(false)
    }
  }
  return (
    <Card
      title="察 · 本周 VOC 简报"
      en={source === "llm" ? "由大模型根据上方指标改写" : "由模板根据上方指标自动生成，数字与图表同源"}
      className="col-span-12 xl:col-span-5"
      right={
        <button onClick={regenerate} disabled={loading} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-60">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          重新生成
        </button>
      }
    >
      <div className={cn("space-y-2.5 text-[12.5px] leading-[1.85] text-ink-soft transition-opacity", loading && "opacity-50")}>
        {report
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l, i) => (
            <RichLine key={i} text={l} />
          ))}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="line-clamp-1 text-[11px] text-muted-foreground">关联会诊决议 #H-0611</span>
        <button
          onClick={() => {
            const plain = report.replace(/\*\*/g, "")
            if (!navigator.clipboard) return toast.error("当前浏览器不支持一键复制，请手动选择文本")
            navigator.clipboard.writeText(plain).then(
              () => toast.success("简报已复制"),
              () => toast.error("复制失败，请手动选择文本"),
            )
          }}
          className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-ink"
        >
          <Copy className="size-3" />
          复制
        </button>
        <Link href="/huddle" className="flex items-center gap-1 text-[11px] font-medium text-ink">
          <Users className="size-3" />
          查看会诊
        </Link>
      </div>
    </Card>
  )
}

/** A handful of ordered headline numbers: each step shows its share of the step before it. */
function RiskFunnel() {
  return (
    <Card title="风险处置漏斗" en="本周 · 每一步占上一步的比例" className="col-span-12 lg:col-span-6 xl:col-span-4">
      <div className="space-y-2.5">
        {RISK_FUNNEL.map((f, i) => {
          const prev = RISK_FUNNEL[i - 1]
          const rate = prev ? f.value / prev.value : 1
          return (
            <div key={f.stage} className="grid grid-cols-[70px_1fr_52px] items-center gap-3" tabIndex={0} title={prev ? `${f.stage} ${f.value}，占「${prev.stage}」的 ${(rate * 100).toFixed(1)}%` : `${f.stage} ${f.value}`}>
              <span className="text-[12px] text-ink-soft">{f.stage}</span>
              {prev ? (
                <div>
                  <div className="h-2 rounded-full" style={{ background: ACCENT_TRACK }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${rate * 100}%` }} transition={{ delay: i * 0.08, type: "spring", stiffness: 90, damping: 18 }} className="h-2 rounded-full" style={{ background: ACCENT }} />
                  </div>
                  <div className="mt-1 text-[10.5px] text-muted-foreground tabular">占上一步 {(rate * 100).toFixed(1)}%</div>
                </div>
              ) : (
                <div className="text-[10.5px] text-muted-foreground">全渠道会话中识别到的全部风险信号</div>
              )}
              <span className="text-right text-[15px] font-semibold text-ink">{f.value.toLocaleString()}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        {RISK_FUNNEL[2].value} 起高危个案中有 {RISK_FUNNEL[3].value} 起进入跨部门会诊，{RISK_FUNNEL[4].value} 起已闭环；剩余 {RISK_FUNNEL[3].value - RISK_FUNNEL[4].value} 起仍在处置中。
      </div>
    </Card>
  )
}

function TeamLoad() {
  return (
    <Card title="护 · 坐席情绪负荷" en="当班团队压力指数（0–100）· 双向共情的另一半" className="col-span-12 xl:col-span-4" right={<HeartHandshake className="size-4 shrink-0 text-[#d0688b]" />}>
      <div className="space-y-3">
        {TEAM_LOAD.map((m) => {
          const level = m.stress >= 70 ? { tone: CRITICAL, cn: "▲ 高压" } : m.stress >= 55 ? { tone: WARNING, cn: "● 偏高" } : { tone: "#8975ce", cn: "平稳" }
          return (
            <div key={m.name} className="grid grid-cols-[40px_1fr_28px] items-center gap-2.5" tabIndex={0} title={`${m.name}：压力 ${m.stress}，高压会话 ${m.hard} 单，已屏蔽攻击性词汇 ${m.shielded} 处`}>
              <span className="text-[12.5px] font-medium">{m.name}</span>
              <div>
                <div className="h-2 rounded-full" style={{ background: `${level.tone}22` }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${m.stress}%` }} className="h-2 rounded-full" style={{ background: level.tone }} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <span className="text-ink-soft">{level.cn}</span>
                  <span>高压 {m.hard} 单</span>
                  <span className="flex items-center gap-0.5">
                    <EyeOff className="size-3" />
                    屏蔽 {m.shielded}
                  </span>
                </div>
              </div>
              <span className="text-right text-[13px] font-semibold text-ink tabular">{m.stress}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        压力指数随坐席接待的负面情绪累加，休息后回落。超过 70 时，「护」会提醒本人和组长。
      </div>
    </Card>
  )
}

const ANOMALY = BATCHES.find((b) => b.status === "anomaly")!

export default function InsightsPage() {
  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="察 · Insighter"
        title="洞察驾驶舱"
        desc="从一万次对话里看见趋势：批次异常、情绪天气与话题聚类，把一线的「服务共情」回流为产品、研发与供应链的「产品共情」。"
      >
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] text-muted-foreground">
          <CalendarClock className="size-3.5" />
          统计窗口 2026/9/28 – 10/11 · 全渠道
        </div>
      </PageHeader>
      <div className="px-8">
        <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-2.5 text-[12px] leading-relaxed text-ink-soft">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-[#6a52c9]" />
          <span>
            <b className="font-semibold text-ink">本页数据为模拟数据。</b>投诉数、情绪占比、话题与运营计数都由固定种子生成，用来展示分析方法；泊松检验、预警阈值和预警时间是对这些数据的真实计算。本页不包含任何产品效果的测量——灵犀还没有经过试点。
          </span>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#f1c9c9] bg-[#fdf4f3] px-4 py-3">
          <Telescope className="size-4 shrink-0 text-[#a32626]" />
          <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-soft">
            <b className="font-semibold text-ink">批次 {ANOMALY.batch} 预警</b>：近 72 小时刺痛类反馈 {ANOMALY.complaints72h} 起，是泊松基线的 {ANOMALY.ratio} 倍（p &lt; 0.001）。滚动累计在 {BATCH_TIMELINE[BATCH_ALERT_AT].t} 达到 {BATCH_ALERT} 起时就已自动预警，比假设的每周一 {WEEKLY_REVIEW_AT.getHours()}:00 人工质量复盘
            <b className="font-semibold text-ink">早 {BATCH_LEAD_HOURS} 小时</b>。
          </div>
          <Link href="/huddle" className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-medium text-white">
            进入会诊
          </Link>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="今日会话" value={COUNTERS.conversations.toLocaleString()} note="全渠道" />
          <StatTile label="L3 及以上风险" value={`${COUNTERS.highRisk}`} unit="起" note="本周" />
          <StatTile label="跨部门会诊" value={`${COUNTERS.huddles}`} unit="次" note="本周" />
          <StatTile label="批次预警" value={`${BATCHES.filter((b) => b.status !== "normal").length}`} unit="个" note={`${BATCHES.filter((b) => b.status === "anomaly").length} 个异常 · 其余关注`} />
          <StatTile label="以草稿起笔的回复" value={`${Math.round(COUNTERS.draftsAdopted * 100)}`} unit="%" note={`其中 ${Math.round(COUNTERS.draftsEdited * 100)}% 由坐席修改后发送`} />
          <StatTile label="发送前拦截" value={`${COUNTERS.blockedBeforeSend}`} unit="次" note="合规规则拦截" />
        </div>
        <div className="grid grid-cols-12 gap-5">
          <BatchAnomaly />
          <BatchTable />
          <EmotionWeather />
          <Topics />
          <Heatmap />
          <VocReport />
          <RiskFunnel />
          <TeamLoad />
        </div>
      </div>
    </div>
  )
}
