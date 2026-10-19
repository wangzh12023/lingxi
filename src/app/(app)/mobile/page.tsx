"use client"

import { PageHeader } from "@/components/lingxi/shell"
import { useConsole } from "@/lib/store"
import { CHANNELS } from "@/lib/constants"
import { maskAbuse } from "@/lib/engine/heuristics"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { ArrowRight, ChevronLeft, EyeOff, Headset, MoreHorizontal, ShieldCheck } from "lucide-react"

/**
 * The same conversation, from the consumer's side. It reads the console's session, so whatever the
 * agent sends there appears here. What the consumer sees is the point: replies from a person —
 * never the analysis, the drafts, the risk level or anything else that happens backstage.
 */
export default function MobilePage() {
  const scenario = useConsole((s) => s.scenario)
  const messages = useConsole((s) => s.messages)
  const insightsCount = useConsole((s) => Object.keys(s.insights).length)
  const shield = useConsole((s) => s.shield)
  const ch = CHANNELS[scenario.channel]
  const shown = messages.filter((m) => m.role !== "system")

  return (
    <div className="px-8 pb-12">
      <PageHeader
        className="px-0"
        eyebrow="Consumer View"
        title="消费者看到的"
        desc="同一段对话，从消费者的手机上看。灵犀不直接面对消费者：情绪分析、风险研判、三版草稿、合规检查都只出现在坐席的屏幕上，消费者收到的始终是坐席本人发出的回复。"
      />
      <div className="grid items-start gap-10 lg:grid-cols-[400px_1fr]">
        <div className="mx-auto w-[360px] rounded-[48px] bg-ink p-3 shadow-[var(--shadow-float)]">
          <div className="relative h-[720px] overflow-hidden rounded-[38px] bg-[#f3f3f5]">
            <div className="absolute top-2.5 left-1/2 h-6 w-28 -translate-x-1/2 rounded-full bg-ink" />
            <div className="flex items-center justify-between px-7 pt-3.5 text-[11px] font-semibold text-ink">
              <span>9:41</span>
              <span className="tracking-widest">●●●</span>
            </div>
            <div className="mt-4 flex items-center gap-2 border-b border-black/5 bg-white px-4 py-3">
              <ChevronLeft className="size-5 text-ink" />
              <span className="flex size-8 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: ch.color }}>
                {ch.mark}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">AURELLE 官方客服</div>
                <div className="text-[10.5px] text-muted-foreground">{ch.cn} · 人工客服在线</div>
              </div>
              <MoreHorizontal className="size-5 text-ink" />
            </div>
            <div className="scrollbar-none h-[590px] space-y-3 overflow-y-auto px-3.5 py-4">
              {shown.length === 0 && (
                <div className="mx-auto mt-24 max-w-[240px] text-center text-[12.5px] leading-relaxed text-muted-foreground">
                  对话还没有开始。去工作台播放「{scenario.title}」，这里会同步显示消费者这一侧。
                </div>
              )}
              {shown.map((m) =>
                m.role === "consumer" ? (
                  <div key={m.id} className="ml-auto max-w-[80%] space-y-1.5">
                    {m.attachments?.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={a.id} src={a.url} alt={a.caption ?? "我发送的图片"} className="ml-auto w-36 rounded-2xl" />
                    ))}
                    <div className="rounded-2xl rounded-br-md bg-[#95ec69] px-3 py-2 text-[13px] leading-relaxed text-ink">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex max-w-[86%] gap-2">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                      <Headset className="size-3.5 text-ink-soft" />
                    </span>
                    <div>
                      <div className="mb-0.5 text-[10px] text-muted-foreground">客服 小禾</div>
                      <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] leading-relaxed text-ink shadow-sm">{m.text}</div>
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-black/5 bg-white px-4 py-3">
              <div className="h-9 flex-1 rounded-full bg-[#f3f3f5]" />
              <span className="flex size-9 items-center justify-center rounded-full bg-[#f3f3f5] text-[18px] text-muted-foreground">+</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-3xl border border-line bg-white p-6">
            <h2 className="font-cn-serif text-[17px] font-semibold">两块屏幕，看到的东西不一样</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-muted/70 p-4">
                <div className="text-[13px] font-semibold">消费者的手机上</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  <li>· 坐席发出的每一条回复</li>
                  <li>· 自己发出的文字和图片</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-[#f3f0fc] p-4">
                <div className="text-[13px] font-semibold">只在坐席的屏幕上</div>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  <li>· 情绪、意图、潜台词的分析</li>
                  <li>· 风险等级与上报时限</li>
                  <li>· 三版草稿与评分、合规拦截</li>
                  <li>· 跨部门会诊与决议</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-[#2c7a3f]" />
                已分析 {insightsCount} 轮，消费者一侧看不到任何分析结果
              </span>
              <span className="flex items-center gap-1.5">
                <EyeOff className="size-3.5" />
                情绪护盾只遮盖坐席看到的攻击性词汇{shield && shown.some((m) => m.role === "consumer" && maskAbuse(m.text).hits.length) ? "，消费者自己的原话不受影响" : ""}
              </span>
            </div>
          </section>
          <section className="rounded-3xl border border-line bg-white p-6">
            <h2 className="font-cn-serif text-[17px] font-semibold">为什么不让 AI 直接回答消费者</h2>
            <p className="mt-2 text-[13px] leading-[1.9] text-ink-soft">
              赛题强调的不是“能自动回答的聊天机器人”，而是让 AI 成为人工客服与消费者之间的辅助工具。皮肤不适、批次问题、索赔纠纷这些情境里，一句话说错的代价很高：草稿可以由灵犀来写，但发不发、怎么改，应该由一个能为结果负责的人来决定。
            </p>
            <Link href="/console" className={cn("mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-4 text-[12.5px] font-medium text-white")}>
              去工作台继续对话
              <ArrowRight className="size-3.5" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}
