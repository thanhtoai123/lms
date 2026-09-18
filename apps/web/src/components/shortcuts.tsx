"use client";

import { useEffect, useState } from "react";

/** Không bắt phím khi người dùng đang gõ trong ô nhập */
export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export interface ListKeyHandlers {
  /** Số dòng đang hiển thị */
  count: number;
  /** Enter — mở chi tiết dòng đang trỏ */
  onOpen?: (index: number) => void;
  /** Space — chọn / bỏ chọn dòng đang trỏ */
  onToggle?: (index: number) => void;
  /** E — chạy hành động chính của dòng đang trỏ */
  onPrimary?: (index: number) => void;
  /** Tắt tạm (vd khi đang mở panel bên) */
  disabled?: boolean;
}

/**
 * Phím tắt trên danh sách: j/k (hoặc ↑/↓) di chuyển, Enter mở, Space chọn, E làm.
 * Trả về chỉ số dòng đang trỏ để trang tự tô sáng và cuộn tới.
 */
export function useListKeys({ count, onOpen, onToggle, onPrimary, disabled }: ListKeyHandlers) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => { setCursor((c) => Math.min(c, Math.max(0, count - 1))); }, [count]);

  useEffect(() => {
    if (disabled || count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "j" || k === "J" || k === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(count - 1, c + 1)); }
      else if (k === "k" || k === "K" || k === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (k === "Enter" && onOpen) { e.preventDefault(); onOpen(cursor); }
      else if (k === " " && onToggle) { e.preventDefault(); onToggle(cursor); }
      else if ((k === "e" || k === "E") && onPrimary) { e.preventDefault(); onPrimary(cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, cursor, onOpen, onToggle, onPrimary, disabled]);

  useEffect(() => {
    document.querySelector(`[data-row-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return { cursor, setCursor };
}

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["Ctrl", "K"], desc: "Mở bảng lệnh: tìm kiếm + hành động nhanh" },
  { keys: ["/"], desc: "Mở bảng lệnh (khi không ở trong ô nhập)" },
  { keys: ["?"], desc: "Bật / tắt bảng phím tắt này" },
  { keys: ["J"], desc: "Xuống một dòng trong danh sách" },
  { keys: ["K"], desc: "Lên một dòng trong danh sách" },
  { keys: ["Enter"], desc: "Mở chi tiết dòng đang trỏ" },
  { keys: ["Space"], desc: "Chọn / bỏ chọn dòng đang trỏ" },
  { keys: ["E"], desc: "Chạy hành động chính của dòng đang trỏ" },
  { keys: ["Esc"], desc: "Đóng bảng lệnh / bảng bên / hộp thoại" },
];

/** Bảng phím tắt bật bằng `?` — đặt một lần ở AdminShell */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
      if (e.key !== "?" || isTypingTarget(e.target) || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/30 p-4 print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-label="Bảng phím tắt">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-bold text-foreground">Phím tắt</h2>
          <p className="text-xs text-muted-foreground">Bấm <kbd className="rounded border border-border px-1">?</kbd> bất cứ lúc nào để mở lại bảng này.</p>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {SHORTCUTS.map((s) => (
            <li key={s.desc} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="text-foreground">{s.desc}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => <kbd key={k} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{k}</kbd>)}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-3 text-right">
          <button type="button" className="btn-ghost min-h-10" onClick={() => setOpen(false)}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
