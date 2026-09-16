"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WEEKDAY_VI } from "@/components/ui";

type Ref = { centers: { id: string; code: string; name: string }[]; rooms: { id: string; centerId: string; code: string; name: string }[]; teachers: { id: string; fullName: string; centerId: string | null }[]; courses: { id: string; code: string; name: string; totalSessions: number }[] };
type Slot = { weekday: number; startTime: string; endTime: string; roomId: string; teacherId: string };

export function NewClassForm({ ref_, canApprove }: { ref_: Ref; canApprove: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [centerId, setCenterId] = useState(ref_.centers[0]?.id ?? "");
  const [courseId, setCourseId] = useState(ref_.courses[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [minCapacity, setMinCapacity] = useState(4);
  const [totalSessions, setTotalSessions] = useState<number | "">("");
  const [assistantTeacherId, setAssistantTeacherId] = useState("");
  const [description, setDescription] = useState("");
  const [leadTeacherId, setLeadTeacherId] = useState("");
  const [homeRoomId, setHomeRoomId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([{ weekday: 6, startTime: "15:45", endTime: "17:15", roomId: "", teacherId: "" }]);
  const [error, setError] = useState<string | null>(null);

  const rooms = ref_.rooms.filter((r) => r.centerId === centerId);
  const teachers = ref_.teachers.filter((t) => !t.centerId || t.centerId === centerId);
  const course = ref_.courses.find((c) => c.id === courseId);

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
      name, courseId, centerId, startDate, capacity, minCapacity, mode,
      totalSessions: totalSessions === "" ? undefined : totalSessions,
      description: description.trim() || null,
      leadTeacherId: leadTeacherId || null, assistantTeacherId: assistantTeacherId || null, homeRoomId: homeRoomId || null,
      schedules: slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId || null, teacherId: s.teacherId || null })),
    });
  };

  const upd = (i: number, patch: Partial<Slot>) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Cơ sở</label><select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>{ref_.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></div>
        <div><label className="label">Khoá học</label><select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{ref_.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name} ({c.totalSessions} buổi)</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Tên lớp</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Sata4 chiều T7 CS1" required minLength={3} /></div>
        <div><label className="label">Khai giảng</label><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Sĩ số tối thiểu</label><input type="number" className="input" value={minCapacity} min={1} max={30} onChange={(e) => setMinCapacity(Number(e.target.value))} /></div>
          <div><label className="label">Sĩ số tối đa</label><input type="number" className="input" value={capacity} min={1} max={30} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">Số buổi (để trống = theo khoá)</label><input type="number" className="input" value={totalSessions} min={1} max={200} placeholder={course ? String(course.totalSessions) : ""} onChange={(e) => setTotalSessions(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div><label className="label">Trợ giảng</label><select className="input" value={assistantTeacherId} onChange={(e) => setAssistantTeacherId(e.target.value)}><option value="">— Không —</option>{teachers.filter((t) => t.id !== leadTeacherId).map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Mô tả đặc thù (bàn giao khi đổi GV)</label><textarea className="input min-h-16" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="Lớp có bé cần chú ý, mục tiêu thi đấu…" /></div>
        <div><label className="label">GV chính</label><select className="input" value={leadTeacherId} onChange={(e) => setLeadTeacherId(e.target.value)}><option value="">— Chưa phân —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></div>
        <div><label className="label">Phòng mặc định</label><select className="input" value={homeRoomId} onChange={(e) => setHomeRoomId(e.target.value)}><option value="">— Chọn phòng —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></div>
      </div>

      <div>
        <div className="flex items-center justify-between"><label className="label !mb-0">Lịch cố định trong tuần</label><button type="button" className="text-xs text-brand-600 font-semibold" onClick={() => setSlots((xs) => [...xs, { weekday: 3, startTime: "18:00", endTime: "19:30", roomId: "", teacherId: "" }])}>+ Thêm ca</button></div>
        <div className="mt-2 space-y-2">
          {slots.map((s, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
              <select className="input" value={s.weekday} onChange={(e) => upd(i, { weekday: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{WEEKDAY_VI[d]}</option>)}</select>
              <input type="time" className="input" value={s.startTime} onChange={(e) => upd(i, { startTime: e.target.value })} />
              <input type="time" className="input" value={s.endTime} onChange={(e) => upd(i, { endTime: e.target.value })} />
              <select className="input" value={s.roomId} onChange={(e) => upd(i, { roomId: e.target.value })}><option value="">Phòng mặc định</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select>
              <select className="input" value={s.teacherId} onChange={(e) => upd(i, { teacherId: e.target.value })}><option value="">GV chính</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
              <button type="button" className="btn-ghost" onClick={() => setSlots((xs) => xs.filter((_, j) => j !== i))} disabled={slots.length === 1}>Xoá</button>
            </div>
          ))}
        </div>
      </div>

      {course && <p className="text-xs text-ink-600">Khi mở lớp sẽ sinh <b>{totalSessions === "" ? course.totalSessions : totalSessions}</b> buổi từ ngày khai giảng theo lịch trên.</p>}
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
