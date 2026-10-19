"use client"

import "@xyflow/react/dist/style.css"
import { Background, BackgroundVariant, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/lingxi/shell"
import { AGENTS, AGENT_MAP, PHASES } from "@/lib/constants"
import { CONSTITUTION_RULES } from "@/lib/engine/prompts"
import type { AgentDef, AgentId } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ArrowRight, Cpu, GitBranch, Hammer, Layers, ScrollText, ShieldCheck, Timer, UserRound, Wrench } from "lucide-react"
import { motion } from "motion/react"

const MODEL_LABEL: Record<AgentDef["model"], string> = {
  flagship: "大模型 · 主力",
  fast: "大模型 · 轻量",
  vision: "视觉大模型",
  rule: "规则引擎",
  hybrid: "规则 + 大模型",
  embed: "混合检索",
}

type AgentNodeData = { agent: AgentDef; selected: boolean }
type EndNodeData = { title: string; sub: string; dark?: boolean }

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const a = data.agent
  return (
    <div
      className={cn(
        "flex w-[176px] items-center gap-2.5 rounded-2xl border bg-white px-3 py-2.5 transition-shadow",
        data.selected ? "border-transparent shadow-[var(--shadow-float)]" : "border-line shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)]",
      )}
      style={data.selected ? { boxShadow: `0 0 0 2px ${a.color}, 0 18px 40px -18px ${a.color}` } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-[#cfcbd8]" />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full font-cn-serif text-[16px] font-semibold text-white" style={{ background: a.color }}>
        {a.glyph}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] leading-tight font-semibold text-ink">{a.cn.split(" · ")[1]}</div>
        <div className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">{MODEL_LABEL[a.model]}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-[#cfcbd8]" />
    </div>
  )
}

