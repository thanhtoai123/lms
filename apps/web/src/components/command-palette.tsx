"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { NavGroup } from "@/lib/admin-nav";

type Item = { key: string; group: string; title: string; sub?: string; href: string };

const KIND_LABEL: Record<string, string> = { student: "Học viên", lead: "Lead", class: "Lớp học", order: "Đơn hàng" };
const RECENT_KEY = "admin-recent-pages";

/** Bỏ dấu tiếng Việt để tìm "hoc bu" ra "Học bù" */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function readRecent(): { href: string; title: string }[] {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { href: string; title: string }[]).slice(0, 6); } catch { return []; }
}
export function rememberPage(href: string, title: string) {
  try {
    const list = readRecent().filter((x) => x.href !== href);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ href, title }, ...list].slice(0, 6)));
  } catch {}
}

/** Bảng lệnh: Ctrl/⌘ + K hoặc phím "/" — mở trang, tìm học viên / lead / lớp / đơn hàng */
export function CommandPalette({ nav, open, onOpenChange }: { nav: NavGroup[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<{ href: string; title: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onOpenChange(!open); }
      else if (e.key === "/" && !typing && !open) { e.preventDefault(); onOpenChange(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setDebounced(""); setActive(0); setRecent(readRecent());
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery(trpc.system.search.queryOptions({ q: debounced }, { enabled: open && debounced.length >= 2, staleTime: 30_000 }));

  const items = useMemo<Item[]>(() => {
    const f = fold(q.trim());
    const pages = nav.flatMap((g) => g.items.map((i) => ({ g: g.label, i })));
    const out: Item[] = [];
    if (!f) {
      recent.forEach((r) => out.push({ key: `r:${r.href}`, group: "Mở gần đây", title: r.title, href: r.href }));
      pages.slice(0, 8).forEach(({ g, i }) => out.push({ key: `p:${i.href}`, group: "Trang", title: i.label, sub: g, href: i.href }));
      return out;
    }
    const words = f.split(/\s+/);
    pages
      .map(({ g, i }) => {
        const hay = fold(`${i.label} ${g} ${i.desc ?? ""}`);
        const title = fold(i.label);
        if (!words.every((w) => hay.includes(w))) return null;
        return { score: title.startsWith(f) ? 0 : title.includes(f) ? 1 : 2, g, i };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .forEach(({ g, i }) => out.push({ key: `p:${i.href}`, group: "Trang", title: i.label, sub: i.desc ?? g, href: i.href }));
    if (debounced === q.trim()) (search.data?.hits ?? []).forEach((h) => out.push({ key: `${h.kind}:${h.id}`, group: KIND_LABEL[h.kind] ?? h.kind, title: h.title, sub: h.sub, href: h.href }));
    return out;
  }, [q, debounced, nav, recent, search.data]);

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, items.length - 1))); }, [items.length]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (!open) return null;
  const go = (it: Item | undefined) => {
    if (!it) return;
    onOpenChange(false);
    router.push(it.href);
  };
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh] print:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
        <div className="flex items-center gap-2 border-b border-black/5 px-4">
          <span aria-hidden className="text-ink-400">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
              else if (e.key === "Escape") { e.preventDefault(); onOpenChange(false); }
            }}
            className="h-14 flex-1 bg-transparent text-base outline-none"
            placeholder="Tìm trang, học viên, lead, lớp, mã đơn, SĐT…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={items[active] ? `cmdk-${active}` : undefined}
            aria-autocomplete="list"
          />
          {search.isFetching && <span className="text-xs text-ink-400">đang tìm…</span>}
          <kbd className="rounded border border-black/10 px-1.5 text-[11px] text-ink-400">Esc</kbd>
        </div>
        <ul id="cmdk-list" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-400">
              {q.trim().length < 2 ? "Gõ ít nhất 2 ký tự." : search.isFetching || debounced !== q.trim() ? "Đang tìm…" : "Không tìm thấy kết quả phù hợp."}
            </li>
          )}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.key} role="presentation">
                {header && <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{header}</div>}
                <div
                  id={`cmdk-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => go(it)}
                  className={`mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${idx === active ? "bg-brand-600/10 text-brand-700" : "text-ink-900"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{it.title}</span>
                    {it.sub && <span className="block truncate text-xs text-ink-400">{it.sub}</span>}
                  </span>
                  {idx === active && <span aria-hidden className="text-xs text-ink-400">↵</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-black/5 px-4 py-2 text-[11px] text-ink-400">
          <span><kbd>↑</kbd> <kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> hoặc <kbd>/</kbd> mở bảng này</span><span>SĐT hiển thị đã che</span>
        </div>
      </div>
    </div>
  );
}
