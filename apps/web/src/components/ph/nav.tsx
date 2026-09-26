"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell, BookOpen, CalendarDays, ClipboardList, Coins, GraduationCap, Home, Images, Menu, MessageCircle,
  NotebookPen, Route, UserRound, Wallet, X, type LucideIcon,
} from "lucide-react";

/**
 * ĐIỀU HƯỚNG CỔNG PHỤ HUYNH — dựng theo cổng học viên hệ cũ (`hocvien.satarobo.vn`):
 * một thanh bên dài chia nhóm, mục đang mở là viên thuốc tím nhạt, thanh trên có chuông và
 * chip tài khoản. Máy tính (≥1024px) thanh bên luôn hiện; nhỏ hơn thì thu vào ngăn kéo.
 *
 * Nguyên tắc: **không có mục chết**. Mỗi mục ở đây đều mở ra một trang có dữ liệu thật; mục nào
 * hệ cũ có mà hệ mình chưa dựng thì chưa đưa vào, chứ không để một dòng bấm vào không ra gì.
 */

export interface PhItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mục cần biết đang xem con nào (thay `:con` bằng id con đang chọn) */
  theoCon?: boolean;
  match: (p: string) => boolean;
}

export interface PhGroup {
  title: string;
  items: PhItem[];
}

export const PH_NAV_GROUPS: PhGroup[] = [
  {
    title: "Nhà mình",
    items: [
      { href: "/ph", label: "Tổng quan", icon: Home, match: (p) => p === "/ph" },
      { href: "/ph/lich", label: "Lịch học", icon: CalendarDays, match: (p) => p.startsWith("/ph/lich") },
      { href: "/ph/nhan-xet", label: "Nhận xét", icon: NotebookPen, match: (p) => p.startsWith("/ph/nhan-xet") },
      { href: "/ph/bai-tap", label: "Bài tập", icon: BookOpen, match: (p) => p.startsWith("/ph/bai-tap") },
      { href: "/ph/hinh-anh", label: "Hình ảnh lớp", icon: Images, match: (p) => p.startsWith("/ph/hinh-anh") },
    ],
  },
  {
    title: "Học tập của con",
    items: [
      { href: "/ph/be/:con", label: "Hành trình học", icon: Route, theoCon: true, match: (p) => /^\/ph\/be\/[^/]+$/.test(p) },
      { href: "/ph/be/:con/ho-so", label: "Học bạ năng lực", icon: GraduationCap, theoCon: true, match: (p) => p.includes("/ho-so") || p.includes("/chung-nhan") },
      { href: "/ph/be/:con/xu", label: "SataCoin", icon: Coins, theoCon: true, match: (p) => p.endsWith("/xu") },
    ],
  },
  {
    title: "Tài chính",
    items: [{ href: "/ph/hoc-phi", label: "Học phí & công nợ", icon: Wallet, match: (p) => p.startsWith("/ph/hoc-phi") }],
  },
  {
    title: "Liên hệ trung tâm",
    items: [
      { href: "/ph/yeu-cau", label: "Yêu cầu của tôi", icon: ClipboardList, match: (p) => p.startsWith("/ph/yeu-cau") },
      { href: "/ph/tin-nhan", label: "Tin nhắn", icon: MessageCircle, match: (p) => p.startsWith("/ph/tin-nhan") },
      { href: "/ph/thong-bao", label: "Thông báo", icon: Bell, match: (p) => p.startsWith("/ph/thong-bao") },
    ],
  },
  {
    title: "Tài khoản",
    items: [{ href: "/ph/tai-khoan", label: "Tài khoản", icon: UserRound, match: (p) => p.startsWith("/ph/tai-khoan") }],
  },
];

/** Tiêu đề thanh trên = tên mục đang mở */
export function phTitleOf(path: string): string {
  for (const g of PH_NAV_GROUPS) for (const it of g.items) if (it.match(path)) return it.label;
  return "Cổng phụ huynh";
}

function hrefOf(item: PhItem, conId: string | null): string {
  if (!item.theoCon) return item.href;
  if (!conId) return "/ph";
  return item.href.replace(":con", conId);
}

