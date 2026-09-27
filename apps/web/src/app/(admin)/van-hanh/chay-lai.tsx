"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/**
 * Nút "Chạy lại" cho hàng đợi chết của outbox (KT-03). Chỉ bấm SAU KHI đã sửa nguyên nhân
 * (xem lý do ở cột lỗi) — nếu không, sự kiện sẽ hỏng tiếp và quay lại đây sau 5 lần thử.
 */
export function ChayLaiHangDoiChet({ soLuong }: { soLuong: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [xacNhan, setXacNhan] = useState(false);
  const m = useMutation(trpc.engagement.retryDeadLetter.mutationOptions({ onSuccess: () => { setXacNhan(false); router.refresh(); } }));
  if (soLuong === 0 && !m.data) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-black/5 p-3 text-sm">
      {m.data ? (
        <span className="text-green-700">Đã đưa {m.data.requeued} sự kiện trở lại hàng đợi — worker sẽ xử lý ở nhịp kế tiếp.</span>
      ) : !xacNhan ? (
        <button type="button" className="btn-ghost" onClick={() => setXacNhan(true)}>Chạy lại {soLuong} sự kiện hỏng…</button>
      ) : (
        <>
          <span className="text-ink-600">Đã sửa nguyên nhân chưa? Chạy lại mà chưa sửa thì sự kiện sẽ hỏng tiếp.</span>
          <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({})}>{m.isPending ? "Đang đưa lại…" : "Đã sửa — chạy lại"}</button>
          <button type="button" className="btn-ghost" onClick={() => setXacNhan(false)}>Thôi</button>
        </>
      )}
      {m.error && <span className="text-red-700">{m.error.message}</span>}
    </div>
  );
}

/** Đánh dấu một nhóm lỗi máy chủ đã xử lý (tái phát thì tự hiện lại) */
export function DaXuLyLoi({ fingerprint }: { fingerprint: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.system.resolveServerError.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <button type="button" className="btn-ghost !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ fingerprint })}>
      {m.isPending ? "…" : "Đã xử lý"}
    </button>
  );
}
