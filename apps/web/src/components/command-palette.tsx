"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { NavGroup } from "@/lib/admin-nav";

type Item = { key: string; group: string; title: string; sub?: string; href: string };

const KIND_LABEL: Record<string, string> = { student: "Học viên", lead: "Lead", class: "Lớp học", order: "Đơn hàng" };
const RECENT_KEY = "admin-recent-pages";

/**
 * Hành động nhanh: gõ là ra, Enter là chạy — đi thẳng tới đúng ô nhập đầu tiên
 * thay vì Menu → trang danh sách → nút tạo.
 * `needs` là đường dẫn phải có trong menu của người dùng: menu đã lọc theo quyền
 * nên không cần kiểm tra quyền lần nữa ở đây.
 */
const QUICK_ACTIONS: { title: string; sub: string; href: string; needs: string; words: string }[] = [
  { title: "Xem việc hôm nay", sub: "Hộp việc gộp theo quyền của bạn", href: "/viec-hom-nay", needs: "/viec-hom-nay", words: "viec hom nay inbox todo can xu ly" },
  { title: "Tạo lead mới", sub: "Nhập khách hàng mới", href: "/nhap-khach-hang", needs: "/nhap-khach-hang", words: "tao lead khach hang moi them" },
  { title: "Nhập lead từ file", sub: "Dán từ Excel / đọc CSV", href: "/leads/import", needs: "/leads/import", words: "nhap lead file excel csv import" },
  { title: "Thêm học viên", sub: "Hồ sơ học viên mới", href: "/students/new", needs: "/students", words: "them hoc vien moi tao" },
  { title: "Tạo đăng ký học", sub: "Ghi danh học viên vào lớp", href: "/enrollments/new", needs: "/enrollments", words: "dang ky hoc ghi danh tao moi" },
  { title: "Tạo đơn hàng / thu tiền", sub: "Lập đơn học phí, sinh QR thanh toán", href: "/orders/new", needs: "/orders", words: "tao don hang thu tien hoc phi qr" },
  { title: "Xác nhận phiếu thu", sub: "Khoản thu đang chờ kế toán", href: "/payments?status=recorded", needs: "/payments", words: "xac nhan phieu thu ke toan tien" },
  { title: "Xem công nợ", sub: "Đơn còn thiếu tiền theo tuổi nợ", href: "/cong-no", needs: "/cong-no", words: "cong no thieu tien" },
  { title: "Điểm danh lớp", sub: "Mở lưới điểm danh", href: "/attendance", needs: "/attendance", words: "diem danh lop buoi hoc" },
  { title: "Tạo lớp mới", sub: "Mở lớp và xếp lịch", href: "/classes/new", needs: "/classes", words: "tao lop moi mo lop" },
  { title: "Duyệt ảnh lớp", sub: "Ảnh chờ duyệt theo buổi", href: "/duyet-media", needs: "/duyet-media", words: "duyet anh lop media" },
  { title: "Duyệt đơn từ", sub: "Đơn nghỉ / đơn công chờ duyệt", href: "/don-tu?status=pending", needs: "/don-tu", words: "duyet don tu nghi phep cong" },
  { title: "Học bạ cần viết / duyệt", sub: "Lưới học bạ mốc theo lớp và hàng đợi duyệt", href: "/ho-so-hoc-tap?xem=hoc-ba-moc", needs: "/ho-so-hoc-tap?xem=hoc-ba-moc", words: "hoc ba moc viet duyet report card" },
  { title: "Tra cứu hồ sơ học tập", sub: "Chọn học viên → học bạ, chứng nhận, in PDF", href: "/ho-so-hoc-tap?xem=tra-cuu", needs: "/ho-so-hoc-tap?xem=tra-cuu", words: "tra cuu hoc ba ho so hoc tap hoc vien" },
  { title: "Xem báo cáo", sub: "Chỉ mục mọi báo cáo nghiệp vụ", href: "/bao-cao", needs: "/bao-cao", words: "bao cao thong ke doanh thu lead" },
  { title: "Bảo mật tài khoản", sub: "Xác thực 2 lớp bằng ứng dụng OTP", href: "/bao-mat", needs: "/viec-hom-nay", words: "bao mat tai khoan 2 lop otp mat khau" },
  { title: "Làm đơn của tôi", sub: "Xin nghỉ, bổ sung công, đổi ca", href: "/cham-cong/lich-ca", needs: "/cham-cong/lich-ca", words: "lam don xin nghi cong ca cua toi" },
];

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
    // Trang = mục menu + chip của trang trung tâm (vd "Học bạ & hồ sơ học tập › Tra cứu học viên")
    const pages = nav.flatMap((g) => g.items.flatMap((it) => [
      { g: g.label, i: { label: it.label, href: it.href, desc: it.desc, keywords: it.keywords } },
      ...(it.tabs ?? []).filter((t) => t.href !== it.href).map((t) => ({ g: g.label, i: { label: `${it.label} › ${t.label}`, href: t.href, desc: t.desc, keywords: it.keywords } })),
    ]));
    const navHrefs = new Set(pages.map(({ i }) => i.href));
    const actions = QUICK_ACTIONS.filter((a) => navHrefs.has(a.needs));
    const out: Item[] = [];
    if (!f) {
      actions.slice(0, 5).forEach((a) => out.push({ key: `a:${a.href}`, group: "Hành động nhanh", title: a.title, sub: a.sub, href: a.href }));
      recent.forEach((r) => out.push({ key: `r:${r.href}`, group: "Mở gần đây", title: r.title, href: r.href }));
      pages.slice(0, 8).forEach(({ g, i }) => out.push({ key: `p:${i.href}`, group: "Trang", title: i.label, sub: g, href: i.href }));
      return out;
    }
    const words = f.split(/\s+/);
    actions
      .filter((a) => { const hay = fold(`${a.title} ${a.sub} ${a.words}`); return words.every((w) => hay.includes(w)); })
      .slice(0, 6)
      .forEach((a) => out.push({ key: `a:${a.href}`, group: "Hành động nhanh", title: a.title, sub: a.sub, href: a.href }));
    pages
      .map(({ g, i }) => {
        const hay = fold(`${i.label} ${g} ${i.desc ?? ""} ${i.keywords ?? ""}`);
        const title = fold(i.label);
        if (!words.every((w) => hay.includes(w))) return null;
        return { score: title.startsWith(f) ? 0 : title.includes(f) ? 1 : 2, g, i };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .forEach(({ g, i }) => out.push({ key: `p:${i.href}`, group: "Trang", title: i.label, sub: i.desc ?? g, href: i.href }));
    if (debounced === q.trim()) (search.data?.hits ?? []).forEach((h) => out.push({ key: `${h.kind}:${h.id}`, group: KIND_LABEL[h.kind] ?? h.kind, title: h.title, sub: h.sub, href: h.href }));
    // Luôn có lối sang trang kết quả đầy đủ (phân nhóm theo loại, phân trang)
    if (f.length >= 2) out.push({ key: "all", group: "Tất cả", title: "Xem tất cả kết quả →", sub: `Trang /search cho “${q.trim()}”`, href: `/search?q=${encodeURIComponent(q.trim())}` });
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
            placeholder="Gõ việc muốn làm (tạo lead, thu tiền, điểm danh…) hoặc tên học viên, lead, lớp, mã đơn, SĐT"
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
          <span><kbd>↑</kbd> <kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> chạy</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> hoặc <kbd>/</kbd> mở bảng này</span><span><kbd>?</kbd> bảng phím tắt</span><span>SĐT hiển thị đã che</span>
        </div>
      </div>
    </div>
  );
}
