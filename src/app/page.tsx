"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowRight, ArrowUpRight, HeartHandshake, Play, ShieldCheck, Sparkles, Telescope, Users, Siren } from "lucide-react"
import { Wordmark } from "@/components/lingxi/mark"
import { BlurFade } from "@/components/ui/blur-fade"
import { Marquee } from "@/components/ui/marquee"
import { AGENTS, BRAND, DEMO_DISCLAIMER, EMOTIONS, EMOTION_ORDER } from "@/lib/constants"
import { FOCUS_BATCH } from "@/lib/insights"
import { cn } from "@/lib/utils"

const Grainient = dynamic(() => import("@/components/fx/Grainient"), { ssr: false })

const VOICES = [
  { said: "算了，你们也不在乎我们这些老客户了。", meant: "我想被记得。", emo: "sadness" as const },
  { said: "后天是我女朋友生日，你们别给我搞砸了。", meant: "这份心意不能掉链子。", emo: "anxiety" as const },
  { said: "我也不是要钱……我妈年纪大了，我真的挺怕的。", meant: "请先告诉我，她没事。", emo: "anxiety" as const },
  { said: "呵呵，又是这套话术。", meant: "请像人一样跟我说话。", emo: "grievance" as const },
  { said: "你们到底怎么做的品控？？", meant: "我需要一个可以相信的交代。", emo: "anger" as const },
  { said: "谢谢你这么耐心。", meant: "我愿意再相信一次。", emo: "gratitude" as const },
]

function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      <div aria-hidden className="absolute inset-0">
        <div className="animate-float absolute top-[8%] left-[12%] size-[520px] rounded-full bg-[#f7cfe0] opacity-70 blur-[110px]" />
        <div className="animate-float absolute top-[2%] right-[8%] size-[560px] rounded-full bg-[#d9cffc] opacity-80 blur-[120px] [animation-delay:-2s]" />
        <div className="animate-float absolute top-[38%] left-[38%] size-[480px] rounded-full bg-[#cfe6f8] opacity-70 blur-[120px] [animation-delay:-4s]" />
        <div className="absolute right-[22%] bottom-[6%] size-[380px] rounded-full bg-[#d3f1e5] opacity-60 blur-[110px]" />
      </div>
      <div className="absolute inset-0 opacity-[0.5] mix-blend-multiply">
        <Grainient
          color1="#f7d6e3"
          color2="#d9d0fb"
          color3="#cfe8f7"
          lightMode
          timeSpeed={0.12}
          warpAmplitude={36}
          grainAmount={0.06}
          contrast={1.1}
          saturation={0.9}
          zoom={1.1}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-porcelain/30 via-porcelain/10 to-porcelain" />
      <div className="bg-line-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-[13px] text-ink-soft md:flex">
          <a href="#story" className="hover:text-ink">故事</a>
          <a href="#agents" className="hover:text-ink">智能体</a>
          <a href="#impact" className="hover:text-ink">价值</a>
          <Link href="/eval" className="hover:text-ink">评测</Link>
        </nav>
        <Link href="/console" className="group flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-porcelain">
          进入工作台
          <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-8 pt-[9vh] text-center">
        <BlurFade delay={0.1}>
          <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[12px] text-ink-soft shadow-[var(--shadow-soft)] backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-pearl-animated" />
            欧莱雅第二届美妆科技黑客松 · 赛题一「数据共情者」
          </div>
        </BlurFade>

        <BlurFade delay={0.25}>
          <h1 className="mt-8 font-cn-serif text-[clamp(56px,9vw,128px)] leading-[1.02] font-semibold tracking-[0.06em] text-ink">
            心有<span className="text-pearl">灵犀</span>
          </h1>
        </BlurFade>
        <BlurFade delay={0.45}>
          <p className="mt-5 font-serif text-[clamp(22px,2.4vw,32px)] text-ink-soft italic">Hearing what was never said.</p>
        </BlurFade>
        <BlurFade delay={0.6}>
          <p className="mx-auto mt-6 max-w-2xl text-[15.5px] leading-[1.9] text-ink-soft">
            灵犀是一位坐在人工客服身边的 <b className="font-semibold text-ink">共情副驾</b>。
            十三个智能体以「望 · 闻 · 问 · 切」读懂消费者没说出口的那句话，
            在风险扩散之前召集相关部门会诊——同时，也照顾屏幕这一端的人。
          </p>
        </BlurFade>
        <BlurFade delay={0.75}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/console" className="group relative flex h-12 items-center gap-2 overflow-hidden rounded-full bg-ink px-6 text-[14px] font-medium text-porcelain shadow-[var(--shadow-float)]">
              <Play className="size-4" />
              观看现场演示
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </Link>
            <Link href="/alerts" className="flex h-12 items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-6 text-[14px] font-medium text-ink backdrop-blur hover:bg-white">
              <Siren className="size-4" />
              风险预警看板
            </Link>
          </div>
        </BlurFade>

        <BlurFade delay={0.95} className="mt-16 w-full">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { k: "智能体", v: "13", d: "感知 · 融合 · 起草 · 守护 · 进化" },
              { k: "风险类别", v: "8", d: "L0–L4 分级，按归属召集会诊" },
              { k: "情绪维度", v: "8", d: "不止“正面 / 负面”" },
              { k: "离线可用", v: "100%", d: "没有模型时由规则引擎完成全部流程" },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-left shadow-[var(--shadow-soft)] backdrop-blur">
                <div className="text-[11.5px] text-muted-foreground">{x.k}</div>
                <div className="mt-1 text-[28px] font-semibold text-ink">{x.v}</div>
                <div className="text-[10.5px] leading-snug text-muted-foreground">{x.d}</div>
              </div>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  )
}

