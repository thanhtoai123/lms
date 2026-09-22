"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Sprout, UserRound, Wallet, type LucideIcon } from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/ph", label: "Hôm nay", icon: Sprout, match: (p) => p === "/ph" || p.startsWith("/ph/be") },
  { href: "/ph/lich", label: "Lịch học", icon: CalendarDays, match: (p) => p.startsWith("/ph/lich") },
  { href: "/ph/yeu-cau", label: "Yêu cầu", icon: ClipboardList, match: (p) => p.startsWith("/ph/yeu-cau") || p.startsWith("/ph/tin-nhan") },
  { href: "/ph/hoc-phi", label: "Học phí", icon: Wallet, match: (p) => p.startsWith("/ph/hoc-phi") },
  { href: "/ph/tai-khoan", label: "Tài khoản", icon: UserRound, match: (p) => p.startsWith("/ph/tai-khoan") || p.startsWith("/ph/thong-bao") },
];

/** Thanh điều hướng đáy cổng phụ huynh — vùng chạm ≥ 56px, biểu tượng + nhãn, đánh dấu mục đang mở */
export function PhNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname() ?? "/ph";
  void unread;
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${active ? "text-primary" : "text-ink-600 hover:text-primary"}`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-primary-soft" : ""}`}>
                  <Icon className="h-[22px] w-[22px]" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
