"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ClipboardList, MessageCircle, Sprout, UserRound, Wallet, type LucideIcon } from "lucide-react";

export interface PhNavItem {
  href: string;
  label: string;
  /** Câu mô tả ngắn, chỉ hiện ở thanh bên máy tính (chỗ rộng thì nói rõ hơn) */
  desc: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

/** Năm mục chính của cổng phụ huynh — dùng chung cho thanh đáy (điện thoại) và thanh bên (máy tính) */
export const PH_NAV_ITEMS: PhNavItem[] = [
  { href: "/ph", label: "Hôm nay", desc: "Buổi tới, nhận xét mới", icon: Sprout, match: (p) => p === "/ph" || p.startsWith("/ph/be") },
  { href: "/ph/lich", label: "Lịch học", desc: "Cả tháng, xin nghỉ", icon: CalendarDays, match: (p) => p.startsWith("/ph/lich") },
  { href: "/ph/yeu-cau", label: "Yêu cầu", desc: "Xin nghỉ, học bù, hỏi đáp", icon: ClipboardList, match: (p) => p.startsWith("/ph/yeu-cau") || p.startsWith("/ph/tin-nhan") },
  { href: "/ph/hoc-phi", label: "Học phí", desc: "Đơn thu, thanh toán QR", icon: Wallet, match: (p) => p.startsWith("/ph/hoc-phi") },
  { href: "/ph/tai-khoan", label: "Tài khoản", desc: "Thông báo, quyền riêng tư", icon: UserRound, match: (p) => p.startsWith("/ph/tai-khoan") || p.startsWith("/ph/thong-bao") },
];

/**
 * ĐIỆN THOẠI — thanh điều hướng đáy, vùng chạm ≥ 56px, chừa mép cong máy (safe-area).
 * Từ màn hình ≥ 768px thì ẩn, nhường chỗ cho thanh bên.
 */
export function PhNav() {
  const path = usePathname() ?? "/ph";
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 backdrop-blur md:hidden print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {PH_NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
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

/**
 * MÁY TÍNH BẢNG / MÁY TÍNH — thanh bên cố định. Cùng năm mục với thanh đáy (không có mục nào
 * chỉ máy tính mới thấy: điện thoại vẫn là thiết bị chính của phụ huynh), nhưng chỗ rộng nên
 * thêm một dòng mô tả để người ít dùng máy tính vẫn biết mỗi mục làm gì.
 */
export function PhSideNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname() ?? "/ph";
  return (
    <div className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-black/5 bg-white md:flex print:hidden">
      <Link href="/ph" className="flex items-center gap-2 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
        <span className="text-[15px] font-extrabold leading-tight">
          Sata Robo
          <span className="block text-[12px] font-semibold text-ink-600">Cổng phụ huynh</span>
        </span>
      </Link>
      <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-2">
        <ul className="space-y-1">
          {PH_NAV_ITEMS.map(({ href, label, desc, icon: Icon, match }) => {
            const active = match(path);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition ${active ? "bg-primary-soft text-primary" : "text-ink-600 hover:bg-muted"}`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className={`block truncate text-[15px] font-semibold ${active ? "" : "text-foreground"}`}>{label}</span>
                    <span className="block truncate text-[12px] text-ink-600">{desc}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 space-y-1 border-t border-black/5 pt-3">
          <li>
            <Link href="/ph/tin-nhan" className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-[15px] font-semibold transition ${path.startsWith("/ph/tin-nhan") ? "bg-primary-soft text-primary" : "text-ink-600 hover:bg-muted"}`}>
              <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />Tin nhắn
            </Link>
          </li>
          <li>
            <Link href="/ph/thong-bao" className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-[15px] font-semibold transition ${path.startsWith("/ph/thong-bao") ? "bg-primary-soft text-primary" : "text-ink-600 hover:bg-muted"}`}>
              <Bell className="h-5 w-5 shrink-0" aria-hidden />
              Thông báo
              {unread > 0 && <span className="ml-auto min-w-5 rounded-full bg-accent-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </li>
        </ul>
      </nav>
      <form action="/api/ph/logout" method="post" className="p-3">
        <button className="btn-ghost w-full text-[14px]">Đăng xuất</button>
      </form>
    </div>
  );
}
