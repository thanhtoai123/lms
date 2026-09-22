import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CalendarCheck, Clock, LayoutDashboard } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { OfflineSync } from "@/components/offline-sync";
import { IdleGuard } from "@/components/idle-guard";
import { cookies } from "next/headers";
import { normalizeIdle } from "@satarobo/core";
import { IDLE_COOKIE } from "@/lib/auth-session";

const NAV = [
  { href: "/teacher", label: "Hôm nay", icon: CalendarCheck },
  { href: "/teacher/classes", label: "Lớp của tôi", icon: BookOpen },
  { href: "/cham-cong/lich-ca", label: "Chấm công", icon: Clock },
  { href: "/dashboard", label: "Quản trị", icon: LayoutDashboard },
] as const;

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  const idle = me.auth?.via === "supabase" ? normalizeIdle((await cookies()).get(IDLE_COOKIE)?.value ?? 60) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col text-[15px]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-surface/90 px-4 py-2 backdrop-blur" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <Link href="/teacher" className="flex min-h-11 items-center font-bold text-brand-600">Sata Robo · GV</Link>
        <div className="flex items-center gap-3 text-[13px] text-ink-600">
          <span className="max-w-[140px] truncate">{me.user.fullName}</span>
          <Link href="/logout" className="inline-flex min-h-11 items-center underline">Thoát</Link>
        </div>
      </header>
      <OfflineSync />
      <IdleGuard minutes={idle} />
      <main className="flex-1 px-4 py-4 pb-28">{children}</main>
      <nav aria-label="Điều hướng giáo viên" className="fixed inset-x-0 bottom-0 border-t border-black/5 bg-white/95 backdrop-blur print:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-4 text-center text-[12px] font-semibold">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-ink-600 hover:text-brand-600">
              <Icon className="h-[22px] w-[22px]" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
