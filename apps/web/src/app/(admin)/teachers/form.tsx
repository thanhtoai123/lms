"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { TEACHER_GRADES, TEACHER_GRADE_VI, CONTRACT_TYPES, CONTRACT_TYPE_VI, type TeacherGrade, type ContractType } from "@satarobo/core";

export type TeacherFormValue = {
  id?: string; fullName: string; email: string; phone: string; title: string; centerId: string; grade: string; contractType: ContractType;
  maxLoadPerWeek: number; hiredAt: string; notes: string; userId: string; courseIds: string[];
};

export function TeacherForm({ initial, centers, courses, accounts, onDone }: {
  initial: TeacherFormValue;
  centers: { id: string; code: string; name: string }[];
  courses: { id: string; code: string; name: string; isActive: boolean }[];
  accounts: { id: string; email: string; fullName: string }[];
  onDone?: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.catalog.upsertTeacher.mutationOptions({
    onSuccess: (r) => { if (initial.id) { onDone?.(); router.refresh(); } else router.push(`/teachers/${r.id}`); },
    onError: (e) => setErr(e.message),
  }));
  const toggleCourse = (id: string) => setF({ ...f, courseIds: f.courseIds.includes(id) ? f.courseIds.filter((x) => x !== id) : [...f.courseIds, id] });
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        save.mutate({
          id: f.id, fullName: f.fullName, email: f.email || null, phone: f.phone || null, title: f.title || null, centerId: f.centerId || null,
          grade: (f.grade || null) as TeacherGrade | null, contractType: f.contractType, maxLoadPerWeek: f.maxLoadPerWeek, hiredAt: f.hiredAt || null,
          notes: f.notes || null, userId: f.userId || null, courseIds: f.courseIds,
        });
      }}
    >
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Họ tên *<input className="input mt-1" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></label>
        <label className="text-xs text-ink-600">Chức danh<input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Giáo viên / Trợ giảng" /></label>
        <label className="text-xs text-ink-600">Cơ sở
          <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>
            <option value="">Hội sở (dạy nhiều cơ sở)</option>
            {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Email<input type="email" className="input mt-1" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Điện thoại<input className="input mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Ngày vào làm<input type="date" className="input mt-1" value={f.hiredAt} onChange={(e) => setF({ ...f, hiredAt: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Ngạch
          <select className="input mt-1" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}>
            <option value="">—</option>
            {TEACHER_GRADES.map((g) => <option key={g} value={g}>{TEACHER_GRADE_VI[g]}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Loại hợp đồng
          <select className="input mt-1" value={f.contractType} onChange={(e) => setF({ ...f, contractType: e.target.value as ContractType })}>
            {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{CONTRACT_TYPE_VI[c]}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Tải tối đa (buổi/tuần)<input type="number" min={1} max={60} className="input mt-1" value={f.maxLoadPerWeek} onChange={(e) => setF({ ...f, maxLoadPerWeek: Number(e.target.value) })} /></label>
        <label className="text-xs text-ink-600 sm:col-span-3">Tài khoản đăng nhập (để GV dùng app Giáo viên)
          <select className="input mt-1" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="">— Chưa gắn —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.fullName} · {a.email}</option>)}
          </select>
        </label>
      </div>
      <div>
        <div className="label">Khoá được dạy</div>
        <div className="flex flex-wrap gap-2">
          {courses.filter((c) => c.isActive || f.courseIds.includes(c.id)).map((c) => (
            <button type="button" key={c.id} onClick={() => toggleCourse(c.id)} className={`chip cursor-pointer ${f.courseIds.includes(c.id) ? "bg-brand-500 text-white" : "bg-black/5"}`} title={c.name}>{c.code}</button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-400">Để trống = chưa khai báo (không chặn phân lớp). Đã khai báo thì chỉ phân được lớp thuộc các khoá này.</p>
      </div>
      <label className="block text-xs text-ink-600">Ghi chú<textarea className="input mt-1 min-h-16" maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : initial.id ? "Lưu hồ sơ" : "Tạo giáo viên"}</button>
        {onDone && <button type="button" className="btn-ghost" onClick={onDone}>Thôi</button>}
      </div>
    </form>
  );
}
