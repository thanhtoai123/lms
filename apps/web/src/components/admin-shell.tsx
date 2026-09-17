"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/admin-nav";
import { NotificationBell } from "@/components/notification-bell";
import { IdleGuard } from "@/components/idle-guard";
import { CommandPalette, rememberPage } from "@/components/command-palette";

type Me = { fullName: string; email: string; roleLabel: string; initials: string };

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
    // đưa mục đang mở vào tầm nhìn của sidebar (menu dài 93 mục)
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
      <Link href="/dashboard" className="flex items-center gap-1.5 px-5 h-16 shrink-0 border-b border-black/5">
        <span className="text-xl font-extrabold tracking-tight"><span className="text-brand-600">Sata</span><span className="text-ink-900">Robo</span></span>
        <span className="text-[11px] font-medium text-ink-400 mt-1">Admin</span>
      </Link>
      <nav className="flex-1 overflow-y-auto py-3 text-sm" aria-label="Menu quản trị">
        {nav.map((g) => {
          const hasActive = g.items.some((i) => isActive(pathname, i.href, allHrefs));
          const closed = collapsed[g.key] && !hasActive;
          return (
            <div key={g.key} className="mb-1">
              <button type="button" onClick={() => toggle(g.key)} className="flex w-full items-center justify-between px-5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400 hover:text-ink-600" aria-expanded={!closed}>
                {g.label}
                <span className={`transition-transform ${closed ? "-rotate-90" : ""}`} aria-hidden>▾</span>
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
                          className={`flex items-center justify-between gap-2 px-5 py-2 border-l-[3px] ${active ? "border-brand-600 bg-brand-600/10 text-brand-600 font-medium" : "border-transparent text-ink-600 hover:bg-black/[0.03] hover:text-ink-900"}`}
                          aria-current={active ? "page" : undefined}
                        >
                          <span className="truncate">{i.label}</span>
                          {!i.ready && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/15" title="Đang xây dựng" />}
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
      <div className="shrink-0 border-t border-black/5 px-5 py-3 text-[11px] text-ink-400">
        <div className="font-medium text-ink-600">Sata Robo Admin</div>
        <div>Nền tảng mới · 2026</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[256px_1fr] print:block">
      <IdleGuard minutes={idleMinutes} />
      <CommandPalette nav={nav} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">Bỏ qua menu</a>
      <aside className="hidden lg:block sticky top-0 h-dvh border-r border-black/5 bg-white print:!hidden">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/30" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="print:hidden sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-black/5 bg-white/95 px-4 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 hover:bg-black/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở menu">☰</button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/[0.03] px-4 py-2 text-left text-sm text-ink-400 hover:bg-black/[0.06] md:max-w-md"
            aria-label="Tìm nhanh (Ctrl + K)"
          >
            <span aria-hidden>⌕</span>
            <span className="truncate">Tìm trang, học viên, lead, lớp…</span>
            <kbd className="ml-auto hidden rounded border border-black/10 bg-white px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell canRunWorker={canRunWorker} />
            <div className="relative">
              <button className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-black/5" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{me.initials}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight">{me.fullName}</span>
                  <span className="block text-[11px] text-ink-400 leading-tight">{me.roleLabel}</span>
                </span>
                <span className="text-ink-400" aria-hidden>▾</span>
              </button>
              {userOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-black/5 bg-white p-2 shadow-lg text-sm">
                  <div className="px-2 py-1.5 text-xs text-ink-400 truncate">{me.email}</div>
                  <Link href="/bao-mat" className="block rounded-lg px-2 py-1.5 hover:bg-black/5">Bảo mật tài khoản</Link>
                  <Link href="/teacher" className="block rounded-lg px-2 py-1.5 hover:bg-black/5">Ứng dụng giáo viên</Link>
                  <Link href="/logout" prefetch={false} className="block rounded-lg px-2 py-1.5 text-red-700 hover:bg-red-50">Đăng xuất</Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] p-4 outline-none md:p-6">{children}</main>
      </div>
    </div>
  );
}
