"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock, ArrowLeftRight, Award, Bell, BellRing, BookMarked, BookOpen, BookOpenCheck, Boxes, Briefcase,
  Cake, CalendarCheck, CalendarClock, CalendarDays, CalendarSearch, ChartColumn, ChartLine, CheckCheck,
  ChevronDown, ClipboardCheck, ClipboardList, ClipboardPen, Clock, Coins, CreditCard, Database, DoorOpen,
  FileSpreadsheet, FileText, FlaskConical, FolderCheck, Gauge, GraduationCap, HeartHandshake, History, IdCard,
  Image as ImageIcon, KeyRound, Landmark, Layers, LayoutDashboard, ListChecks, ListOrdered, Mail, MapPin, MapPinned, Menu,
  MessageCircle, MessageSquarePlus, MessagesSquare, Monitor, Network, Newspaper, NotebookPen, Package,
  Package2, PackageOpen, Pin, Plug, Presentation, Receipt, RefreshCw, Rocket, Route, ScrollText, Search, Send, ServerCog,
  Settings, Share2, ShieldAlert, ShieldCheck, ShoppingBag, SlidersHorizontal, Star, Store, TableProperties, Tags,
  TriangleAlert, Undo2, Upload, UserCog, UserPlus, UserRound, Users, UsersRound, Wallet, Workflow, X,
  type LucideIcon,
} from "lucide-react";
import { activeNavItem, activeTab, defaultOpenGroups, searchMenu, type Role } from "@satarobo/core";
import type { NavGroup, NavItem } from "@/lib/admin-nav";
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
  "file-text": FileText, "flask-conical": FlaskConical, "folder-check": FolderCheck, gauge: Gauge, "graduation-cap": GraduationCap,
  "heart-handshake": HeartHandshake, history: History, "id-card": IdCard, image: ImageIcon,
  "key-round": KeyRound, landmark: Landmark, layers: Layers, "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks, "list-ordered": ListOrdered, mail: Mail, "map-pin": MapPin, "map-pinned": MapPinned,
  "message-circle": MessageCircle, "message-square-plus": MessageSquarePlus, "messages-square": MessagesSquare,
  monitor: Monitor, network: Network, newspaper: Newspaper, "notebook-pen": NotebookPen, package: Package,
  "package-2": Package2, "package-open": PackageOpen, plug: Plug, presentation: Presentation, receipt: Receipt,
  "refresh-cw": RefreshCw, rocket: Rocket, route: Route, "scroll-text": ScrollText, send: Send, "server-cog": ServerCog,
  settings: Settings, "share-2": Share2, "shield-alert": ShieldAlert, "shield-check": ShieldCheck,
  "shopping-bag": ShoppingBag, "sliders-horizontal": SlidersHorizontal, star: Star, store: Store,
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

const OPEN_KEY = "admin-nav-open-v2";
const PIN_KEY = "admin-nav-pins";
const MAX_PINS = 8;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** Tìm nhãn cho một href đã ghim: mục menu, hoặc "Mục › Chip" */
function resolvePin(nav: NavGroup[], href: string): { label: string; icon?: string } | null {
  for (const g of nav) for (const i of g.items) {
    if (i.href === href) return { label: i.label, icon: i.icon };
    const t = (i.tabs ?? []).find((x) => x.href === href);
    if (t) return { label: `${i.label} › ${t.label}`, icon: i.icon };
  }
  return null;
}

/**
 * Dải chip của trang trung tâm (hub): hiện trên mọi trang là một chip của mục menu đang mở.
 * Đọc truy vấn (`?xem=…`) nên tách riêng và bọc Suspense.
 */
