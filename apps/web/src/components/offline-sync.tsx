"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc/client";
import { queued, removeQueued, markFailed, isNetworkError, QUEUE_EVENT, dropLocal } from "@/lib/offline-queue";
import type { AttendanceStatus } from "@satarobo/core";

/** Gửi lại điểm danh đã lưu khi mất mạng; hiện thanh trạng thái cho giáo viên */
export function OfflineSync() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const q = queued();
    setPending(q.length);
    setLastError(q.find((x) => x.lastError)?.lastError ?? null);
  }, []);

  const flush = useCallback(async () => {
    if (busy || !navigator.onLine) return;
    const items = queued();
    if (!items.length) return;
    setBusy(true);
    for (const it of items) {
      try {
        await client.academics.sessions.recordAttendance.mutate({ sessionId: it.sessionId, records: it.records.map((r) => ({ ...r, status: r.status as AttendanceStatus })) });
        if (it.submit) await client.academics.sessions.transition.mutate({ sessionId: it.sessionId, event: "submit_attendance" }).catch(() => undefined);
        removeQueued(it.id);
        dropLocal(`draft:${it.sessionId}`);
        void qc.invalidateQueries({ queryKey: trpc.academics.sessions.get.queryKey({ id: it.sessionId }) });
      } catch (e) {
        if (isNetworkError(e)) break;
        if ((e as { data?: { code?: string } }).data?.code === "UNAUTHORIZED") {
          // Hết phiên (không thao tác lâu): giữ nguyên hàng đợi, gửi lại sau khi đăng nhập
          markFailed(it.id, "Phiên đăng nhập đã hết — đăng nhập lại, dữ liệu điểm danh vẫn được giữ và tự gửi");
          break;
        }
        markFailed(it.id, (e as Error).message);
      }
    }
    void qc.invalidateQueries({ queryKey: trpc.teacher.today.queryKey() });
    setBusy(false);
    refresh();
  }, [busy, client, qc, refresh, trpc]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(QUEUE_EVENT, refresh);
    const t = window.setInterval(() => void flush(), 30_000);
    void flush();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.clearInterval(t);
    };
  }, [flush, refresh]);

  if (online && pending === 0) return null;
  return (
    <div className={`sticky top-[49px] z-10 px-4 py-2 text-xs ${online ? "bg-amber-50 text-amber-900" : "bg-slate-800 text-white"}`} role="status">
      {!online && <span>Đang mất mạng — điểm danh vẫn lưu trên máy. </span>}
      {pending > 0 && (
        <span>
          {pending} buổi chờ gửi{busy ? " (đang gửi…)" : ""}.{" "}
          {online && !busy && <button type="button" className="underline" onClick={() => void flush()}>Gửi ngay</button>}
          {lastError && <span className="block text-red-700">Lỗi lần gửi trước: {lastError}</span>}
        </span>
      )}
    </div>
  );
}
