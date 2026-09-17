"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function TargetForm({ centers, year, curMonth }: { centers: { id: string; code: string; name: string }[]; year: number; curMonth: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const defMonth = curMonth.startsWith(String(year)) ? curMonth : `${year}-01`;
  const [centerId, setCenter] = useState(centers[0]?.id ?? "");
  const [period, setPeriod] = useState(defMonth);
  const [amount, setAmount] = useState("");
  const [enroll, setEnroll] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation(trpc.reports.setTarget.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="card flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId, period, amount: Math.round(Number(amount.replace(/\D/g, "")) || 0), newEnrollments: enroll ? Number(enroll) : null, note: note || null }); }}>
      <h3 className="w-full font-semibold">Đặt / sửa mục tiêu tháng</h3>
      <label className="text-xs">Cơ sở<select className="input mt-1" value={centerId} onChange={(e) => setCenter(e.target.value)}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
      <label className="text-xs">Tháng<input type="month" className="input mt-1" value={period} onChange={(e) => setPeriod(e.target.value)} required /></label>
      <label className="text-xs">Doanh thu mục tiêu (đ)<input inputMode="numeric" className="input mt-1 w-40" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="60000000" required /></label>
      <label className="text-xs">Ghi danh mới<input type="number" min={0} className="input mt-1 w-24" value={enroll} onChange={(e) => setEnroll(e.target.value)} /></label>
      <label className="flex-1 text-xs">Ghi chú<input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
      <button className="btn-primary" disabled={m.isPending || !centerId}>Lưu</button>
      {m.error && <p className="w-full text-sm text-red-700">{m.error.message}</p>}
      {m.data && !m.isPending && <p className="w-full text-sm text-green-700">Đã lưu mục tiêu {period}.</p>}
    </form>
  );
}
