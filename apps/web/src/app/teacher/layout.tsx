import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { OfflineSync } from "@/components/offline-sync";
import { IdleGuard } from "@/components/idle-guard";
import { cookies } from "next/headers";
import { normalizeIdle } from "@satarobo/core";
import { IDLE_COOKIE } from "@/lib/auth-session";
import { TeacherNav } from "./teacher-nav";

export const metadata = { title: "Giáo viên" };

/**
 * Khung GIAO DIỆN GIÁO VIÊN — một bố cục co giãn cho mọi thiết bị:
 * - Điện thoại (< 768px): thanh đầu gọn + thanh điều hướng đáy, nội dung một cột.
 * - Máy tính bảng / máy tính (≥ 768px): điều hướng nằm trên thanh đầu, bỏ thanh đáy,
 *   nội dung rộng tới 72rem và các trang tự chia 2–3 cột.
 */
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  if (me.auth?.mfa.required && !me.auth.mfa.satisfied) redirect("/bao-mat");
  const idle = me.auth?.via === "supabase" ? normalizeIdle((await cookies()).get(IDLE_COOKIE)?.value ?? 60) : null;
  const initials = me.user.fullName.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join("") || "U";

  return (
    <div className="flex min-h-dvh flex-col text-[15px]">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-surface/90 backdrop-blur print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-2 sm:px-6 lg:px-8">
          <Link href="/teacher" className="flex min-h-11 shrink-0 items-center font-bold text-brand-600">Sata Robo · GV</Link>
          <TeacherNav variant="top" />
          <details className="group relative ml-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 hover:bg-black/[0.04] [&::-webkit-details-marker]:hidden" aria-label="Tài khoản của tôi">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{initials}</span>
              <span className="hidden max-w-[180px] truncate text-[14px] font-semibold sm:block">{me.user.fullName}</span>
              <ChevronDown className="h-4 w-4 text-ink-600 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-black/10 bg-white p-2 text-[14px] shadow-lg">
              <div className="px-2 py-1.5">
                <div className="truncate font-semibold">{me.user.fullName}</div>
                <div className="truncate text-[12px] text-ink-600">{me.user.email}</div>
              </div>
              <Link href="/tai-khoan" className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-black/[0.04]"><UserRound className="h-4 w-4 text-ink-600" aria-hidden />Hồ sơ tài khoản</Link>
              <Link href="/bao-mat" className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-black/[0.04]"><ShieldCheck className="h-4 w-4 text-ink-600" aria-hidden />Bảo mật tài khoản</Link>
              <div className="my-1 border-t border-black/5" />
              <Link href="/logout" prefetch={false} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" aria-hidden />Đăng xuất</Link>
            </div>
          </details>
        </div>
      </header>
      <OfflineSync />
      <IdleGuard minutes={idle} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-28 sm:px-6 md:py-6 md:pb-10 lg:px-8">{children}</main>
      <TeacherNav variant="bottom" />
    </div>
  );
}
