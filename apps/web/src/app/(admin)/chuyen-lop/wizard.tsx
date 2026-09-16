"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { EnrollmentChip, ErrorBox } from "@/components/admin-ui";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

type Cls = { id: string; code: string; name: string; centerCode: string; courseCode: string; enrolled: number; capacity: number; sessionsDone: number; schedule: string | null };

export function TransferWizard({ classes, initialStudent }: { classes: Cls[]; initialStudent: PickedStudent | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [student, setStudent] = useState<PickedStudent | null>(initialStudent);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [startSeq, setStartSeq] = useState("");
  const [waiver, setWaiver] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = useQuery({ ...trpc.students.openEnrollments.queryOptions({ studentId: student?.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: !!student });
  const preview = useQuery({ ...trpc.students.previewTransfer.queryOptions({ enrollmentId, targetClassId: targetId }), enabled: !!enrollmentId && !!targetId });
  const doIt = useMutation(trpc.students.transfer.mutationOptions({ onSuccess: () => router.push(`/students/${student!.id}`), onError: (e) => setError(e.message) }));
  const source = open.data?.find((e) => e.id === enrollmentId);
  const p = preview.data;
  const target = classes.find((c) => c.id === targetId);

  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-5">
        <h2 className="font-bold">1. Học viên & lớp hiện tại</h2>
        <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollmentId(""); setTargetId(""); }} />
        {student && (
          <div className="space-y-1">
            {open.isLoading && <div className="text-xs text-ink-400">Đang tải…</div>}
            {open.data?.length === 0 && <div className="text-sm text-ink-400">Học viên không có đăng ký nào đang mở.</div>}
            {open.data?.map((e) => (
              <label key={e.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${enrollmentId === e.id ? "border-brand-600 bg-brand-50" : "border-black/5"}`}>
                <span className="flex items-center gap-2"><input type="radio" checked={enrollmentId === e.id} onChange={() => { setEnrollmentId(e.id); setTargetId(""); }} /><span><span className="font-medium">{e.className}</span><span className="block text-xs text-ink-400">{e.classCode} · {e.courseCode} · {e.centerCode} · đã học {e.consumed}/{e.packageSessions}, còn {e.remaining}</span></span></span>
                <EnrollmentChip status={e.status} />
              </label>
            ))}
          </div>
        )}
      </section>

      {source && (
        <section className="card space-y-2 p-5">
          <h2 className="font-bold">2. Lớp đích</h2>
          <div className="max-h-72 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/5">
            {classes.filter((c) => c.id !== source.classId).map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-3 p-3 text-sm ${targetId === c.id ? "bg-brand-50" : "hover:bg-black/[0.02]"}`}>
                <span className="flex items-center gap-2"><input type="radio" checked={targetId === c.id} onChange={() => { setTargetId(c.id); setStartSeq(String(c.sessionsDone + 1)); }} /><span><span className="font-medium">{c.name}</span><span className="block text-xs text-ink-400">{c.code} · {c.courseCode} · {c.centerCode}{c.centerCode !== source.centerCode ? " (khác cơ sở)" : ""} · {c.schedule ?? "—"}</span></span></span>
                <span className={`text-xs ${c.enrolled >= c.capacity ? "text-red-700" : ""}`}>{c.enrolled}/{c.capacity}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {source && target && (
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">3. Xem trước & xác nhận</h2>
          {preview.isLoading && <div className="text-sm text-ink-400">Đang kiểm tra…</div>}
          {p && (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-black/[0.03] p-3"><div className="label">Từ</div>{source.classCode}<div className="text-xs text-ink-400">{source.centerCode}</div></div>
                <div className="rounded-xl bg-black/[0.03] p-3"><div className="label">Đến</div>{target.code}<div className="text-xs text-ink-400">{target.centerCode}</div></div>
                <div className="rounded-xl bg-brand-50 p-3"><div className="label">Mang sang</div><span className="text-2xl font-bold text-brand-700">{p.carrySessions}</span> buổi</div>
              </div>
              {p.errors.map((x) => <ErrorBox key={x}>{x}</ErrorBox>)}
              {p.warnings.map((x) => <div key={x} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">⚠ {x}</div>)}
              {p.ok && (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); setError(null); doIt.mutate({ enrollmentId, targetClassId: targetId, reason, startSequenceNo: startSeq ? Number(startSeq) : undefined, waiverReason: waiver.trim() || null }); }}>
                  <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                    <div><label className="label">Lý do chuyển *</label><input className="input" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Đổi lịch học, chuyển nhà, lên trình độ…" /></div>
                    <div><label className="label">Vào lớp đích từ buổi</label><input type="number" min={1} className="input" value={startSeq} onChange={(e) => setStartSeq(e.target.value)} /></div>
                  </div>
                  {error && <ErrorBox>{error}</ErrorBox>}
                  {(error?.includes("tiên quyết") || waiver) && (
                    <input className="input" maxLength={300} placeholder="Miễn điều kiện tiên quyết — lý do (quản lý cơ sở)" value={waiver} onChange={(e) => setWaiver(e.target.value)} />
                  )}
                  <button className="btn-primary" disabled={doIt.isPending}>{doIt.isPending ? "Đang chuyển…" : "Xác nhận chuyển lớp"}</button>
                </form>
              )}
            </>
          )}
          {preview.error && <ErrorBox>{preview.error.message}</ErrorBox>}
        </section>
      )}
    </div>
  );
}
