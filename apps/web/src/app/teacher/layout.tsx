import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { OfflineSync } from "@/components/offline-sync";
import { IdleGuard } from "@/components/idle-guard";
import { cookies } from "next/headers";
import { normalizeIdle } from "@satarobo/core";
import { IDLE_COOKIE } from "@/lib/auth-session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  const idle = me.auth?.via === "supabase" ? normalizeIdle((await cookies()).get(IDLE_COOKIE)?.value ?? 60) : null;

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-black/5 px-4 py-3 flex items-center justify-between">
        <Link href="/teacher" className="font-bold text-brand-600">Sata Robo · GV</Link>
        <div className="text-xs text-ink-600 flex items-center gap-3">
          <span className="truncate max-w-[140px]">{me.user.fullName}</span>
          <Link href="/logout" className="underline">Thoát</Link>
        </div>
      </header>
      <OfflineSync />
      <IdleGuard minutes={idle} />
      <main className="flex-1 px-4 py-4 pb-24">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-black/5 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto max-w-md grid grid-cols-3 text-center text-xs font-medium">
          <Link href="/teacher" className="py-3 hover:text-brand-600">Hôm nay</Link>
          <Link href="/teacher/classes" className="py-3 hover:text-brand-600">Lớp của tôi</Link>
          <Link href="/dashboard" className="py-3 hover:text-brand-600">Trang quản trị</Link>
        </div>
      </nav>
    </div>
  );
}
