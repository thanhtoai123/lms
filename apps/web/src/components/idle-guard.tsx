"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const PING_EVERY = 4 * 60_000;
const WARN_BEFORE = 2 * 60_000;

/**
 * Tự đăng xuất khi không thao tác: báo máy chủ khi người dùng còn gõ / bấm (tối đa 4 phút một lần),
 * cảnh báo 2 phút trước khi hết, hết thì chuyển tới /logout?reason=idle. Máy chủ vẫn kiểm tra độc lập.
 */
export function IdleGuard({ minutes }: { minutes: number | null }) {
  const lastActive = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!minutes) return;
    const limit = minutes * 60_000;
    const ping = () => {
      lastPing.current = Date.now();
      fetch("/api/auth/ping", { method: "POST", credentials: "same-origin" })
        .then((r) => { if (r.status === 401) window.location.href = "/logout?reason=idle"; })
        .catch(() => {});
    };
    const onActive = () => {
      lastActive.current = Date.now();
      if (Date.now() - lastPing.current > PING_EVERY) ping();
    };
    const events = ["keydown", "pointerdown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActive, { passive: true }));
    // Nhiều tab: tab khác vừa thao tác thì tab này cũng tính
    const onStorage = (e: StorageEvent) => { if (e.key === "sr-active" && e.newValue) lastActive.current = Math.max(lastActive.current, Number(e.newValue)); };
    window.addEventListener("storage", onStorage);
    const share = setInterval(() => { try { localStorage.setItem("sr-active", String(lastActive.current)); } catch {} }, 30_000);
    const tick = setInterval(() => {
      const remain = limit - (Date.now() - lastActive.current);
      // Mất mạng (giáo viên điểm danh offline): không rời trang; máy chủ sẽ yêu cầu đăng nhập lại khi có mạng
      if (remain <= 0) { if (navigator.onLine) window.location.href = "/logout?reason=idle"; return; }
      setLeft(remain <= WARN_BEFORE ? remain : null);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActive));
      window.removeEventListener("storage", onStorage);
      clearInterval(share);
      clearInterval(tick);
    };
  }, [minutes]);

  if (left === null) return null;
  const s = Math.ceil(left / 1000);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="card w-full max-w-sm space-y-3 p-5">
        <h2 id="idle-title" className="text-lg font-semibold">Sắp tự đăng xuất</h2>
        <p className="text-sm text-ink-600">Bạn không thao tác một lúc. Hệ thống sẽ đăng xuất sau <b aria-live="polite">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</b> để bảo vệ dữ liệu.</p>
        <div className="flex justify-end gap-2">
          <Link href="/logout" prefetch={false} className="btn-ghost">Đăng xuất</Link>
          <button
            className="btn-primary"
            autoFocus
            onClick={() => {
              lastActive.current = Date.now();
              lastPing.current = Date.now();
              setLeft(null);
              fetch("/api/auth/ping", { method: "POST", credentials: "same-origin" }).catch(() => {});
            }}
          >
            Tiếp tục làm việc
          </button>
        </div>
      </div>
    </div>
  );
}
