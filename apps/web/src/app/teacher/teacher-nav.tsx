"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarCheck, Clock, LayoutDashboard, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const NAV: Item[] = [
  { href: "/teacher", label: "Hôm nay", icon: CalendarCheck, match: (p) => p === "/teacher" || p.startsWith("/teacher/sessions") },
  { href: "/teacher/classes", label: "Lớp của tôi", icon: BookOpen, match: (p) => p.startsWith("/teacher/classes") },
  { href: "/cham-cong/lich-ca", label: "Chấm công", icon: Clock, match: (p) => p.startsWith("/cham-cong") },
  { href: "/dashboard", label: "Quản trị", icon: LayoutDashboard, match: () => false },
];

/**
 * Điều hướng giao diện giáo viên, một bộ mục cho mọi màn hình:
 * - `top`: hàng mục ngang trên thanh đầu trang — máy tính bảng ngang / máy tính (≥ md)
 * - `bottom`: thanh đáy kiểu ứng dụng — điện thoại (< md)
 */
export function TeacherNav({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname() ?? "";
  if (variant === "top") {
    return (
      <nav aria-label="Điều hướng giáo viên" className="hidden items-center gap-1 md:flex">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-semibold transition-colors ${on ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-black/[0.04] hover:text-foreground"}`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Điều hướng giáo viên" className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur md:hidden print:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-lg grid-cols-4 text-center text-[12px] font-semibold">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 ${on ? "text-brand-600" : "text-ink-600 hover:text-brand-600"}`}
            >
              <Icon className="h-[22px] w-[22px]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
