"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SUBMISSION_TYPES, SUBMISSION_TYPE_VI, type SubmissionType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type ClassOpt = { id: string; code: string; name: string; courseId: string };
export type AssignmentDraft = {
  id?: string; classId: string; sessionId: string | null; templateId: string | null; title: string; instructions: string; submissionType: SubmissionType;
  maxScore: number; dueAt: string; allowLate: boolean; coinReward: number; documentIds: string[];
};

const toLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function AssignmentForm({ classes, draft, defaultClassId }: { classes: ClassOpt[]; draft?: AssignmentDraft; defaultClassId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inDays = new Date(Date.now() + 5 * 86400e3);
  inDays.setHours(20, 0, 0, 0);
  const [v, setV] = useState<AssignmentDraft>(draft ?? {
    classId: defaultClassId && classes.some((c) => c.id === defaultClassId) ? defaultClassId : classes[0]?.id ?? "", sessionId: null, templateId: null, title: "", instructions: "",
    submissionType: "file", maxScore: 10, dueAt: inDays.toISOString(), allowLate: true, coinReward: 5, documentIds: [],
  });
  const cls = classes.find((c) => c.id === v.classId);
  const tpl = useQuery({ ...trpc.content.templates.queryOptions({ courseId: cls?.courseId }), enabled: open && !!cls });
  const docs = useQuery({ ...trpc.content.documents.queryOptions({ courseId: cls?.courseId, status: "published" }), enabled: open && !!cls });
  const m = useMutation(trpc.content.upsertAssignment.mutationOptions({ onSuccess: (r) => { setOpen(false); if (draft) router.refresh(); else router.push(`/assignments/${r.id}`); } }));
  const set = <K extends keyof AssignmentDraft>(k: K, x: AssignmentDraft[K]) => setV({ ...v, [k]: x });
  const studentDocs = (docs.data?.items ?? []).filter((d) => d.audience === "student");
  if (!open) return <button type="button" className={draft ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)} disabled={!classes.length}>{draft ? "Sửa" : "+ Giao bài tập"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-8 grid w-full max-w-2xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, dueAt: new Date(v.dueAt).toISOString() }); }}>
        <h3 className="col-span-2 font-semibold">{draft ? "Sửa bài tập" : "Giao bài tập mới"}</h3>
        <label>Lớp<select className="input mt-1 w-full" value={v.classId} disabled={!!draft} onChange={(e) => setV({ ...v, classId: e.target.value, templateId: null, documentIds: [] })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        <label>Dùng mẫu<select className="input mt-1 w-full" value={v.templateId ?? ""} onChange={(e) => {
          const t = tpl.data?.items.find((x) => x.id === e.target.value);
          setV(t ? { ...v, templateId: t.id, title: t.title, instructions: t.instructions, submissionType: t.submissionType as SubmissionType, maxScore: t.maxScore } : { ...v, templateId: null });
        }}><option value="">— Tự soạn —</option>{(tpl.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.lessonSeq ? `Bài ${t.lessonSeq}: ` : ""}{t.title}</option>)}</select></label>
        <label className="col-span-2">Tiêu đề<input className="input mt-1 w-full" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required /></label>
        <label className="col-span-2">Hướng dẫn cho học viên / phụ huynh<textarea className="input mt-1 w-full" rows={4} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={5000} required /></label>
        <label>Hình thức nộp<select className="input mt-1 w-full" value={v.submissionType} onChange={(e) => set("submissionType", e.target.value as SubmissionType)}>{SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{SUBMISSION_TYPE_VI[t]}</option>)}</select></label>
        <label>Hạn nộp<input type="datetime-local" className="input mt-1 w-full" value={toLocal(v.dueAt)} onChange={(e) => set("dueAt", new Date(e.target.value).toISOString())} required /></label>
        <label>Thang điểm<select className="input mt-1 w-full" value={v.maxScore} onChange={(e) => set("maxScore", Number(e.target.value))}><option value={10}>10</option><option value={100}>100</option></select></label>
        <label>Thưởng xu khi đạt ≥ 80%<input type="number" min={0} max={20} className="input mt-1 w-full" value={v.coinReward} onChange={(e) => set("coinReward", Number(e.target.value))} /></label>
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={v.allowLate} onChange={(e) => set("allowLate", e.target.checked)} /> Nhận bài nộp muộn (đánh dấu trễ) cho đến khi đóng bài</label>
        {studentDocs.length > 0 && (
          <fieldset className="col-span-2">
            <legend className="text-xs text-ink-600">Tài liệu đính kèm (dành cho HV/PH)</legend>
            {studentDocs.map((d) => (
              <label key={d.id} className="mr-3 inline-flex items-center gap-1 text-xs">
                <input type="checkbox" checked={v.documentIds.includes(d.id)} onChange={(e) => set("documentIds", e.target.checked ? [...v.documentIds, d.id] : v.documentIds.filter((x) => x !== d.id))} /> {d.title}
              </label>
            ))}
          </fieldset>
        )}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu nháp</button></div>
      </form>
    </div>
  );
}

export function TemplateForm({ courses, tpl }: { courses: { id: string; code: string }[]; tpl?: { id: string; courseId: string; lessonId: string | null; title: string; instructions: string; submissionType: SubmissionType; maxScore: number; isActive: boolean } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(tpl ?? { courseId: courses[0]?.id ?? "", lessonId: null as string | null, title: "", instructions: "", submissionType: "file" as SubmissionType, maxScore: 10, isActive: true });
  const lessons = useQuery({ ...trpc.content.lessonOptions.queryOptions({ courseId: v.courseId }), enabled: open && !!v.courseId });
  const m = useMutation(trpc.content.upsertTemplate.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className={tpl ? "text-xs text-brand-600" : "btn-ghost"} onClick={() => setOpen(true)}>{tpl ? "Sửa" : "+ Mẫu bài tập"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, id: tpl?.id }); }}>
        <h3 className="col-span-2 font-semibold">{tpl ? "Sửa mẫu" : "Mẫu bài tập mới"}</h3>
        <label>Khoá<select className="input mt-1 w-full" value={v.courseId} onChange={(e) => setV({ ...v, courseId: e.target.value, lessonId: null })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        <label>Bài<select className="input mt-1 w-full" value={v.lessonId ?? ""} onChange={(e) => setV({ ...v, lessonId: e.target.value || null })}><option value="">Chung</option>{(lessons.data ?? []).map((l) => <option key={l.id} value={l.id}>Bài {l.sequenceNo}: {l.title}</option>)}</select></label>
        <label className="col-span-2">Tiêu đề<input className="input mt-1 w-full" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required /></label>
        <label className="col-span-2">Hướng dẫn<textarea className="input mt-1 w-full" rows={4} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} required /></label>
        <label>Hình thức<select className="input mt-1 w-full" value={v.submissionType} onChange={(e) => setV({ ...v, submissionType: e.target.value as SubmissionType })}>{SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{SUBMISSION_TYPE_VI[t]}</option>)}</select></label>
        <label>Thang điểm<select className="input mt-1 w-full" value={v.maxScore} onChange={(e) => setV({ ...v, maxScore: Number(e.target.value) })}><option value={10}>10</option><option value={100}>100</option></select></label>
        {tpl && <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang dùng</label>}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}
