"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BookOpen, CalendarCheck, CalendarDays, ChevronDown, Clock, LayoutGrid, LogOut, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { activeNavItem, TEACHER_PRIMARY, teacherTabOf, type TeacherTab } from "@satarobo/core";
import type { NavGroup } from "@/lib/admin-nav";
import { HubTabs } from "@/components/admin-shell";
import { NotificationBell } from "@/components/notification-bell";
import { IdleGuard } from "@/components/idle-guard";
import { OfflineSync } from "@/components/offline-sync";
import { ToastProvider } from "@/components/toast";

type Me = { fullName: string; email: string; initials: string };

const ICON: Record<TeacherTab, LucideIcon> = { today: CalendarCheck, schedule: CalendarDays, classes: BookOpen, timesheet: Clock, more: LayoutGrid };

/**
 * KHUNG GIAO DIỆN GIÁO VIÊN — một khung cho MỌI trang giáo viên dùng, kể cả các trang nghiệp vụ
 * chung (chấm công, học bạ, bài tập, tài liệu, tin nhắn…): giáo viên không bị đẩy qua lại giữa
 * "app giáo viên" và "khu quản trị".
 *
 * 5 mục chính: Hôm nay · Lịch dạy · Lớp của tôi · Chấm công · Thêm (mọi chức năng khác theo quyền).
 * - Điện thoại (< 768px): thanh đáy kiểu ứng dụng.
 * - Máy tính bảng / máy tính: 5 mục nằm trên thanh đầu, bỏ thanh đáy, nội dung rộng tới 72rem.
 */
export function TeacherShell({ nav, me, canAdmin, idleMinutes = null, children }: { nav: NavGroup[]; me: Me; canAdmin: boolean; idleMinutes?: number | null; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [userOpen, setUserOpen] = useState(false);
  useEffect(() => setUserOpen(false), [pathname]);
  const tab = teacherTabOf(pathname);
  const active = activeNavItem(pathname, nav.flatMap((g) => g.items));

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-surface text-[15px]">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Bỏ qua điều hướng</a>
        <header className="sticky top-0 z-30 border-b border-black/5 bg-surface/90 backdrop-blur print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <Link href="/teacher" className="flex min-h-11 shrink-0 items-center font-bold text-brand-600">Sata Robo · GV</Link>
            <nav aria-label="Điều hướng giáo viên" className="hidden items-center gap-1 md:flex">
              {TEACHER_PRIMARY.map((t) => {
                const Icon = ICON[t.key];
                const on = tab === t.key;
                return (
                  <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined} title={t.label}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-semibold transition-colors ${on ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-black/[0.04] hover:text-foreground"}`}>
                    <Icon className="h-[18px] w-[18px]" aria-hidden /><span className="max-lg:sr-only">{t.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell canRunWorker={false} />
              <div className="relative">
                <button type="button" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen} aria-label="Tài khoản của tôi"
                  className="flex min-h-11 items-center gap-2 rounded-lg px-1.5 hover:bg-black/[0.04]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{me.initials}</span>
                  <span className="hidden max-w-[180px] truncate text-[14px] font-semibold sm:block">{me.fullName}</span>
                  <ChevronDown className={`h-4 w-4 text-ink-600 transition-transform ${userOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {userOpen && <button type="button" tabIndex={-1} aria-hidden className="fixed inset-0 z-30 cursor-default" onClick={() => setUserOpen(false)} />}
                {userOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-black/10 bg-white p-2 text-[14px] shadow-lg">
                    <div className="px-2 py-1.5">
                      <div className="truncate font-semibold">{me.fullName}</div>
                      <div className="truncate text-[12px] text-ink-600">{me.email}</div>
                    </div>
                    <Link href="/tai-khoan" className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-black/[0.04]"><UserRound className="h-4 w-4 text-ink-600" aria-hidden />Hồ sơ tài khoản</Link>
                    <Link href="/bao-mat" className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-black/[0.04]"><ShieldCheck className="h-4 w-4 text-ink-600" aria-hidden />Bảo mật tài khoản</Link>
                    {canAdmin && (
                      <>
                        <div className="my-1 border-t border-black/5" />
                        <Link href="/giao-dien?m=ql&next=/viec-hom-nay" prefetch={false} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-black/[0.04]"><ArrowLeftRight className="h-4 w-4 text-ink-600" aria-hidden />Chuyển sang khu quản trị</Link>
                      </>
                    )}
                    <div className="my-1 border-t border-black/5" />
                    <Link href="/logout" prefetch={false} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" aria-hidden />Đăng xuất</Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <OfflineSync />
        <IdleGuard minutes={idleMinutes} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-28 outline-none sm:px-6 md:py-6 md:pb-10 lg:px-8 print:p-0">
          <Suspense fallback={null}><HubTabs item={active} pathname={pathname} /></Suspense>
          {children}
        </main>
        <nav aria-label="Điều hướng giáo viên" className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur md:hidden print:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-lg grid-cols-5 text-center text-[11px] font-semibold leading-tight">
            {TEACHER_PRIMARY.map((t) => {
              const Icon = ICON[t.key];
              const on = tab === t.key;
              return (
                <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 ${on ? "text-brand-600" : "text-ink-600 hover:text-brand-600"}`}>
                  <Icon className="h-[22px] w-[22px]" aria-hidden />{t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
