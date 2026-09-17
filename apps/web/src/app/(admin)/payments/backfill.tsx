"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd, fmtD } from "@/components/finance-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Data = RouterOutputs["finance"]["backfillPreview"];

/** Khối “Học phí nhập từ file” ở /payments: xem thử rồi kế toán xác nhận cả lượt */
export function BackfillBatch({ data }: { data: Data }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useMutation(trpc.finance.bulkConfirmBackfill.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã xác nhận ${r.confirmed} khoản · ${vnd(r.amount)} vào doanh thu.${r.failed.length ? ` ${r.failed.length} khoản lỗi — xem nhật ký ở /audit-log.` : ""}` }); setNote(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const t = data.totals;
  const skipped = data.items.filter((i) => !i.willConfirm);
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Học phí nhập từ file</h2>
        <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen((v) => !v)}>{open ? "Ẩn" : "Xem thử"}</button>
      </div>
      <p className="text-xs text-ink-600">
        Khoản của khách chốt trước khi lên hệ thống đang ở trạng thái <b>chờ kế toán</b> nên chưa vào doanh thu. Xem thử trước, rồi xác nhận cả lượt.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>Đang chờ kế toán: <b>{t.pending}</b> khoản</span>
        <span className="text-green-700">Sẽ xác nhận: <b>{t.willConfirm}</b> khoản · {vnd(t.amount)}</span>
        <span className="text-amber-800">Bỏ qua: <b>{t.skipped}</b> khoản</span>
      </div>
      {open && (
        <div className="space-y-2">
          <div className="max-h-72 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-ink-400"><tr><th className="p-2">Đơn</th><th className="p-2">Học viên / khách</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Ngày thu</th><th className="p-2">Kết quả</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {(showSkipped ? skipped : data.items).map((i) => (
                  <tr key={i.id} className={i.willConfirm ? "" : "bg-amber-50/60"}>
                    <td className="p-2"><Link href={`/orders/${i.orderId}`} className="font-mono text-brand-600">{i.orderCode}</Link><div className="text-ink-400">{i.centerCode}</div></td>
                    <td className="p-2">{i.studentName ?? i.customerName}</td>
                    <td className="p-2 text-right tabular-nums">{vnd(i.amount)}</td>
                    <td className="p-2">{fmtD(i.paidAt)}</td>
                    <td className="p-2">{i.willConfirm ? <span className="text-green-700">Sẽ xác nhận</span> : <span className="text-amber-800">{i.blockers.join("; ")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {skipped.length > 0 && <button className="text-xs text-brand-600" onClick={() => setShowSkipped((v) => !v)}>{showSkipped ? "Xem tất cả" : `Xem ${skipped.length} khoản bị bỏ và sửa`}</button>}
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" placeholder="Ghi chú lượt xác nhận (bắt buộc), VD: Học phí tháng 8 từ admin cũ" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={run.isPending || note.trim().length < 5 || t.willConfirm === 0} onClick={() => run.mutate({ note: note.trim(), paymentIds: null })}>
              Xác nhận {t.willConfirm} khoản · {vnd(t.amount)}
            </button>
          </div>
        </div>
      )}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}