function VoiceMarquee() {
  return (
    <section className="relative py-10">
      <Marquee pauseOnHover className="[--duration:48s] [--gap:1rem]">
        {VOICES.map((v) => (
          <div key={v.said} className="w-[340px] rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="text-[13px] leading-relaxed text-muted-foreground">她说：“{v.said}”</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: EMOTIONS[v.emo].color }} />
              <span className="font-cn-serif text-[15px] font-semibold text-ink">她想说：{v.meant}</span>
            </div>
          </div>
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-porcelain" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-porcelain" />
    </section>
  )
}

function Story() {
  const chapters = [
    {
      n: "01",
      t: "一句“算了”，是告别前的最后一句话",
      d: "客服每天面对上百位消费者。愤怒容易被看见，可“算了”“呵呵”“我也不是要钱”这些安静的句子，才藏着最真实的诉求。传统系统只给出“正面/负面”，却读不懂一个女儿对母亲的担心。",
    },
    {
      n: "02",
      t: "风险不在一句话里，而在一万句话之间",
      d: `单个坐席看到的是一位刺痛的客户；系统应该看到的是：同一批次 72 小时内 ${FOCUS_BATCH.complaints72h} 起同类反馈，是平日的 ${FOCUS_BATCH.ratio} 倍（演示数据）。灵犀把一线的“个案共情”连接成品牌的“产品共情”。`,
    },
    {
      n: "03",
      t: "服务者，也需要被服务",
      d: "客服是情绪劳动强度最高的岗位之一。灵犀为坐席屏蔽攻击性言语、追踪情绪负荷、在连续高压后提醒休息。我们称之为——双向共情。",
    },
  ]
  return (
    <section id="story" className="mx-auto max-w-7xl px-8 py-24">
      <BlurFade inView>
        <div className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">The Story</div>
        <h2 className="mt-3 max-w-3xl font-cn-serif text-[40px] leading-tight font-semibold">
          “身无彩凤双飞翼，<span className="text-pearl">心有灵犀一点通</span>。”
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          隔着屏幕，消费者与客服之间没有表情、没有语气，只有文字。灵犀想做的，是让这条看不见的线重新连起来。
        </p>
      </BlurFade>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {chapters.map((c, i) => (
          <BlurFade key={c.n} inView delay={0.1 * i}>
            <div className="group h-full rounded-3xl border border-line bg-white p-7 transition hover:shadow-[var(--shadow-lift)]">
              <div className="font-serif text-[44px] leading-none text-[#d9d0f5] italic">{c.n}</div>
              <h3 className="mt-6 font-cn-serif text-[21px] leading-snug font-semibold">{c.t}</h3>
              <p className="mt-3 text-[14px] leading-[1.9] text-muted-foreground">{c.d}</p>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

function AgentsSection() {
  const phases = [
    { k: "perceive", cn: "感知", en: "Perceive" },
    { k: "fuse", cn: "融合", en: "Fuse" },
    { k: "decide", cn: "起草", en: "Draft" },
    { k: "guard", cn: "守护", en: "Guard" },
    { k: "learn", cn: "进化", en: "Learn" },
  ] as const
  return (
    <section id="agents" className="relative overflow-hidden bg-ink py-24 text-porcelain">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-pearl-animated opacity-20 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-8">
        <div className="font-mono text-[11px] tracking-[0.3em] text-porcelain/50 uppercase">13 Agents · 5 Layers</div>
        <h2 className="mt-3 font-cn-serif text-[40px] leading-tight font-semibold">望 · 闻 · 问 · 切 —— 中医四诊，读懂一位消费者</h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-porcelain/60">
          借鉴中医“四诊合参”的整体观：不只看一句话，而是综合图像、情绪、意图、风险与客户记忆，“辨证施策”。规则引擎与大模型双轨并行——规则守底线，模型懂人心。
        </p>
        <div className="mt-14 grid gap-4 lg:grid-cols-5">
          {phases.map((p) => (
            <div key={p.k} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-cn-serif text-[18px] font-semibold">{p.cn}</span>
                <span className="font-serif text-[13px] text-porcelain/40 italic">{p.en}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {AGENTS.filter((a) => a.phase === p.k).map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full font-cn-serif text-[16px] font-semibold text-white" style={{ background: a.color }}>
                      {a.glyph}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{a.cn.split(" · ")[1]}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-porcelain/55">{a.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Link href="/agents" className="flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-[13px] hover:bg-white/10">
            查看智能体编排与“宪法” <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Pillars() {
  const items = [
    { icon: Sparkles, t: "懂消费者", d: "8 维情绪光谱 + 潜台词推断 + 多模态视觉，读懂没说出口的那句话。", href: "/console", c: "#d76a95" },
    { icon: ShieldCheck, t: "助人工客服", d: "三版草稿、下一步最佳行动、实时合规质检；AI 起草，人来决定。", href: "/console", c: "#8a72e0" },
    { icon: Users, t: "控风险", d: "八类风险 L0–L4 分级，高危个案 30 秒召集五部门圆桌会诊。", href: "/huddle", c: "#e04b3f" },
    { icon: Telescope, t: "数据共情", d: "从一万次对话里发现批次异常与情绪天气，回流产品与研发。", href: "/insights", c: "#4c9ad8" },
    { icon: HeartHandshake, t: "双向共情", d: "情绪护盾、压力指数与陪练学院，让服务者也被服务。", href: "/academy", c: "#319a56" },
  ]
  return (
    <section id="impact" className="mx-auto max-w-7xl px-8 py-24">
      <div className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">What it does</div>
      <h2 className="mt-3 font-cn-serif text-[40px] font-semibold">懂消费者 · 助人工客服 · 控风险</h2>
      <div className="mt-12 grid gap-4 md:grid-cols-5">
        {items.map((x, i) => (
          <BlurFade key={x.t} inView delay={i * 0.06}>
            <Link href={x.href} className="group flex h-full flex-col rounded-3xl border border-line bg-white p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
              <span className="flex size-10 items-center justify-center rounded-2xl" style={{ background: `${x.c}14`, color: x.c }}>
                <x.icon className="size-5" />
              </span>
              <div className="mt-5 font-cn-serif text-[19px] font-semibold">{x.t}</div>
              <p className="mt-2 flex-1 text-[13px] leading-[1.85] text-muted-foreground">{x.d}</p>
              <span className="mt-4 flex items-center gap-1 text-[12px] text-ink-soft group-hover:text-ink">
                体验 <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

function EmotionBand() {
  return (
    <section className="mx-auto max-w-7xl px-8 pb-24">
      <div className="overflow-hidden rounded-[32px] border border-line bg-white">
        <div className="grid md:grid-cols-[1.1fr_1fr]">
          <div className="p-10">
            <div className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">8-D Emotion Spectrum</div>
            <h3 className="mt-3 font-cn-serif text-[30px] leading-snug font-semibold">情绪不是“正面 / 负面”，<br />而是一道光谱。</h3>
            <p className="mt-4 text-[14px] leading-[1.9] text-muted-foreground">
              我们以中国传统色为每一种情绪赋色，并为每种情绪写下“她需要什么”。焦虑需要确定性，失落需要被重视，委屈需要被承认——同样是负面情绪，回应方式截然不同。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            {EMOTION_ORDER.map((k) => (
              <div key={k} className="bg-white p-5">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: EMOTIONS[k].color }} />
                  <span className="font-cn-serif text-[16px] font-semibold">{EMOTIONS[k].cn}</span>
                  <span className="font-serif text-[12px] text-muted-foreground italic">{EMOTIONS[k].en}</span>
                </div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">{EMOTIONS[k].hint}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-8 py-8 text-[12px] text-muted-foreground">
        <Wordmark sub={false} />
        <div className="max-w-xl">{DEMO_DISCLAIMER}</div>
        <div className="font-serif italic">{BRAND.poem} — {BRAND.poet}</div>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className={cn("grain bg-porcelain")}>
      <Hero />
      <VoiceMarquee />
      <Story />
      <AgentsSection />
      <Pillars />
      <EmotionBand />
      <Footer />
    </div>
  )
}
