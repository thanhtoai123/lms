"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, TriangleAlert, Undo2, X } from "lucide-react";

export type ToastTone = "ok" | "error" | "info";

export interface ToastOptions {
  tone?: ToastTone;
  /** Mô tả phụ (vd: "3 việc, 1 việc lỗi") */
  detail?: string;
  /** Nút Hoàn tác — chỉ đặt cho hành động thật sự đảo ngược được */
  undoLabel?: string;
  onUndo?: () => void | Promise<void>;
  /** Mặc định 5 giây; có Hoàn tác thì 9 giây cho kịp bấm */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  undoing?: boolean;
  undone?: boolean;
}

interface ToastApi {
  /** Hiện một thông báo; trả về id để tự đóng sớm nếu cần */
  show: (message: string, options?: ToastOptions) => number;
  ok: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Hộp thông báo dùng chung cho khu quản trị.
 * Đặt một lần ở AdminShell; mọi trang gọi `useToast()`.
 * Không dùng thư viện ngoài để giữ bundle nhẹ và bám đúng token màu bản gốc.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const id = ++seq.current;
    const duration = options.durationMs ?? (options.onUndo ? 9000 : 5000);
    setItems((list) => [...list.slice(-3), { id, message, ...options }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
    return id;
  }, [dismiss]);

  // Dọn hẹn giờ khi rời trang để không rò rỉ
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => clearTimeout(t)); map.clear(); };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    ok: (m, o) => show(m, { ...o, tone: "ok" }),
    error: (m, o) => show(m, { ...o, tone: "error" }),
    dismiss,
  }), [show, dismiss]);

  const runUndo = async (item: ToastItem) => {
    if (!item.onUndo || item.undoing || item.undone) return;
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, undoing: true } : x)));
    try {
      await item.onUndo();
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, undoing: false, undone: true, message: "Đã hoàn tác." } : x)));
      const t = timers.current.get(item.id);
      if (t) clearTimeout(t);
      timers.current.set(item.id, setTimeout(() => dismiss(item.id), 2500));
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, undoing: false, tone: "error", message: "Không hoàn tác được", detail: e instanceof Error ? e.message : undefined } : x)));
    }
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => {
          const tone = t.tone ?? "info";
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-lg ${
                tone === "ok" ? "border-green-200 bg-green-50 text-green-900"
                  : tone === "error" ? "border-red-200 bg-red-50 text-red-800"
                    : "border-border bg-card text-foreground"
              }`}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {tone === "ok" ? <Check className="h-4 w-4" /> : tone === "error" ? <TriangleAlert className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-snug">{t.message}</div>
                {t.detail && <div className="mt-0.5 break-words text-xs opacity-80">{t.detail}</div>}
                {t.onUndo && !t.undone && (
                  <button
                    type="button"
                    onClick={() => void runUndo(t)}
                    disabled={t.undoing}
                    className="mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-primary underline-offset-2 transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    {t.undoing ? "Đang hoàn tác…" : t.undoLabel ?? "Hoàn tác"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Đóng thông báo"
                className="-m-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

/** Không có Provider (vd trang công khai) thì trả về API rỗng để không làm gãy trang */
const NOOP: ToastApi = { show: () => 0, ok: () => 0, error: () => 0, dismiss: () => {} };

export function useToast(): ToastApi {
  return useContext(Ctx) ?? NOOP;
}
