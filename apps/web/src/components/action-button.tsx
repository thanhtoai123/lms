"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Nút hành động chính: tự khoá khi đang chạy nên không thể nhấn đúp,
 * có chữ "Đang…" và `aria-busy` cho trình đọc màn hình.
 * Vùng chạm tối thiểu 40px (min-h-10) theo chuẩn tiếp cận.
 */
export function ActionButton({
  onRun, children, busyLabel = "Đang xử lý…", variant = "primary", className = "", disabled, title, ariaLabel,
}: {
  onRun: () => void | Promise<unknown>;
  children: React.ReactNode;
  busyLabel?: string;
  variant?: "primary" | "ghost" | "quiet";
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const run = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    try {
      await onRun();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const base = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft";
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || disabled}
      aria-busy={busy}
      aria-label={ariaLabel}
      title={title}
      className={`${base} min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {busy ? busyLabel : children}
    </button>
  );
}

/** Khung xương khi đang tải — giữ đúng chiều cao dòng để trang không nhảy */
export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-24 shrink-0 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Trạng thái rỗng tử tế: nói rõ đang tốt, và gợi ý việc tiếp theo */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
