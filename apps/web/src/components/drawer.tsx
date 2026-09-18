"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Panel trượt bên phải — dùng thay cho tab phụ / khối phụ trên trang danh sách.
 * Nguyên tắc: màn hình chính chỉ giữ nhiệm vụ chính, nội dung tham khảo mở theo yêu cầu.
 */
export function Drawer({
  open, onClose, title, desc, width = "md", footer, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc?: string;
  /** sm ≈ 24rem · md ≈ 32rem · lg ≈ 44rem — luôn tối đa 95vw để không tràn ở 400px */
  width?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Giữ tiêu điểm bàn phím trong panel
      const nodes = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const w = width === "sm" ? "w-[24rem]" : width === "lg" ? "w-[44rem]" : "w-[32rem]";

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Đóng bảng bên" onClick={onClose} />
      <div
        ref={panelRef}
        className={`absolute right-0 top-0 flex h-full max-w-[95vw] flex-col border-l border-border bg-card shadow-2xl ${w}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">{title}</h2>
            {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng bên"
            className="-m-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-border p-3">{footer}</div>}
      </div>
    </div>
  );
}
