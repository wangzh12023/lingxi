import { AppRail } from "@/components/lingxi/shell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-porcelain">
      <AppRail />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
