"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlarmClock, ArrowLeftRight, Award, Bell, BellRing, BookMarked, BookOpen, BookOpenCheck, Boxes, Briefcase,
  Cake, CalendarCheck, CalendarClock, CalendarDays, CalendarSearch, ChartColumn, ChartLine, CheckCheck,
  ChevronDown, ClipboardCheck, ClipboardList, ClipboardPen, Clock, Coins, CreditCard, Database, DoorOpen,
  FileSpreadsheet, FileText, FlaskConical, Gauge, GraduationCap, HeartHandshake, History, IdCard,
  Image as ImageIcon, KeyRound, Landmark, Layers, LayoutDashboard, ListChecks, ListOrdered, Mail, MapPin, MapPinned, Menu,
  MessageCircle, MessageSquarePlus, MessagesSquare, Monitor, Network, Newspaper, NotebookPen, Package,
  Package2, PackageOpen, Plug, Presentation, Receipt, RefreshCw, Rocket, ScrollText, Search, Send, ServerCog,
  Settings, Share2, ShieldAlert, ShieldCheck, ShoppingBag, SlidersHorizontal, Star, TableProperties, Tags,
  TriangleAlert, Undo2, Upload, UserCog, UserPlus, UserRound, Users, UsersRound, Wallet, Workflow,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup } from "@/lib/admin-nav";
import { NotificationBell } from "@/components/notification-bell";
import { IdleGuard } from "@/components/idle-guard";
import { CommandPalette, rememberPage } from "@/components/command-palette";
import { ToastProvider } from "@/components/toast";
import { ShortcutHelp } from "@/components/shortcuts";

type Me = { fullName: string; email: string; roleLabel: string; initials: string };

/**
 * Tra bảng tên icon (docs/GIAO-DIEN-GOC.md mục 5) → component lucide.
 * Cố tình import tĩnh: import động theo chuỗi sẽ kéo cả bộ icon vào bundle.
 */
const NAV_ICON: Record<string, LucideIcon> = {
  "alarm-clock": AlarmClock, "arrow-left-right": ArrowLeftRight, award: Award, bell: Bell, "bell-ring": BellRing,
  "book-marked": BookMarked, "book-open": BookOpen, "book-open-check": BookOpenCheck, boxes: Boxes,
  briefcase: Briefcase, cake: Cake, "calendar-check": CalendarCheck, "calendar-clock": CalendarClock,
  "calendar-days": CalendarDays, "calendar-search": CalendarSearch, "chart-column": ChartColumn,
  "chart-line": ChartLine, "check-check": CheckCheck, "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList, "clipboard-pen": ClipboardPen, clock: Clock, coins: Coins,
  "credit-card": CreditCard, database: Database, "door-open": DoorOpen, "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText, "flask-conical": FlaskConical, gauge: Gauge, "graduation-cap": GraduationCap,
  "heart-handshake": HeartHandshake, history: History, "id-card": IdCard, image: ImageIcon,
  "key-round": KeyRound, landmark: Landmark, layers: Layers, "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks, "list-ordered": ListOrdered, mail: Mail, "map-pin": MapPin, "map-pinned": MapPinned,
  "message-circle": MessageCircle, "message-square-plus": MessageSquarePlus, "messages-square": MessagesSquare,
  monitor: Monitor, network: Network, newspaper: Newspaper, "notebook-pen": NotebookPen, package: Package,
  "package-2": Package2, "package-open": PackageOpen, plug: Plug, presentation: Presentation, receipt: Receipt,
  "refresh-cw": RefreshCw, rocket: Rocket, "scroll-text": ScrollText, send: Send, "server-cog": ServerCog,
  settings: Settings, "share-2": Share2, "shield-alert": ShieldAlert, "shield-check": ShieldCheck,
  "shopping-bag": ShoppingBag, "sliders-horizontal": SlidersHorizontal, star: Star,
  "table-properties": TableProperties, tags: Tags, "triangle-alert": TriangleAlert, "undo-2": Undo2,
  upload: Upload, "user-cog": UserCog, "user-plus": UserPlus, "user-round": UserRound, users: Users,
  "users-round": UsersRound, wallet: Wallet, workflow: Workflow,
};

function NavIcon({ name }: { name?: string }) {
  const Icon = name ? NAV_ICON[name] : undefined;
  // Mục chưa khai icon vẫn giữ đúng lề với các mục khác
  if (!Icon) return <span className="h-4 w-4 shrink-0" aria-hidden />;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}

