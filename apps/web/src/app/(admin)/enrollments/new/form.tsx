"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox } from "@/components/admin-ui";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

type Cls = { id: string; code: string; name: string; centerCode: string; courseCode: string; enrolled: number; capacity: number; sessionsTotal: number; sessionsDone: number; schedule: string | null };

export function EnrollForm({ classes, initialStudent, initialClassId }: { classes: Cls[]; initialStudent: PickedStudent | null; initialClassId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [student, setStudent] = useState<PickedStudent | null>(initialStudent);
  const [classId, setClassId] = useState(initialClassId ?? "");
  const [filter, setFilter] = useState("");
  const cls = classes.find((c) => c.id === classId);
  const [pkg, setPkg] = useState("");
  const [startSeq, setStartSeq] = useState("");
  const [status, setStatus] = useState<"active" | "trial">("active");
  const [note, setNote] = useState("");
  const [waiver, setWaiver] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.students.enroll.mutationOptions({ onSuccess: () => router.push(`/students/${student!.id}`), onError: (e) => setError(e.message) }));
  const shown = useMemo(() => classes.filter((c) => !filter || `${c.code} ${c.name} ${c.courseCode} ${c.centerCode}`.toLowerCase().includes(filter.toLowerCase())), [classes, filter]);
  const suggestedStart = cls ? cls.sessionsDone + 1 : 1;
  const suggestedPkg = cls ? Math.max(1, cls.sessionsTotal - cls.sessionsDone) : 48;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!student) return setError("Chọn học viên");
        if (!cls) return setError("Chọn lớp");
        setError(null);
        m.mutate({ studentId: student.id, classId: cls.id, packageSessions: Number(pkg || suggestedPkg), startSequenceNo: Number(startSeq || suggestedStart), status, note: note || null, waiverReason: waiver.trim() || null });
      }}
    >
      <section className="card space-y-2 p-5">
        <h2 className="font-bold">1. Học viên</h2>
        <StudentPicker value={student} onChange={setStudent} />
      </section>
      <section className="card space-y-2 p-5">
        <h2 className="font-bold">2. Lớp</h2>
        <input className="input" placeholder="Lọc theo mã lớp, khoá, cơ sở…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="max-h-72 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/5">
          {shown.map((c) => {
            const full = c.enrolled >= c.capacity;
            return (
              <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-3 p-3 text-sm ${classId === c.id ? "bg-brand-50" : "hover:bg-black/[0.02]"} ${full ? "opacity-50" : ""}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="cls" disabled={full} checked={classId === c.id} onChange={() => { setClassId(c.id); setPkg(""); setStartSeq(""); }} />
                  <span><span className="font-medium">{c.name}</span><span className="block text-xs text-ink-400">{c.code} · {c.courseCode} · {c.centerCode} · {c.schedule ?? "chưa có lịch"}</span></span>
                </span>
                <span className="text-right text-xs"><span className={full ? "text-red-700" : ""}>{c.enrolled}/{c.capacity} HV</span><span className="block text-ink-400">đã dạy {c.sessionsDone}/{c.sessionsTotal}</span></span>
              </label>
            );
          })}
          {shown.length === 0 && <div className="p-3 text-sm text-ink-400">Không có lớp phù hợp.</div>}
        </div>
      </section>
      <section className="card grid gap-3 p-5 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">3. Gói học</h2>
        <div><label className="label">Số buổi trong gói</label><input type="number" min={1} max={200} className="input" placeholder={String(suggestedPkg)} value={pkg} onChange={(e) => setPkg(e.target.value)} /></div>
        <div><label className="label">Vào lớp từ buổi</label><input type="number" min={1} max={200} className="input" placeholder={String(suggestedStart)} value={startSeq} onChange={(e) => setStartSeq(e.target.value)} /></div>
        <div><label className="label">Hình thức</label><select className="input" value={status} onChange={(e) => setStatus(e.target.value as "active" | "trial")}><option value="active">Chính thức</option><option value="trial">Học thử</option></select></div>
        <div className="sm:col-span-3"><label className="label">Ghi chú</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gói ưu đãi, đã đóng học phí…" /></div>
        <p className="text-xs text-ink-400 sm:col-span-3">Để trống sẽ dùng gợi ý: số buổi còn lại của lớp và vào từ buổi kế tiếp. Học phí được xử lý ở module Tài chính.</p>
      </section>
      {error && <ErrorBox>{error}</ErrorBox>}
      {(error?.includes("tiên quyết") || waiver) && (
        <section className="card space-y-1 p-4">
          <label className="label">Miễn điều kiện tiên quyết (chỉ quản lý cơ sở)</label>
          <input className="input" maxLength={300} placeholder="Lý do — VD: đã kiểm tra đầu vào, đạt trình độ tương đương" value={waiver} onChange={(e) => setWaiver(e.target.value)} />
        </section>
      )}
      <button className="btn-primary" disabled={m.isPending}>{m.isPending ? "Đang ghi danh…" : "Ghi danh"}</button>
    </form>
  );
}
