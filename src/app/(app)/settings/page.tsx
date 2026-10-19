"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { AGENTS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, Cpu, KeyRound, LoaderCircle, PlugZap, Server, TerminalSquare } from "lucide-react"

interface Health {
  mode: "llm" | "offline"
  forcedOffline: boolean
  keyConfigured: boolean
  provider: string
  model: string
  fastModel: string
  visionModel: string
  ping?: { ok: boolean; model: string; ms: number; error?: string }
}

const ENV = `# lingxi/.env.local —— 修改后重启服务（pnpm dev 或 pnpm start）
LLM_API_KEY=你的密钥                 # 百炼北京地域、按量付费的 API Key
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen3.8-27b              # 主模型：感知、起草、会诊、陪练（开源权重）
LLM_FAST_MODEL=qwen3.5-35b-a3b     # 快速模型：低风险咨询的起草、审查（开源权重）
LLM_VISION_MODEL=qwen3.8-27b       # 图片识别
# LINGXI_MODE=offline              # 取消注释可强制离线，便于对比`

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)
  const [pinging, setPinging] = useState(false)

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setFailed(true))
  }, [])

  const ping = async () => {
    setPinging(true)
    try {
      setHealth(await fetch("/api/health?ping=1").then((r) => r.json()))
    } finally {
      setPinging(false)
    }
  }

  const live = health?.mode === "llm"
  const byModel = {
    model: AGENTS.filter((a) => a.model === "flagship" || a.model === "hybrid").map((a) => a.glyph),
    vision: AGENTS.filter((a) => a.model === "vision").map((a) => a.glyph),
    none: AGENTS.filter((a) => a.model === "rule" || a.model === "embed").map((a) => a.glyph),
  }

  return (
    <div className="px-8 pb-12">
      <PageHeader className="px-0" eyebrow="Settings" title="模型与设置" desc="灵犀可以接任何兼容 OpenAI 接口的大模型，默认按阿里云百炼（通义千问）的兼容模式配置。不配置密钥时，全部功能由规则引擎离线完成，界面会标明每一项结果来自哪里。" />
      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-[#6a52c9]" />
            <h2 className="font-cn-serif text-[16px] font-semibold">当前状态</h2>
          </div>
          {failed && <div className="mt-4 rounded-xl bg-[#fdf3f1] px-3 py-2 text-[12.5px] text-[#a32626]">读取状态失败，请确认服务正在运行。</div>}
          {!health && !failed && (
            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              读取中…
            </div>
          )}
          {health && (
            <>
              <div className={cn("mt-4 flex items-start gap-3 rounded-2xl p-4", live ? "bg-[#e9f5ec]" : "bg-muted")}>
                {live ? <CheckCircle2 className="mt-0.5 size-5 text-[#2c7a3f]" /> : <PlugZap className="mt-0.5 size-5 text-ink-soft" />}
                <div>
                  <div className="text-[14px] font-semibold">{live ? "大模型模式" : health.forcedOffline ? "离线模式（已手动强制）" : "离线模式"}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                    {live
                      ? "感知、起草、会诊、陪练和简报会调用大模型；审批人、事实核对和评分仍由规则决定，风险等级以规则命中为下限。剧本演示默认仍用剧本，可在工作台顶部勾选改用大模型。"
                      : "没有调用任何大模型。自由输入由规则引擎分析，图片不会被识别（保持模糊，提示人工查看），会诊按角色模板离线合成。"}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
                <dt className="text-muted-foreground">接口地址</dt>
                <dd className="font-mono text-[12px]">{health.provider}</dd>
                <dt className="text-muted-foreground">密钥</dt>
                <dd>{health.keyConfigured ? "已配置（不会在页面上显示）" : "未配置"}</dd>
                <dt className="text-muted-foreground">主力模型</dt>
                <dd className="font-mono text-[12px]">{health.model}</dd>
                <dt className="text-muted-foreground">轻量模型</dt>
                <dd className="font-mono text-[12px]">{health.fastModel}</dd>
                <dt className="text-muted-foreground">视觉模型</dt>
                <dd className="font-mono text-[12px]">{health.visionModel}</dd>
              </dl>
              <div className="mt-5 flex items-center gap-3">
                <button onClick={ping} disabled={pinging || !health.keyConfigured} className="flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white disabled:opacity-40">
                  {pinging ? <LoaderCircle className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
                  测试连接
                </button>
                {health.ping &&
                  (health.ping.ok ? (
                    <span className="flex items-center gap-1 text-[12.5px] text-[#2c7a3f]">
                      <CheckCircle2 className="size-4" />
                      连接正常 · {health.ping.model} · {(health.ping.ms / 1000).toFixed(1)} 秒
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[12.5px] text-[#a32626]">
                      <CircleAlert className="size-4" />
                      {health.ping.error}
                    </span>
                  ))}
                {!health.keyConfigured && <span className="text-[12px] text-muted-foreground">配置密钥后才能测试</span>}
              </div>
            </>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-[#6a52c9]" />
            <h2 className="font-cn-serif text-[16px] font-semibold">接入大模型</h2>
          </div>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-ink-soft">
            <li>在阿里云百炼控制台（华北 2 · 北京）创建按量付费的 API Key。下面三个模型名取自 2026-10-12 的百炼文档，都是阿里开源权重的千问模型；本项目还没有用真实密钥调用过，请在控制台的模型列表里确认一次。</li>
            <li>在项目目录 lingxi 下新建 .env.local，写入下面的配置。</li>
            <li>重启服务，回到本页点击“测试连接”。</li>
          </ol>
          <pre className="scrollbar-thin mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-[11.5px] leading-[1.7] text-porcelain">
            <code>{ENV}</code>
          </pre>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">密钥只在服务端读取，不会发送到浏览器，也不会出现在任何接口的返回结果里。千问 3.5 以后的模型默认开启思考，灵犀对百炼的每次调用都会关闭它（enable_thinking: false）：这些智能体只返回短的结构化结果，开着思考会多花约两倍时间并按输出计费。用其他兼容 OpenAI 接口的服务时，改 LLM_BASE_URL 和模型名即可。</p>
        </section>

        <section className="rounded-3xl border border-line bg-white p-6 xl:col-span-2">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-[#6a52c9]" />
            <h2 className="font-cn-serif text-[16px] font-semibold">接入后，哪些智能体会调用模型</h2>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              { t: "调用语言模型", list: byModel.model, d: "感知、起草、合规深度审查、会诊、陪练。失败时由规则接替，界面标为“已降级”。" },
              { t: "调用视觉模型", list: byModel.vision, d: "识别上传的图片。没有视觉模型时，图片保持模糊，提示坐席人工查看。" },
              { t: "始终不调用模型", list: byModel.none, d: "客户档案读取、坐席守护和知识检索都是确定性的规则或检索，不需要模型。" },
            ].map((g) => (
              <div key={g.t} className="rounded-2xl bg-muted/70 p-4">
                <div className="text-[13px] font-semibold">{g.t}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.list.map((x) => (
                    <span key={x} className="flex size-7 items-center justify-center rounded-full bg-white font-cn-serif text-[13px] font-semibold shadow-[var(--shadow-soft)]">
                      {x}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{g.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
            <TerminalSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            每次模型调用的耗时和 token 数都会显示在工作台的“执行轨迹”里；离线模式下这一栏为空，不会显示任何虚构的数字。
          </div>
        </section>
      </div>
    </div>
  )
}