function isActive(pathname: string, href: string, all: string[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // không tô sáng /leads khi đang ở /leads/bulk-convert (đã có mục riêng)
  return !all.some((h) => h !== href && h.startsWith(href + "/") && (pathname === h || pathname.startsWith(h + "/")));
}

export function AdminShell({ nav, me, canRunWorker, idleMinutes = null, children }: { nav: NavGroup[]; me: Me; canRunWorker: boolean; idleMinutes?: number | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const allHrefs = nav.flatMap((g) => g.items.map((i) => i.href));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [userOpen, setUserOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin-nav-collapsed");
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {}
  }, []);
  useEffect(() => {
    const hit = nav.flatMap((g) => g.items).filter((i) => isActive(pathname, i.href, allHrefs))[0];
    if (hit) rememberPage(pathname, pathname === hit.href ? hit.label : `${hit.label} · chi tiết`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    setMobileOpen(false);
    setUserOpen(false);
    // đưa mục đang mở vào tầm nhìn của sidebar (menu dài 116 mục)
    document.querySelector('aside a[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try { localStorage.setItem("admin-nav-collapsed", JSON.stringify(next)); } catch {}
      return next;
    });

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/viec-hom-nay" className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-6">
        <span className="text-xl font-extrabold tracking-tight"><span className="text-primary">Sata</span><span className="text-foreground">Robo</span></span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">Admin</span>
      </Link>
      <nav className="flex-1 overflow-y-auto py-4" aria-label="Menu quản trị">
        {nav.map((g) => {
          const hasActive = g.items.some((i) => isActive(pathname, i.href, allHrefs));
          const closed = collapsed[g.key] && !hasActive;
          return (
            <div key={g.key} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="flex w-full items-center justify-between px-6 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground transition-colors hover:text-primary"
                aria-expanded={!closed}
              >
                {g.label}
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${closed ? "-rotate-90" : ""}`} aria-hidden />
              </button>
              {!closed && (
                <ul>
                  {g.items.map((i) => {
                    const active = isActive(pathname, i.href, allHrefs);
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          prefetch={false}
                          className={`flex items-center gap-3 border-l-2 px-6 py-2 text-sm font-medium transition-colors ${active ? "border-primary bg-primary-soft text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                          aria-current={active ? "page" : undefined}
                        >
                          <NavIcon name={i.icon} />
                          <span className="truncate">{i.label}</span>
                          {!i.ready && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-border" title="Đang xây dựng" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-border p-4 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Sata Robo Admin</div>
        <div>Nền tảng mới · 2026</div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
    <div className="flex h-dvh overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
      <IdleGuard minutes={idleMinutes} />
      <CommandPalette nav={nav} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">Bỏ qua menu</a>

      <aside className="hidden w-64 shrink-0 border-r border-border bg-card transition-[width] duration-200 lg:block print:!hidden">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/30" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] border-r border-border bg-card shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 md:px-6 print:hidden">
          <button
            type="button"
            className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <form action="/search" method="get" role="search" className="relative hidden max-w-md flex-1 md:flex">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              name="q"
              maxLength={80}
              className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-16 text-sm outline-none transition-colors focus:border-primary focus:bg-card"
              placeholder="Tìm học viên, lead, lớp, đơn hàng…"
              aria-label="Tìm kiếm"
            />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 text-[11px] text-muted-foreground hover:text-foreground lg:block"
              aria-label="Mở tìm nhanh (Ctrl + K)"
            >
              Ctrl K
            </button>
          </form>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted md:hidden"
            aria-label="Tìm nhanh"
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell canRunWorker={canRunWorker} />
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted"
                onClick={() => setUserOpen((v) => !v)}
                aria-expanded={userOpen}
                aria-label="Tài khoản của tôi"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{me.initials}</span>
                <span className="hidden text-left md:block">
                  <span className="block text-sm font-semibold leading-tight text-foreground">{me.fullName}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{me.roleLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
              {userOpen && (
                <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-card p-2 text-sm shadow-lg">
                  <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{me.email}</div>
                  <Link href="/bao-mat" className="block rounded-lg px-2 py-1.5 hover:bg-muted">Bảo mật tài khoản</Link>
                  <Link href="/teacher" className="block rounded-lg px-2 py-1.5 hover:bg-muted">Ứng dụng giáo viên</Link>
                  <Link href="/logout" prefetch={false} className="block rounded-lg px-2 py-1.5 text-red-700 hover:bg-red-50">Đăng xuất</Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto p-4 outline-none sm:p-6 print:overflow-visible">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