function HubTabs({ item, pathname }: { item: NavItem | undefined; pathname: string }) {
  const params = useSearchParams();
  const tabs = item?.tabs ?? [];
  if (!item || tabs.length < 2) return null;
  const query: Record<string, string> = {};
  params.forEach((v, k) => { query[k] = v; });
  const current = activeTab(pathname, query, tabs);
  if (!current) return null;
  return (
    <nav aria-label={item.label} className="mb-4 flex gap-1.5 overflow-x-auto pb-1 print:hidden">
      {tabs.map((t) => {
        const on = t.href === current.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            data-nav-tab={t.href}
            title={t.desc}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ nav, me, roles, canRunWorker, idleMinutes = null, children }: { nav: NavGroup[]; me: Me; roles: Role[]; canRunWorker: boolean; idleMinutes?: number | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  /** Người dùng tự mở / đóng nhóm: ghi đè mặc định theo vai trò */
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [userOpen, setUserOpen] = useState(false);

  const items = useMemo(() => nav.flatMap((g) => g.items), [nav]);
  const roleOpen = useMemo(() => new Set(defaultOpenGroups(nav, roles)), [nav, roles]);
  const active = activeNavItem(pathname, items);
  const hits = useMemo(() => searchMenu(nav, filter), [nav, filter]);

  useEffect(() => {
    const o = readJson<Record<string, boolean>>(OPEN_KEY, {});
    setOpenState(o && typeof o === "object" ? o : {});
    const p = readJson<string[]>(PIN_KEY, []);
    setPins(Array.isArray(p) ? p.filter((x) => typeof x === "string").slice(0, MAX_PINS) : []);
  }, []);
  useEffect(() => {
    if (!active) return;
    const tab = (active.tabs ?? []).find((t) => t.href === pathname);
    const title = pathname === active.href ? active.label : tab ? `${active.label} › ${tab.label}` : `${active.label} · chi tiết`;
    rememberPage(pathname, title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    setMobileOpen(false);
    setUserOpen(false);
    setFilter("");
    // đưa mục đang mở vào tầm nhìn của sidebar
    document.querySelector('aside a[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  const isOpen = (g: NavGroup) => (!!active && g.items.includes(active)) || (openState[g.key] ?? roleOpen.has(g.key));
  const toggle = (g: NavGroup) =>
    setOpenState((c) => {
      const next = { ...c, [g.key]: !isOpen(g) };
      writeJson(OPEN_KEY, next);
      return next;
    });
  const togglePin = (href: string) =>
    setPins((c) => {
      const next = c.includes(href) ? c.filter((h) => h !== href) : c.length >= MAX_PINS ? c : [...c, href];
      writeJson(PIN_KEY, next);
      return next;
    });

  const pinned = pins.map((h) => ({ href: h, info: resolvePin(nav, h) })).filter((p): p is { href: string; info: { label: string; icon?: string } } => !!p.info);

  const linkCls = (on: boolean) =>
    `flex min-w-0 flex-1 items-center gap-3 border-l-2 py-2 pl-6 pr-9 text-sm font-medium transition-colors ${on ? "border-primary bg-primary-soft text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  const pinButton = (href: string, label: string) => {
    const on = pins.includes(href);
    const full = !on && pins.length >= MAX_PINS;
    return (
      <button
        type="button"
        onClick={() => togglePin(href)}
        disabled={full}
        className={`absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-primary focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-0 ${on ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100"}`}
        aria-label={on ? `Bỏ ghim ${label}` : `Ghim ${label}`}
        aria-pressed={on}
        title={full ? `Tối đa ${MAX_PINS} mục ghim` : on ? "Bỏ ghim" : "Ghim lên đầu menu"}
      >
        <Pin className={`h-3.5 w-3.5 ${on ? "fill-current" : ""}`} aria-hidden />
      </button>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/viec-hom-nay" className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-6">
        <span className="text-xl font-extrabold tracking-tight"><span className="text-primary">Sata</span><span className="text-foreground">Robo</span></span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">Admin</span>
      </Link>
      <div className="shrink-0 px-4 pt-3" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) { e.preventDefault(); router.push(hits[0].href); }
              else if (e.key === "Escape") { e.preventDefault(); setFilter(""); }
            }}
            maxLength={60}
            className="w-full rounded-lg border border-border bg-muted py-1.5 pl-8 pr-7 text-sm outline-none transition-colors focus:border-primary focus:bg-card"
            placeholder="Tìm trong menu…"
            aria-label="Tìm trong menu (gõ không dấu cũng được)"
          />
          {filter && (
            <button type="button" onClick={() => setFilter("")} className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground" aria-label="Xoá ô tìm">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Menu quản trị">
        {filter.trim() ? (
          <ul aria-label="Kết quả tìm trong menu">
            {hits.length === 0 && <li className="px-6 py-2 text-sm text-muted-foreground">Không có mục nào khớp.</li>}
            {hits.slice(0, 30).map((h) => (
              <li key={h.href} className="group relative flex">
                <Link href={h.href} prefetch={false} className={linkCls(false)}>
                  <NavIcon name={h.item.icon} />
                  <span className="min-w-0">
                    <span className="block truncate">{h.label}</span>
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">{h.groupLabel}</span>
                  </span>
                </Link>
                {pinButton(h.href, h.label)}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2 border-b border-border pb-2">
                <div className="px-6 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground">Đã ghim</div>
                <ul>
                  {pinned.map((p) => {
                    const on = pathname === p.href || (active?.href === p.href);
                    return (
                      <li key={p.href} className="group relative flex">
                        <Link href={p.href} prefetch={false} className={linkCls(on)}>
                          <NavIcon name={p.info.icon} />
                          <span className="truncate">{p.info.label}</span>
                        </Link>
                        {pinButton(p.href, p.info.label)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {nav.map((g) => {
              const open = isOpen(g);
              return (
                <div key={g.key} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggle(g)}
                    className={`flex w-full items-center justify-between px-6 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:text-primary ${g.tech ? "text-muted-foreground" : "text-foreground"}`}
                    aria-expanded={open}
                  >
                    <span className="truncate">{g.label}{!open && <span className="ml-1.5 font-medium normal-case tracking-normal text-muted-foreground">{g.items.length}</span>}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
                  </button>
                  {/* Nhóm thu gọn vẫn có trong HTML (ẩn) để bộ kiểm thử menu đọc được mục người dùng được thấy */}
                  <ul hidden={!open}>
                    {g.items.map((i) => {
                      const on = i === active;
                      return (
                        <li key={i.href} className="group relative flex">
                          <Link
                            href={i.href}
                            prefetch={false}
                            data-nav-href={i.href}
                            title={i.desc}
                            className={linkCls(on)}
                            aria-current={on ? "page" : undefined}
                          >
                            <NavIcon name={i.icon} />
                            <span className="truncate">{i.label}</span>
                            {i.ready === false && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-border" title="Đang xây dựng" />}
                          </Link>
                          {pinButton(i.href, i.label)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </nav>
      <div className="shrink-0 border-t border-border p-4 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Sata Robo Admin</div>
        <div>Ghim mục hay dùng bằng biểu tượng ghim · Ctrl K để tìm nhanh</div>
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
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto p-4 outline-none sm:p-6 print:overflow-visible">
          <Suspense fallback={null}><HubTabs item={active} pathname={pathname} /></Suspense>
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
