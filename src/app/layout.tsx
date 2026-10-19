import type { Metadata, Viewport } from "next"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "@fontsource/instrument-serif/400.css"
import "@fontsource/instrument-serif/400-italic.css"
import "@fontsource-variable/noto-serif-sc"
import "@fontsource-variable/noto-sans-sc"
import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "灵犀 Lingxi · 人工客服共情副驾",
  description: "读懂没说出口的那句话 —— 面向欧莱雅消费者服务的多模态多智能体共情副驾。",
}

export const viewport: Viewport = {
  themeColor: "#faf9f6",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!rounded-xl !border-line !bg-paper !text-ink !shadow-[var(--shadow-lift)] !font-sans",
          }}
        />
      </body>
    </html>
  )
}
