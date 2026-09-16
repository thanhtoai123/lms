"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Course = { id: string; code: string; name: string; gradeFrom: number | null; gradeTo: number | null; totalSessions: number; sessionMinutes: number; listPrice: number; nextCourseId: string | null; description: string | null; level: string | null; isActive: boolean };

export function CourseEditor({ course, options }: { course?: Course; options: { id: string; code: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { code: "", name: "", gradeFrom: "", gradeTo: "", totalSessions: 48, sessionMinutes: 90, listPrice: 0, nextCourseId: "", description: "", level: "", isActive: true };
  const [f, setF] = useState(course ? { ...course, gradeFrom: course.gradeFrom?.toString() ?? "", gradeTo: course.gradeTo?.toString() ?? "", nextCourseId: course.nextCourseId ?? "", description: course.description ?? "", level: course.level ?? "" } : empty);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.catalog.upsertCourse.mutationOptions({ onSuccess: () => { setOpen(false); if (!course) setF(empty); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className={course ? "text-xs font-semibold text-brand-600" : "btn-primary"} onClick={() => { setOpen(true); setErr(null); }}>{course ? "Sửa" : "+ Thêm khoá học"}</button>;
  return (
    <div className={course ? "fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" : ""}>
      <div className="card w-full max-w-3xl space-y-3 p-4">
        <h2 className="font-semibold">{course ? `Sửa khoá ${course.code}` : "Thêm khoá học"}</h2>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs text-ink-600">Mã *<input className="input mt-1 font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
          <label className="text-xs text-ink-600 sm:col-span-3">Tên *<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Từ lớp<input type="number" min={1} max={12} className="input mt-1" value={f.gradeFrom} onChange={(e) => setF({ ...f, gradeFrom: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Đến lớp<input type="number" min={1} max={12} className="input mt-1" value={f.gradeTo} onChange={(e) => setF({ ...f, gradeTo: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Số buổi *<input type="number" min={1} max={200} className="input mt-1" value={f.totalSessions} onChange={(e) => setF({ ...f, totalSessions: Number(e.target.value) })} /></label>
          <label className="text-xs text-ink-600">Phút / buổi *<input type="number" min={30} max={300} className="input mt-1" value={f.sessionMinutes} onChange={(e) => setF({ ...f, sessionMinutes: Number(e.target.value) })} /></label>
          <label className="text-xs text-ink-600">Học phí niêm yết (đ)<input type="number" min={0} step={100000} className="input mt-1" value={f.listPrice} onChange={(e) => setF({ ...f, listPrice: Number(e.target.value) })} /></label>
          <label className="text-xs text-ink-600">Trình độ<input className="input mt-1" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} placeholder="Cơ bản / Nâng cao" /></label>
          <label className="text-xs text-ink-600">Khoá tiếp theo
            <select className="input mt-1" value={f.nextCourseId} onChange={(e) => setF({ ...f, nextCourseId: e.target.value })}>
              <option value="">—</option>
              {options.filter((o) => o.id !== course?.id).map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang mở</label>
        </div>
        <label className="block text-xs text-ink-600">Mô tả<textarea className="input mt-1 min-h-16" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({
            id: course?.id, code: f.code, name: f.name, gradeFrom: f.gradeFrom ? Number(f.gradeFrom) : null, gradeTo: f.gradeTo ? Number(f.gradeTo) : null,
            totalSessions: f.totalSessions, sessionMinutes: f.sessionMinutes, listPrice: f.listPrice, nextCourseId: f.nextCourseId || null,
            description: f.description || null, level: f.level || null, isActive: f.isActive,
          })}>{save.isPending ? "Đang lưu…" : "Lưu"}</button>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
        </div>
      </div>
    </div>
  );
}
