"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { CurriculumStatus } from "@satarobo/core";

function Err({ text }: { text: string | null }) {
  return text ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{text}</div> : null;
}

export function NewCurriculum({ courses }: { courses: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ courseId: courses[0]?.id ?? "", name: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.catalog.upsertCurriculum.mutationOptions({ onSuccess: (r) => router.push(`/curriculums/${r.id}`), onError: (e) => setErr(e.message) }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Giáo trình mới</button>;
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-semibold">Giáo trình mới (bản nháp)</h2>
      <Err text={err} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Khoá
          <select className="input mt-1" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        </label>
        <label className="text-xs text-ink-600 sm:col-span-2">Tên<input className="input mt-1" value={f.name} placeholder="Giáo trình Sata 1 (2027)" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      </div>
      <label className="block text-xs text-ink-600">Mô tả<input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={save.isPending || f.name.trim().length < 3} onClick={() => save.mutate({ courseId: f.courseId, name: f.name, description: f.description || null })}>Tạo</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </section>
  );
}

type Lesson = { id: string; sequenceNo: number; title: string; objectives: string | null; materials: string | null; isReportCardMilestone: boolean; used: number };

export function CurriculumEditor({ c }: { c: { id: string; courseId: string; name: string; description: string | null; status: string; canEdit: boolean; readiness: string[]; lessons: Lesson[]; courseSessions: number } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const blank = { title: "", objectives: "", materials: "", isReportCardMilestone: false };
  const [lf, setLf] = useState(blank);
  const [head, setHead] = useState({ name: c.name, description: c.description ?? "", editing: false });
  const onError = (e: { message: string }) => { setOk(null); setErr(e.message); };
  const done = (m: string) => { setErr(null); setOk(m); router.refresh(); };
  const status = useMutation(trpc.catalog.setCurriculumStatus.mutationOptions({ onSuccess: () => done("Đã cập nhật trạng thái giáo trình."), onError }));
  const clone = useMutation(trpc.catalog.cloneCurriculum.mutationOptions({ onSuccess: (r) => router.push(`/curriculums/${r.id}`), onError }));
  const saveHead = useMutation(trpc.catalog.upsertCurriculum.mutationOptions({ onSuccess: () => { setHead({ ...head, editing: false }); done("Đã lưu."); }, onError }));
  const saveLesson = useMutation(trpc.catalog.upsertLesson.mutationOptions({ onSuccess: () => { setEditId(null); setLf(blank); done("Đã lưu bài học."); }, onError }));
  const move = useMutation(trpc.catalog.moveLesson.mutationOptions({ onSuccess: () => { setErr(null); router.refresh(); }, onError }));
  const del = useMutation(trpc.catalog.deleteLesson.mutationOptions({ onSuccess: () => done("Đã xoá bài học."), onError }));
  const busy = status.isPending || clone.isPending || saveLesson.isPending || move.isPending || del.isPending;
  const draft = c.status === "draft";
  const canWriteLessons = c.canEdit && c.status !== "archived";

  const setStatus = (s: CurriculumStatus) => status.mutate({ id: c.id, status: s });
  const lessonForm = () => (
    <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3">
      <input className="input" placeholder="Tên bài (VD: Bài 1 — Làm quen bộ kit)" value={lf.title} onChange={(e) => setLf({ ...lf, title: e.target.value })} autoFocus />
      <textarea className="input min-h-16" placeholder="Mục tiêu bài học" value={lf.objectives} onChange={(e) => setLf({ ...lf, objectives: e.target.value })} />
      <input className="input" placeholder="Học cụ / chuẩn bị" value={lf.materials} onChange={(e) => setLf({ ...lf, materials: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lf.isReportCardMilestone} onChange={(e) => setLf({ ...lf, isReportCardMilestone: e.target.checked })} /> Mốc học bạ</label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || lf.title.trim().length < 3} onClick={() => saveLesson.mutate({ id: editId === "new" ? undefined : editId ?? undefined, curriculumId: c.id, title: lf.title, objectives: lf.objectives || null, materials: lf.materials || null, isReportCardMilestone: lf.isReportCardMilestone })}>Lưu bài</button>
        <button className="btn-ghost" onClick={() => { setEditId(null); setLf(blank); }}>Thôi</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Err text={err} />
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{ok}</div>}
      {c.canEdit && (
        <div className="flex flex-wrap gap-2">
          {c.status !== "active" && <button className="btn-primary" disabled={busy || c.readiness.length > 0} onClick={() => setStatus("active")}>Đưa vào sử dụng</button>}
          {c.status === "active" && <button className="btn-ghost" disabled={busy} onClick={() => setStatus("archived")}>Ngưng sử dụng</button>}
          {c.status === "draft" && <button className="btn-ghost" disabled={busy} onClick={() => setStatus("archived")}>Lưu trữ bản nháp</button>}
          <button className="btn-ghost" disabled={busy} onClick={() => clone.mutate({ id: c.id })}>Nhân bản thành phiên bản mới</button>
          {!head.editing && <button className="btn-ghost" onClick={() => setHead({ ...head, editing: true })}>Sửa tên / mô tả</button>}
        </div>
      )}
      {c.readiness.length > 0 && c.status !== "active" && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Chưa thể đưa vào sử dụng: {c.readiness.join("; ")}</div>}
      {head.editing && (
        <div className="card space-y-2 p-4">
          <input className="input" value={head.name} onChange={(e) => setHead({ ...head, name: e.target.value })} />
          <input className="input" placeholder="Mô tả" value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={saveHead.isPending} onClick={() => saveHead.mutate({ id: c.id, courseId: c.courseId, name: head.name, description: head.description || null })}>Lưu</button>
            <button className="btn-ghost" onClick={() => setHead({ ...head, editing: false })}>Thôi</button>
          </div>
        </div>
      )}

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Bài học <span className="text-sm font-normal text-ink-400">({c.lessons.length}/{c.courseSessions} buổi)</span></h2>
          {canWriteLessons && editId === null && <button className="text-xs font-semibold text-brand-600" onClick={() => { setEditId("new"); setLf(blank); }}>+ Thêm bài</button>}
        </div>
        {!draft && c.canEdit && <p className="mb-2 text-xs text-ink-600">Giáo trình không ở dạng nháp: chỉ sửa nội dung / thêm bài cuối, không đổi thứ tự hay xoá bài (tránh lệch buổi của lớp đang học).</p>}
        {editId === "new" && lessonForm()}
        <ol className="divide-y divide-black/5">
          {c.lessons.map((l, i) => (
            <li key={l.id} className="py-2">
              {editId === l.id ? lessonForm() : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm"><span className="mr-1 font-mono text-xs text-ink-400">#{l.sequenceNo}</span><b>{l.title}</b>{l.isReportCardMilestone && <span className="chip ml-1 bg-violet-100 text-violet-800">Mốc học bạ</span>}</div>
                    {l.objectives && <div className="whitespace-pre-wrap text-xs text-ink-600">{l.objectives}</div>}
                    {l.materials && <div className="text-xs text-ink-400">Học cụ: {l.materials}</div>}
                    {l.used > 0 && <div className="text-[11px] text-ink-400">Đang gắn {l.used} buổi học</div>}
                  </div>
                  {canWriteLessons && (
                    <div className="flex shrink-0 gap-1 text-xs">
                      {draft && <button className="btn-ghost !px-2 !py-1" disabled={busy || i === 0} onClick={() => move.mutate({ curriculumId: c.id, lessonId: l.id, dir: "up" })} aria-label="Lên">↑</button>}
                      {draft && <button className="btn-ghost !px-2 !py-1" disabled={busy || i === c.lessons.length - 1} onClick={() => move.mutate({ curriculumId: c.id, lessonId: l.id, dir: "down" })} aria-label="Xuống">↓</button>}
                      <button className="btn-ghost !px-2 !py-1" disabled={busy} onClick={() => { setEditId(l.id); setLf({ title: l.title, objectives: l.objectives ?? "", materials: l.materials ?? "", isReportCardMilestone: l.isReportCardMilestone }); }}>Sửa</button>
                      {draft && l.used === 0 && <button className="btn-ghost !px-2 !py-1 text-red-700" disabled={busy} onClick={() => del.mutate({ curriculumId: c.id, lessonId: l.id })}>Xoá</button>}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {c.lessons.length === 0 && <li className="py-3 text-sm text-ink-400">Chưa có bài học.</li>}
        </ol>
      </section>
    </div>
  );
}