/** Danh sách mục, dùng chung cho thanh bên máy tính và ngăn kéo điện thoại */
function PhNavList({ conId, unread, onNavigate }: { conId: string | null; unread: number; onNavigate?: () => void }) {
  const path = usePathname() ?? "/ph";
  return (
    <nav aria-label="Điều hướng cổng phụ huynh" className="flex-1 overflow-y-auto px-3 pb-4">
      {PH_NAV_GROUPS.map((g) => (
        <div key={g.title} className="mt-4 first:mt-1">
          <h2 className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">{g.title}</h2>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.match(path);
              const Icon = it.icon;
              const disabled = it.theoCon && !conId;
              return (
                <li key={it.href}>
                  <Link
                    href={hrefOf(it, conId)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-disabled={disabled || undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition ${
                      active ? "bg-primary-soft text-primary" : "text-ink-600 hover:bg-muted hover:text-foreground"
                    } ${disabled ? "pointer-events-none opacity-40" : ""}`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{it.label}</span>
                    {it.href === "/ph/thong-bao" && unread > 0 && (
                      <span className="ml-auto min-w-5 rounded-full bg-accent-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Logo() {
  return (
    <Link href="/ph" className="flex items-center gap-2.5 px-4 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-xl" />
      <span className="text-[16px] font-extrabold leading-tight">
        Sata Robo
        <span className="block text-[12px] font-semibold text-ink-600">Cổng phụ huynh</span>
      </span>
    </Link>
  );
}

/**
 * Con đang xem: ưu tiên `?con=` trên URL, rồi id nằm ngay trên đường dẫn `/ph/be/<id>`,
 * cuối cùng là con mặc định do máy chủ truyền xuống (con đầu tiên của gia đình).
 * Nhờ bước cuối, các mục "Học tập của con" mở được ngay từ trang Tổng quan mà không cần
 * phụ huynh bấm chọn con trước.
 */
function useConId(macDinh: string | null): string | null {
  const sp = useSearchParams();
  const path = usePathname() ?? "";
  const tuUrl = sp?.get("con") ?? null;
  const tuDuongDan = /^\/ph\/be\/([^/]+)/.exec(path)?.[1] ?? null;
  return tuUrl ?? tuDuongDan ?? macDinh;
}

/** Thanh bên cố định — chỉ từ 1024px trở lên */
export function PhSidebar({ unread = 0, conMacDinh = null }: { unread?: number; conMacDinh?: string | null }) {
  const conId = useConId(conMacDinh);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex print:hidden">
      <Logo />
      <PhNavList conId={conId} unread={unread} />
      <form action="/api/ph/logout" method="post" className="border-t border-border p-3">
        <button className="btn-ghost w-full text-[14px]">Đăng xuất</button>
      </form>
    </aside>
  );
}

/**
 * Thanh trên: nút mở ngăn kéo (dưới 1024px), tiêu đề trang, chuông, chip tài khoản.
 * Ngăn kéo nằm luôn trong thành phần này để chỉ có một chỗ giữ trạng thái đóng/mở.
 */
export function PhTopbar({ unread = 0, parentName = "", conMacDinh = null }: { unread?: number; parentName?: string; conMacDinh?: string | null }) {
  const path = usePathname() ?? "/ph";
  const conId = useConId(conMacDinh);
  const [open, setOpen] = useState(false);

  // Đổi trang thì đóng ngăn kéo; bấm Esc cũng đóng
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  const chu = (parentName.trim().split(/\s+/).pop() ?? "P").slice(0, 1).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Mở danh mục"
            aria-expanded={open}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 hover:bg-muted lg:hidden"
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold md:text-[20px]">{phTitleOf(path)}</h1>
          <Link href="/ph/tin-nhan" aria-label="Tin nhắn với trung tâm" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 hover:bg-muted">
            <MessageCircle className="h-[22px] w-[22px]" aria-hidden />
          </Link>
          <Link
            href="/ph/thong-bao"
            aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 hover:bg-muted"
          >
            <Bell className="h-[22px] w-[22px]" aria-hidden />
            {unread > 0 && (
              <span className="absolute right-1 top-1 min-w-5 rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link href="/ph/tai-khoan" className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-[15px] font-bold text-primary-foreground" aria-hidden>{chu}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-[10rem] truncate text-[14px] font-bold">{parentName}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-600">Phụ huynh</span>
            </span>
          </Link>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button type="button" aria-label="Đóng danh mục" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng danh mục" className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 hover:bg-muted">
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <PhNavList conId={conId} unread={unread} onNavigate={() => setOpen(false)} />
            <form action="/api/ph/logout" method="post" className="border-t border-border p-3">
              <button className="btn-ghost w-full text-[14px]">Đăng xuất</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
