"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LingxiMark } from "./mark"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChartNoAxesCombined, GraduationCap, House, LibraryBig, MessagesSquare, Network, Settings2, Siren, Smartphone, Users, Target } from "lucide-react"
import { useEffect, useState } from "react"

const NAV = [
  { href: "/console", label: "接待辅助工作台", en: "Console", icon: MessagesSquare },
  { href: "/alerts", label: "风险预警看板", en: "Risk Watch", icon: Siren },
  { href: "/huddle", label: "会诊圆桌", en: "Huddle", icon: Users },
  { href: "/insights", label: "趋势洞察", en: "Insights", icon: ChartNoAxesCombined },
  { href: "/eval", label: "评测", en: "Evaluation", icon: Target },
  { href: "/agents", label: "智能体编排", en: "Agents", icon: Network },
  { href: "/academy", label: "共情学院", en: "Academy", icon: GraduationCap },
  { href: "/knowledge", label: "知识中枢", en: "Knowledge", icon: LibraryBig },
]

const NAV_2 = [
  { href: "/mobile", label: "消费者视角", en: "Consumer", icon: Smartphone },
  { href: "/settings", label: "模型与设置", en: "Settings", icon: Settings2 },
]

function RailItem({ href, label, en, icon: Icon, active }: { href: string; label: string; en: string; icon: typeof House; active: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            "group relative flex size-10 items-center justify-center rounded-xl text-ink-soft/70 transition-all duration-200 hover:bg-white hover:text-ink hover:shadow-[var(--shadow-soft)]",
            active && "bg-white text-ink shadow-[var(--shadow-soft)]",
          )}
        >
          {active && <span className="absolute -left-[13px] h-5 w-[3px] rounded-r-full bg-pearl-animated" />}
          <Icon className="size-[18px]" strokeWidth={1.7} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="flex items-baseline gap-2">
        <span>{label}</span>
        <span className="font-serif text-[11px] italic opacity-60">{en}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function AppRail() {
  const path = usePathname()
  const [now, setNow] = useState<string>("")
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }))
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [])
  return (
    <aside className="no-print sticky top-0 flex h-dvh w-[64px] shrink-0 flex-col items-center border-r border-line bg-sidebar py-4">
      <Link href="/" className="mb-6 flex flex-col items-center gap-1" aria-label="首页">
        <LingxiMark size={30} />
      </Link>
      <nav className="flex flex-col items-center gap-1.5">
        {NAV.map((n) => (
          <RailItem key={n.href} {...n} active={path.startsWith(n.href)} />
        ))}
      </nav>
      <div className="my-4 h-px w-6 bg-line" />
      <nav className="flex flex-col items-center gap-1.5">
        {NAV_2.map((n) => (
          <RailItem key={n.href} {...n} active={path.startsWith(n.href)} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-3">
        <span className="font-mono text-[10px] text-muted-foreground tabular">{now}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#f3b4cb] to-[#c3b5f4] font-cn-serif text-sm font-semibold text-ink ring-2 ring-white">
                禾
              </div>
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emo-gratitude ring-2 ring-sidebar" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            坐席 小禾 · 在线 · 高级共情顾问
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

export function PageHeader({
  eyebrow,
  title,
  desc,
  children,
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  desc?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 px-8 pt-7 pb-5", className)}>
      <div>
        <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.2em] text-muted-foreground uppercase">
          <span className="size-1.5 rounded-full bg-pearl-animated" />
          {eyebrow}
        </div>
        <h1 className="font-cn-serif text-[28px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}