function EndNode({ data }: NodeProps<Node<EndNodeData>>) {
  return (
    <div className={cn("flex w-[150px] flex-col items-center rounded-2xl px-3 py-3 text-center", data.dark ? "bg-ink text-porcelain" : "border border-dashed border-[#cfcbd8] bg-white/70")}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-[#cfcbd8]" />
      <UserRound className="size-4 opacity-70" />
      <div className="mt-1 font-cn-serif text-[13.5px] font-semibold">{data.title}</div>
      <div className={cn("mt-0.5 text-[10.5px] leading-snug", data.dark ? "text-porcelain/60" : "text-muted-foreground")}>{data.sub}</div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-[#cfcbd8]" />
    </div>
  )
}

function PhaseLabel({ data }: NodeProps<Node<{ cn: string; en: string; desc: string }>>) {
  return (
    <div className="pointer-events-none w-[176px]">
      <div className="flex items-baseline gap-1.5">
        <span className="font-cn-serif text-[15px] font-semibold text-ink">{data.cn}</span>
        <span className="font-serif text-[12px] text-muted-foreground italic">{data.en}</span>
      </div>
      <div className="mt-0.5 text-[10.5px] tracking-wide text-muted-foreground">{data.desc}</div>
    </div>
  )
}

function Note({ data }: NodeProps<Node<{ text: string }>>) {
  return <div className="pointer-events-none w-[150px] text-[10.5px] leading-snug text-muted-foreground">{data.text}</div>
}

function Lane() {
  return <div className="pointer-events-none h-px w-[1254px] border-t border-dashed border-[#d6d3cc]" />
}

const nodeTypes = { agent: AgentNode, end: EndNode, phase: PhaseLabel, lane: Lane, note: Note }

const COL = { perceive: 0, fuse: 226, decide: 452, guard: 678 } as const
const POS: Record<AgentId, [number, number]> = {
  vision: [COL.perceive, 60],
  empath: [COL.perceive, 150],
  intent: [COL.perceive, 240],
  sentinel: [COL.perceive, 330],
  memory: [COL.perceive, 420],
  scholar: [COL.fuse, 150],
  strategist: [COL.fuse, 300],
  scribe: [COL.decide, 225],
  auditor: [COL.guard, 150],
  guardian: [COL.guard, 300],
  moderator: [COL.guard, 420],
  // learning layer sits on its own lane: 察 feeds the sentinel from the left, 练 trains the human on the right
  insighter: [-200, 536],
  coach: [COL.guard, 536],
}

const FLOW: [string, string, string?][] = [
  ["consumer", "vision"],
  ["consumer", "empath"],
  ["consumer", "intent"],
  ["consumer", "sentinel"],
  ["vision", "scholar"],
  ["intent", "scholar"],
  ["sentinel", "scholar"],
  ["empath", "strategist"],
  ["sentinel", "strategist"],
  ["memory", "strategist"],
  ["scholar", "strategist"],
  ["strategist", "scribe"],
  ["scribe", "auditor"],
  ["auditor", "human"],
  ["guardian", "human"],
  ["strategist", "moderator", "风险 ≥ L3"],
  ["moderator", "human"],
  ["insighter", "sentinel"],
  ["coach", "human", "陪练"],
]

export default function AgentsPage() {
  const [sel, setSel] = useState<AgentId>("sentinel")
  const agent = AGENT_MAP[sel]

  const nodes = useMemo<Node[]>(() => {
    const labels: Node[] = (["perceive", "fuse", "decide", "guard"] as const).map((p) => ({
      id: `phase-${p}`,
      type: "phase",
      position: { x: COL[p], y: -10 },
      data: { cn: PHASES[p].cn, en: PHASES[p].en, desc: PHASES[p].desc },
      draggable: false,
      selectable: false,
    }))
    labels.push({ id: "note-batch", type: "note", position: { x: -196, y: 452 }, data: { text: "批次异常回流到风险研判" }, draggable: false, selectable: false })
    labels.push({ id: "lane-learn", type: "lane", position: { x: -200, y: 506 }, data: {}, draggable: false, selectable: false, zIndex: -1 })
    labels.push({ id: "phase-learn", type: "phase", position: { x: COL.fuse, y: 540 }, data: { cn: PHASES.learn.cn, en: PHASES.learn.en, desc: "察 · 练 — 把每次对话变成组织经验" }, draggable: false, selectable: false })
    return [
      ...labels,
      { id: "consumer", type: "end", position: { x: -200, y: 205 }, data: { title: "消费者", sub: "文字 · 图片 · 语气" } },
      { id: "human", type: "end", position: { x: 904, y: 205 }, data: { title: "人工坐席", sub: "采纳 · 修改 · 决定", dark: true } },
      ...AGENTS.map((a) => ({ id: a.id, type: "agent", position: { x: POS[a.id][0], y: POS[a.id][1] }, data: { agent: a, selected: a.id === sel } })),
    ]
  }, [sel])

  const edges = useMemo<Edge[]>(
    () =>
      FLOW.map(([s, t, label]) => {
        const hot = s === sel || t === sel
        const c = AGENT_MAP[s as AgentId]?.color ?? "#b9b5ad"
        return {
          id: `${s}-${t}`,
          source: s,
          target: t,
          animated: hot,
          label,
          labelStyle: { fontSize: 10, fill: "#6f6c78" },
          labelBgStyle: { fill: "#faf9f6" },
          labelBgPadding: [4, 2] as [number, number],
          style: { stroke: hot ? c : "#d9d5cd", strokeWidth: hot ? 2 : 1.2 },
        }
      }),
    [sel],
  )

  const nameOf = (id: string) => (id === "consumer" ? "消费者" : id === "human" ? "人工坐席" : AGENT_MAP[id as AgentId].cn)
  const upstream = FLOW.filter(([, t]) => t === sel).map(([f]) => nameOf(f))
  const downstream = FLOW.filter(([f]) => f === sel).map(([, t]) => nameOf(t))

  const principles = CONSTITUTION_RULES

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Agent Orchestration"
        title="智能体编排"
        desc="十三个智能体分五层协作：感知层运行「望闻问切忆」，融合层检索依据、制定下一步，起草层写三版回复，守护层在发送前把关，进化层把每一次对话变成组织的经验。最后做决定的，始终是人。点击任意一个智能体，可以看到它在这个版本里实际是怎么实现的。"
      />
      <div className="grid gap-5 px-8 xl:grid-cols-[1fr_340px]">
        <div className="h-[640px] overflow-hidden rounded-3xl border border-line bg-white">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => n.type === "agent" && setSel(n.id as AgentId)}
            fitView
            fitViewOptions={{ padding: 0.04 }}
            minZoom={0.4}
            maxZoom={1.4}
            zoomOnScroll={false}
            preventScrolling={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e3dfd7" />
          </ReactFlow>
        </div>

        <motion.aside key={agent.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full font-cn-serif text-[22px] font-semibold text-white" style={{ background: agent.color }}>
              {agent.glyph}
            </span>
            <div>
              <div className="font-cn-serif text-[18px] font-semibold">{agent.cn}</div>
              <div className="font-serif text-[13px] text-muted-foreground italic">{agent.en}</div>
            </div>
          </div>
          <div className="mt-3 font-cn-serif text-[14px] font-medium text-ink">“{agent.role}”</div>
          <p className="mt-2 text-[12.5px] leading-[1.85] text-ink-soft">{agent.description}</p>
          <div className="mt-3 rounded-xl border border-dashed border-[#d6d3cc] bg-porcelain px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <Hammer className="size-3" />
              在这个版本里实际运行的是
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.8] text-ink-soft">{agent.impl}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/70 px-3 py-2">
              <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                <Cpu className="size-3" />
                推理方式
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold">{MODEL_LABEL[agent.model]}</div>
            </div>
            <div className="rounded-xl bg-muted/70 px-3 py-2">
              <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground" title="生产部署的设计目标，不是实测值">
                <Timer className="size-3" />
                时延目标
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold">{agent.budget >= 1000 ? `${agent.budget / 1000} 秒` : `${agent.budget} 毫秒`}</div>
            </div>
          </div>
          {[
            { t: "输入", items: agent.inputs, icon: ArrowRight },
            { t: "输出", items: agent.outputs, icon: GitBranch },
            { t: "工具", items: agent.tools, icon: Wrench },
          ].map((g) => (
            <div key={g.t} className="mt-4">
              <div className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <g.icon className="size-3" />
                {g.t}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((x) => (
                  <span key={x} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-ink-soft">
                    {x}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            {[
              { t: "上游", items: upstream, empty: "直接读取客户数据平台" },
              { t: "下游", items: downstream, empty: "—" },
            ].map((g) => (
              <div key={g.t}>
                <div className="mb-1.5 text-[11px] text-muted-foreground">{g.t}</div>
                {g.items.length ? (
                  <ul className="space-y-1">
                    {g.items.map((x) => (
                      <li key={x} className="text-[12px] text-ink-soft">
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12px] text-muted-foreground">{g.empty}</div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-3 text-[11px] text-muted-foreground">点击左侧任意智能体查看详情，节点可拖动。</div>
        </motion.aside>
      </div>

      <div className="mt-5 grid gap-5 px-8 lg:grid-cols-3">
        <section className="rounded-3xl bg-ink p-6 text-porcelain lg:col-span-1">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4" />
            <h2 className="font-cn-serif text-[17px] font-semibold">灵犀宪法</h2>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-porcelain/60">写进每一个大模型智能体的系统提示词；其中能用规则检查的部分，由「检」在发送前逐条执行。</p>
          <ol className="mt-4 space-y-2.5">
            {principles.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-[1.75]">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[10.5px]">{i + 1}</span>
                <span className="text-porcelain/90">{p}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-[#6a52c9]" />
            <h2 className="font-cn-serif text-[17px] font-semibold">双轨架构：规则守底线，模型懂人心</h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/70 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-normal" />
                  <th className="px-3 py-2 font-normal">规则轨</th>
                  <th className="px-3 py-2 font-normal">大模型轨</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
                {[
                  ["擅长", "红线、极限词、批号、时限", "潜台词、反讽、语气、起草"],
                  ["时延", "毫秒级，逐字触发", "秒级，逐句触发"],
                  ["可解释", "命中哪条规则一目了然", "附证据与知识库出处"],
                  ["失效时", "永不失效", "自动降级到规则轨"],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td className="text-muted-foreground">{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-[1.8] text-muted-foreground">两条轨的风险信号取并集、等级取高者：大模型可以把风险调高，不能把规则命中的风险调低。审批人、事实核对、评分和路由由规则与数据决定；风险等级以规则命中为下限，模型的证据在材料里找不到时最多算 L2、标为待核实。规则的读数还有第三个用途：决定这一轮给多少模型——寒暄不调用，规则有把握的低风险咨询只让快速模型起草，其余由主模型完成（见“评测”页）。</p>
        </section>

        <section className="rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#2c7a3f]" />
            <h2 className="font-cn-serif text-[17px] font-semibold">出错时怎么办</h2>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["大模型超时、报错或返回格式不对", "该智能体由规则引擎接替，星图上标为“已降级”，执行轨迹写明原因，会话不中断。"],
              ["图片没有识别", "不猜测。图片保持模糊并提示坐席人工查看，风险按文字信号评估。"],
              ["草稿或手写回复含违规表述", "发送被拦截，给出原因和替换建议，修改后才能发出。"],
              ["知识库没有命中依据", "不编造政策。涉及政策、金额或时限的会话会加上“向主管确认政策”这一步。"],
              ["补偿超出坐席权限", "按权限矩阵自动标出审批人；超过主管权限的，交给会诊决议。"],
              ["分析请求失败", "面板给出错误提示和重试按钮，坐席可以先按自己的判断回复。"],
              ["路由把一轮对话判成了“不需要模型”", "只有规则确实认出来的寒暄和低风险咨询才会这样；规则读不懂的一律交给主模型。评测页有一项专门的检查：有风险却没到主模型的消息数必须是 0。"],
            ].map(([q, a]) => (
              <div key={q}>
                <div className="text-[12.5px] font-semibold text-ink">{q}</div>
                <div className="mt-0.5 text-[12px] leading-[1.75] text-muted-foreground">{a}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
