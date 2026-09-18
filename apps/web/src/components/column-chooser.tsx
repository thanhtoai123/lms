"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Nút "Cột hiển thị": chọn / bỏ cột của một bảng, nhớ theo từng người dùng (localStorage).
 *
 * Dùng được cho **bảng dựng sẵn ở máy chủ**: không cần biến bảng thành client component.
 * Cách gắn:
 *   · thẻ bọc bảng:  `<div data-table="leads">…</div>`
 *   · mỗi ô (th và td): `data-col="phone"`
 *   · đặt `<ColumnChooser tableKey="leads" columns={[…]} />` ở thanh công cụ.
 * Component chèn một thẻ <style> ẩn đúng những cột bị bỏ tick.
 */

export interface ColumnDef {
  /** Trùng với data-col của ô */
  key: string;
  label: string;
  /** Cột luôn hiện, không cho bỏ (vd cột tên, cột hành động) */
  locked?: boolean;
  /** Mặc định ẩn khi người dùng chưa chọn gì */
  defaultHidden?: boolean;
}

const PREFIX = "satarobo:cols:";

/** Đọc lựa chọn đã lưu; hỏng / chưa có thì dùng mặc định của bảng */
export function loadHidden(tableKey: string, columns: readonly ColumnDef[]): string[] {
  const fallback = columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.key);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + tableKey);
    if (!raw) return fallback;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return fallback;
    const valid = new Set(columns.filter((c) => !c.locked).map((c) => c.key));
    return arr.filter((x): x is string => typeof x === "string" && valid.has(x));
  } catch {
    return fallback;
  }
}

export function ColumnChooser({ tableKey, columns, label = "Cột hiển thị" }: { tableKey: string; columns: readonly ColumnDef[]; label?: string }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Chỉ đọc localStorage sau khi gắn vào DOM để máy chủ và trình duyệt dựng giống nhau
  useEffect(() => {
    setHidden(loadHidden(tableKey, columns));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PREFIX + tableKey, JSON.stringify(hidden));
    } catch {
      /* chế độ riêng tư / chặn lưu trữ: vẫn dùng được trong phiên này */
    }
  }, [hidden, ready, tableKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const css = useMemo(() => {
    if (!hidden.length) return "";
    const sel = hidden.map((k) => `[data-table="${tableKey}"] [data-col="${k}"]`).join(",");
    return `${sel}{display:none!important}`;
  }, [hidden, tableKey]);

  const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((x) => x !== key) : [...h, key]));
  const optional = columns.filter((c) => !c.locked);
  const shown = columns.length - hidden.length;

  return (
    <div className="relative inline-block" ref={box}>
      {ready && css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <button type="button" className="btn-ghost !py-1.5 text-xs print:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}{hidden.length > 0 ? ` (${shown}/${columns.length})` : ""}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-black/10 bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-ink-400">
            <span>Bỏ tick để ẩn cột</span>
            {hidden.length > 0 && <button type="button" className="text-brand-600" onClick={() => setHidden([])}>Hiện hết</button>}
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {columns.map((c) => (
              <li key={c.key}>
                <label className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm ${c.locked ? "text-ink-400" : "hover:bg-black/5"}`}>
                  <input type="checkbox" checked={c.locked || !hidden.includes(c.key)} disabled={c.locked} onChange={() => toggle(c.key)} />
                  {c.label}{c.locked && <span className="ml-auto text-[10px]">luôn hiện</span>}
                </label>
              </li>
            ))}
          </ul>
          {optional.length === 0 && <p className="px-1.5 py-1 text-xs text-ink-400">Bảng này không có cột tuỳ chọn.</p>}
          <p className="px-1.5 pt-1 text-[11px] text-ink-400">Lựa chọn được nhớ trên máy này cho riêng bạn.</p>
        </div>
      )}
    </div>
  );
}
