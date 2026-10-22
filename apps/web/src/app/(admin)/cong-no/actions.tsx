"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";

/** Dialog “Sửa học phí hợp đồng” — cần lý do, sinh bút toán điều chỉnh */
export function EditEnrollmentFee({ enrollmentId, current, studentName }: { enrollmentId: string; current: number; studentName: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newTotal, setNewTotal] = useState(current);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.finance.updateEnrollmentFee.mutationOptions({
    onSuccess: (r) => { setOpen(false); setErr(null); setNote(r.discountApproval === "pending" ? "Đã sửa — đơn chờ quản lý duyệt giảm giá, tạm chưa thu được tiền" : null); router.refresh(); },
    onError: (e) => setErr(e.message),
  }));
  const [note, setNote] = useState<string | null>(null);
  if (!open) return <span>{note && <span className="mr-2 text-amber-800">{note}</span>}<button className="text-brand-600 hover:underline" onClick={() => setOpen(true)}>Sửa học phí</button></span>;
  const delta = Math.round(newTotal) - current;
  return (
    <div className="space-y-1 rounded-lg border border-black/10 p-2">
      <div className="font-semibold">Sửa học phí hợp đồng — {studentName}</div>
      <div>Học phí cũ {vnd(current)} → <input type="number" min={0} step={1000} className="input !w-36 !py-1 text-xs" value={newTotal} onChange={(e) => setNewTotal(Number(e.target.value))} /></div>
      <input className="input !py-1 text-xs" placeholder="Lý do sửa (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {delta !== 0 && <div className="text-amber-800">Sẽ sinh bút toán {delta > 0 ? "+" : "−"}{vnd(Math.abs(delta))}{delta < 0 ? " · giảm chạm ngưỡng duyệt thì đơn chờ quản lý duyệt" : ""}. Kế hoạch thanh toán tự cân lại.</div>}
      {err && <div className="text-red-700">{err}</div>}
      <div className="flex gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={save.isPending || delta === 0 || reason.trim().length < 5} onClick={() => save.mutate({ enrollmentId, newTotal: Math.round(newTotal), reason: reason.trim() })}>Lưu học phí</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}
