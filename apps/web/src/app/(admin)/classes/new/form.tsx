"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WEEKDAY_VI } from "@/components/ui";

type Ref = { centers: { id: string; code: string; name: string }[]; rooms: { id: string; centerId: string; code: string; name: string }[]; teachers: { id: string; fullName: string; centerId: string | null }[]; courses: { id: string; code: string; name: string; totalSessions: number }[] };
type Slot = { weekday: number; startTime: string; endTime: string; roomId: string; teacherId: string };

export function NewClassForm({ ref_ }: { ref_: Ref }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [centerId, setCenterId] = useState(ref_.centers[0]?.id ?? "");
  const [courseId, setCourseId] = useState(ref_.courses[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [capacity, setCapacity] = useState(12);
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
    create.mutate({
      name, courseId, centerId, startDate, capacity,
      leadTeacherId: leadTeacherId || null, homeRoomId: homeRoomId || null,
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
        <div><label className="label">Sức chứa</label><input type="number" className="input" value={capacity} min={1} max={30} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
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

      {course && <p className="text-xs text-ink-600">Sẽ sinh <b>{course.totalSessions}</b> buổi từ ngày khai giảng theo lịch trên.</p>}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <button className="btn-primary" type="submit" disabled={create.isPending || !name || !startDate}>{create.isPending ? "Đang tạo…" : "Tạo lớp & sinh lịch"}</button>
    </form>
  );
}
