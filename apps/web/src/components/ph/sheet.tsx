"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Bảng trượt từ đáy màn hình (bottom sheet) cho thao tác nhanh của phụ huynh.
 * Esc / chạm nền để đóng, giữ tiêu điểm bàn phím trong bảng, trả tiêu điểm về nút mở khi đóng.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("button, a[href], input, textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled])');
      if (!nodes.length) return;
      const a = nodes[0]!;
      const z = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center print:hidden">
      <button type="button" aria-label="Đóng" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-t-3xl bg-white px-4 pt-3 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-black/10" aria-hidden />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-11 w-11 place-items-center rounded-xl text-ink-600 hover:bg-muted">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto pb-1">{children}</div>
      </div>
    </div>
  );
}

/** Gọi API JSON của cổng phụ huynh; lỗi mạng trả thông báo tiếng Việt */
export async function phPost<T extends { ok: boolean; error?: string }>(url: string, body: unknown): Promise<T | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) return { ok: false, error: "Phiên đăng nhập đã hết — mở lại trang đăng nhập" };
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "Không kết nối được — kiểm tra mạng rồi thử lại" };
  }
}
