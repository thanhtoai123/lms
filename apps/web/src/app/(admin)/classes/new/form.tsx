"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { suggestClassName } from "@satarobo/core";
import { PhaseEditor, toPhaseInput, emptyPhase, type PhaseRow } from "../[id]/phase-editor";
import type { Opt } from "../[id]/slot-editor";

type Ref = { centers: { id: string; code: string; name: string }[]; rooms: { id: string; centerId: string; code: string; name: string }[]; teachers: { id: string; fullName: string; centerId: string | null }[]; courses: { id: string; code: string; name: string; totalSessions: number }[] };

export function NewClassForm({ ref_, canApprove }: { ref_: Ref; canApprove: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [centerId, setCenterId] = useState(ref_.centers[0]?.id ?? "");
  const [courseId, setCourseId] = useState(ref_.courses[0]?.id ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [minCapacity, setMinCapacity] = useState(5);
  const [totalSessions, setTotalSessions] = useState<number | "">("");
  const [assistantTeacherId, setAssistantTeacherId] = useState("");
  const [description, setDescription] = useState("");
  const [leadTeacherId, setLeadTeacherId] = useState("");
  const [homeRoomId, setHomeRoomId] = useState("");
  const [phases, setPhases] = useState<PhaseRow[]>([emptyPhase("")]);
  const [error, setError] = useState<string | null>(null);

  const rooms = ref_.rooms.filter((r) => r.centerId === centerId);
  const teachers = ref_.teachers.filter((t) => !t.centerId || t.centerId === centerId);
  const course = ref_.courses.find((c) => c.id === courseId);
  const center = ref_.centers.find((c) => c.id === centerId);
  const room = rooms.find((r) => r.id === homeRoomId);
  const roomOpts: Opt[] = rooms.map((r) => ({ id: r.id, label: r.code }));
  const teacherOpts: Opt[] = teachers.map((t) => ({ id: t.id, label: t.fullName }));
  const suggested = course ? suggestClassName({ courseCode: course.code, slots: phases[0]?.slots ?? [], roomCode: room?.code ?? null, centerCode: center?.code ?? null }) : "";
  const codeCheck = useQuery({ ...trpc.academics.classes.codeTaken.queryOptions({ code: code.trim() }), enabled: code.trim().length >= 3, retry: false });

  const create = useMutation(
    trpc.academics.classes.create.mutationOptions({
      onSuccess: (cls) => router.push(`/classes/${cls.id}`),
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const mode = v === "draft" || v === "open" ? v : "submit";
    create.mutate({
      name, code: code.trim() || null, courseId, centerId, startDate, capacity, minCapacity, mode,
      totalSessions: totalSessions === "" ? undefined : totalSessions,
      description: description.trim() || null,
      leadTeacherId: leadTeacherId || null, assistantTeacherId: assistantTeacherId || null, homeRoomId: homeRoomId || null,
      phases: toPhaseInput(phases.map((p, i) => (i === 0 ? { ...p, from: startDate } : p))),
    });
  };

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Cơ sở</label><select className="input" value={centerId} onChange={(e) => { setCenterId(e.target.value); setHomeRoomId(""); setLeadTeacherId(""); }}>{ref_.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
        <div><label className="label">Khoá học</label><select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{ref_.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name} ({c.totalSessions} buổi)</option>)}</select></div>
        <div className="sm:col-span-2">
          <label className="label">Tên lớp</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || "VD: sata4.18h-T4.CS1-P201"} required minLength={3} />
          {suggested && name !== suggested && (
            <button type="button" className="mt-1 text-xs font-semibold text-brand-600" onClick={() => setName(suggested)}>Dùng tên gợi ý: {suggested}</button>
          )}
        </div>
        <div>
          <label className="label">Mã lớp (tuỳ chọn)</label>
          <input className="input font-mono uppercase" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Để trống để tự sinh (VD CS2.SATA3.26.004)" />
          {code.trim().length >= 3 && codeCheck.data && (
            <p className={`mt-0.5 text-[11px] ${!codeCheck.data.valid || codeCheck.data.taken ? "text-red-700" : "text-green-700"}`}>
              {!codeCheck.data.valid ? "Mã không hợp lệ (chữ in hoa, số, dấu chấm / gạch)" : codeCheck.data.taken ? "Mã đã tồn tại" : "Mã dùng được"}
            </p>
          )}
        </div>
        <div><label className="label">Khai giảng</label><input type="date" className="input" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPhases((ps) => ps.map((p, i) => (i === 0 ? { ...p, from: e.target.value } : p))); }} required /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Sĩ số tối thiểu</label><input type="number" className="input" value={minCapacity} min={1} max={30} onChange={(e) => setMinCapacity(Number(e.target.value))} /></div>
          <div><label className="label">Sĩ số tối đa</label><input type="number" className="input" value={capacity} min={1} max={30} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">Số buổi (để trống = theo khoá)</label><input type="number" className="input" value={totalSessions} min={1} max={200} placeholder={course ? String(course.totalSessions) : ""} onChange={(e) => setTotalSessions(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div><label className="label">GV chính</label><select className="input" value={leadTeacherId} onChange={(e) => setLeadTeacherId(e.target.value)}><option value="">— Chưa phân —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></div>
        <div><label className="label">Trợ giảng</label><select className="input" value={assistantTeacherId} onChange={(e) => setAssistantTeacherId(e.target.value)}><option value="">— Không —</option>{teachers.filter((t) => t.id !== leadTeacherId).map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></div>
        <div><label className="label">Phòng mặc định</label><select className="input" value={homeRoomId} onChange={(e) => setHomeRoomId(e.target.value)}><option value="">— Chọn phòng —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Mô tả đặc thù (bàn giao khi đổi GV)</label><textarea className="input min-h-16" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="Lớp có bé cần chú ý, mục tiêu thi đấu…" /></div>
      </div>

      <div>
        <label className="label">Kế hoạch lịch học</label>
        <PhaseEditor rows={phases} onChange={setPhases} rooms={roomOpts} teachers={teacherOpts} startDate={startDate} />
      </div>

      {course && <p className="text-xs text-ink-600">Khi mở lớp sẽ sinh <b>{totalSessions === "" ? course.totalSessions : totalSessions}</b> buổi từ ngày khai giảng theo kế hoạch lịch trên (bỏ ngày nghỉ).</p>}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" type="submit" value="draft" disabled={create.isPending || !name || !startDate}>Lưu nháp</button>
        <button className={canApprove ? "btn-ghost" : "btn-primary"} type="submit" value="submit" disabled={create.isPending || !name || !startDate || !leadTeacherId}>Gửi duyệt</button>
        {canApprove && <button className="btn-primary" type="submit" value="open" disabled={create.isPending || !name || !startDate || !leadTeacherId}>{create.isPending ? "Đang tạo…" : "Tạo & mở lớp ngay"}</button>}
      </div>
      {!leadTeacherId && <p className="text-xs text-ink-400">Cần chọn GV chính để gửi duyệt / mở lớp.</p>}
    </form>
  );
}
