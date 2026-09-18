"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";
import { DISCOUNT_POLICIES, DISCOUNT_POLICY_VI, DISCOUNT_POLICY_KIND, DISCOUNT_POLICY_HINT, applyDiscountPolicy, type DiscountPolicy } from "@satarobo/core";

/**
 * Dialog “Ghi học phí cũ”: lập đơn (nếu chưa có) + ghi khoản mang dấu nhập liệu ban đầu.
 * Khoản ở trạng thái chờ kế toán — hệ thống cố ý không tự cho vào doanh thu.
 */
export function BackfillTuition({ enrollmentId, studentName, expected, hasOrder, maxMore, today, maxDiscountPercent = 50 }: {
  enrollmentId: string; studentName: string; expected: number; hasOrder: boolean; maxMore: number; today: string; maxDiscountPercent?: number;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ total: expected, policy: "none" as DiscountPolicy, discount: 0, discountReason: "", paidAmount: 0, paidAt: today, note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useMutation(trpc.finance.backfillTuition.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã ghi vào đơn ${r.code}` }); setOpen(false); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  // Cùng một hàm tính với máy chủ — form không tự bịa công thức riêng
  const dis = applyDiscountPolicy({ listPrice: Math.round(f.total), policy: f.policy, value: Math.round(f.discount), maxPercent: maxDiscountPercent, reason: f.discountReason });
  const total = Math.max(0, Math.round(f.total) - dis.amount);
  const mode = DISCOUNT_POLICY_KIND[f.policy];
  if (!open) {
    return (
      <div className="space-y-1">
        <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => setOpen(true)}>{hasOrder ? `Ghi thêm · tối đa ${vnd(maxMore)}` : "Ghi học phí"}</button>
        {msg && <div className={`text-[11px] ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      </div>
    );
  }
  return (
    <div className="w-72 space-y-1 rounded-xl border border-black/10 p-2 text-xs">
      <div className="font-semibold">Ghi học phí cũ — {studentName}</div>
      {!hasOrder && (
        <>
          <label className="block text-ink-600">Tổng học phí (đ)<input type="number" min={0} step={1000} className="input mt-1 !py-1 text-xs" value={f.total} onChange={(e) => setF({ ...f, total: Number(e.target.value) })} /></label>
          <label className="block text-ink-600">Chính sách giảm giá
            <select className="input mt-1 !py-1 text-xs" value={f.policy} onChange={(e) => setF({ ...f, policy: e.target.value as DiscountPolicy, discount: 0 })}>
              {DISCOUNT_POLICIES.map((p) => <option key={p} value={p}>{DISCOUNT_POLICY_VI[p]}</option>)}
            </select>
          </label>
          {mode !== "none" && (
            <>
              <label className="block text-ink-600">
                {mode === "percent" ? `Mức giảm (%, tối đa ${maxDiscountPercent})` : "Số tiền giảm (đồng)"}
                <input type="number" min={0} max={mode === "percent" ? maxDiscountPercent : undefined} step={mode === "percent" ? 1 : 1000}
                  className="input mt-1 !py-1 text-xs" value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} />
              </label>
              <div className="text-[11px] text-ink-400">{DISCOUNT_POLICY_HINT[f.policy]}{dis.amount > 0 ? ` · giảm ${vnd(dis.amount)}` : ""}</div>
              <input className="input !py-1 text-xs" placeholder="Lý do giảm giá * (Giới thiệu · ưu đãi hè 2026 · học bổng)" value={f.discountReason} onChange={(e) => setF({ ...f, discountReason: e.target.value })} />
              {dis.errors.length > 0 && f.discount > 0 && <div className="text-red-700">{dis.errors.join("; ")}</div>}
            </>
          )}
        </>
      )}
      <label className="block text-ink-600">{hasOrder ? "Số tiền đóng thêm (đ)" : "Tiền ĐÃ THU (đ)"}<input type="number" min={0} step={1000} className="input mt-1 !py-1 text-xs" value={f.paidAmount} onChange={(e) => setF({ ...f, paidAmount: Number(e.target.value) })} /></label>
      <label className="block text-ink-600">Ngày thu<input type="date" max={today} className="input mt-1 !py-1 text-xs" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></label>
      <input className="input !py-1 text-xs" placeholder="Ghi chú (VD: Cọc 1tr, cuối tháng đóng nốt…)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      {!hasOrder && <div className="text-ink-600">Tổng phải đóng {vnd(total)} · đã thu {vnd(f.paidAmount)} · còn thiếu {vnd(Math.max(0, total - f.paidAmount))}</div>}
      {!hasOrder && f.paidAmount > total && <div className="text-red-700">Đã thu lớn hơn tổng phải đóng — kiểm tra lại.</div>}
      {msg && !msg.ok && <div className="text-red-700">{msg.text}</div>}
      <div className="flex gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs"
          disabled={run.isPending || f.paidAmount < 0 || (!hasOrder && (total <= 0 || f.paidAmount > total || (mode !== "none" && dis.errors.length > 0)))}
          onClick={() => { setMsg(null); run.mutate({ enrollmentId, total: hasOrder ? null : Math.round(f.total), discountPolicy: hasOrder ? null : f.policy, discount: hasOrder ? null : Math.round(f.discount), discountReason: f.discountReason || null, paidAmount: Math.round(f.paidAmount), paidAt: f.paidAt, note: f.note || null }); }}>
          {hasOrder ? `Ghi thêm ${vnd(f.paidAmount)}` : "Tạo đơn + ghi khoản"}
        </button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}
