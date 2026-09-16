"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";
import { vnd } from "@/components/finance-ui";

export function RefundRequest({ initialEnrollmentId }: { initialEnrollmentId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(!!initialEnrollmentId);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [enrollmentId, setEnrollmentId] = useState(initialEnrollmentId ?? "");
  const [amount, setAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const enr = useQuery({ ...trpc.students.openEnrollments.queryOptions({ studentId: student?.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: !!student });
  const prev = useQuery({ ...trpc.finance.refundPreview.queryOptions({ enrollmentId: enrollmentId || "00000000-0000-0000-0000-000000000000" }), enabled: !!enrollmentId, retry: false });
  const req = useMutation(trpc.finance.requestRefund.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã gửi yêu cầu hoàn tiền — chờ quản lý cơ sở duyệt." }); setReason(""); setAmount(""); router.refresh(); prev.refetch(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Đề xuất hoàn tiền</button>;
  const p = prev.data;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Đề xuất hoàn tiền</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      {!initialEnrollmentId && (
        <div className="grid gap-2 sm:grid-cols-2">
          <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollmentId(""); }} />
          {student && (
            <select className="input" value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)}>
              <option value="">— Chọn đăng ký học —</option>
              {(enr.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.classCode} · {e.courseCode} · đã học {e.consumed}/{e.packageSessions}</option>)}
            </select>
          )}
        </div>
      )}
      {prev.error && <div className="text-sm text-red-700">{prev.error.message}</div>}
      {p && (
        !p.order ? <div className="rounded-xl bg-black/[0.03] p-3 text-sm">Đăng ký {p.enrollment.classCode} ({p.enrollment.studentName}) chưa có đơn đã thu tiền.</div> : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đơn</div><b className="font-mono">{p.order.code}</b></div>
              <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đã thu</div><b>{vnd(p.order.confirmed)}</b></div>
              <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đơn giá buổi</div><b>{vnd(p.proposal!.perSession)}</b></div>
              <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đã học</div><b>{p.proposal!.usedSessions}/{p.enrollment.packageSessions}</b> = {vnd(p.proposal!.usedValue)}</div>
              <div className="rounded-xl bg-brand-50 p-2"><div className="text-xs text-ink-400">Đề xuất hoàn tối đa</div><b className="text-brand-700">{vnd(p.proposal!.refundable)}</b>{p.proposal!.alreadyRefunded > 0 && <div className="text-[11px]">đã hoàn/đang xử lý {vnd(p.proposal!.alreadyRefunded)}</div>}</div>
            </div>
            {p.canRequest ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-ink-600">Số tiền hoàn<input type="number" min={1} step={1000} max={p.proposal!.refundable} className="input mt-1 w-40" value={amount} placeholder={String(p.proposal!.refundable)} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} /></label>
                <label className="flex-1 text-xs text-ink-600">Lý do<input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Chuyển nơi ở, sức khoẻ…" /></label>
                <button className="btn-primary" disabled={req.isPending || reason.trim().length < 5 || p.proposal!.refundable <= 0} onClick={() => { setMsg(null); req.mutate({ enrollmentId, amount: amount === "" ? p.proposal!.refundable : amount, reason: reason.trim() }); }}>Gửi đề xuất</button>
              </div>
            ) : <p className="text-xs text-ink-600">Đã có yêu cầu đang xử lý cho đơn này hoặc bạn không có quyền đề xuất.</p>}
          </div>
        )
      )}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}

export function RefundActions({ id, canApprove, canPay, methods }: { id: string; canApprove: boolean; canPay: boolean; methods: { id: string; name: string; kind: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const done = { onSuccess: () => { setErr(null); router.refresh(); }, onError: (e: { message: string }) => setErr(e.message) };
  const decide = useMutation(trpc.finance.decideRefund.mutationOptions(done));
  const pay = useMutation(trpc.finance.payRefund.mutationOptions(done));
  if (!canApprove && !canPay) return null;
  return (
    <div className="min-w-[14rem] space-y-1">
      {canApprove && (
        <>
          <input className="input !py-1 text-xs" placeholder="Ghi chú (bắt buộc khi từ chối)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-1">
            <button className="btn-primary !px-2 !py-1 text-xs" disabled={decide.isPending} onClick={() => decide.mutate({ id, action: "approve", note: note || null })}>Duyệt</button>
            <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={decide.isPending || note.trim().length < 5} onClick={() => decide.mutate({ id, action: "reject", note })}>Từ chối</button>
          </div>
        </>
      )}
      {canPay && (
        <>
          <select className="input !py-1 text-xs" value={methodId} onChange={(e) => setMethodId(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <input className="input !py-1 text-xs" placeholder="Mã giao dịch chi (bắt buộc nếu CK)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <button className="btn-primary !px-2 !py-1 text-xs" disabled={pay.isPending || !methodId} onClick={() => pay.mutate({ id, paymentMethodId: methodId, payoutRef: ref || null })}>Đã chi hoàn</button>
        </>
      )}
      {err && <div className="text-xs text-red-700">{err}</div>}
    </div>
  );
}
