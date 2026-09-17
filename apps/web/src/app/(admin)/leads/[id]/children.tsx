"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export type LeadChildRow = {
  id: string;
  fullName: string;
  birthYear: number | null;
  grade: number | null;
  school: string | null;
  interestedCourseId: string | null;
  courseCode: string | null;
  notes: string | null;
  convertedStudentId: string | null;
};
type Course = { id: string; code: string; name: string };
type Draft = { fullName: string; birthYear: string; grade: string; school: string; courseId: string; notes: string };
const EMPTY: Draft = { fullName: "", birthYear: "", grade: "", school: "", courseId: "", notes: "" };

/** Khối "Con của phụ huynh": thêm / sửa / xoá con, đưa tên con (cũ) trên lead vào danh sách */
export function LeadChildrenBlock({ leadId, legacyChildName, legacyGrade, items, courses, canEdit, onChanged }: {
  leadId: string;
  legacyChildName: string | null;
  legacyGrade: number | null;
  items: LeadChildRow[];
  courses: Course[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmRm, setConfirmRm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = (text: string) => { setEditing(null); setConfirmRm(null); setError(null); setNotice(text); onChanged(); };
  const onError = (e: { message: string }) => setError(e.message);
  const add = useMutation(trpc.admissions.leads.addChild.mutationOptions({ onSuccess: () => done("Đã thêm con"), onError }));
  const upd = useMutation(trpc.admissions.leads.updateChild.mutationOptions({ onSuccess: () => done("Đã lưu thông tin con"), onError }));
  const rm = useMutation(trpc.admissions.leads.removeChild.mutationOptions({ onSuccess: () => done("Đã xoá con"), onError }));
  const busy = add.isPending || upd.isPending || rm.isPending;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: e.target.value });
  const payload = () => ({
    fullName: draft.fullName.trim(),
    birthYear: draft.birthYear ? Number(draft.birthYear) : null,
    grade: draft.grade ? Number(draft.grade) : null,
    school: draft.school.trim() || null,
    interestedCourseId: draft.courseId || null,
    notes: draft.notes.trim() || null,
  });
  const startEdit = (c: LeadChildRow) => {
    setError(null);
    setEditing(c.id);
    setDraft({ fullName: c.fullName, birthYear: c.birthYear ? String(c.birthYear) : "", grade: c.grade ? String(c.grade) : "", school: c.school ?? "", courseId: c.interestedCourseId ?? "", notes: c.notes ?? "" });
  };
  const year = new Date().getFullYear();

  const form = (
    <form
      className="grid gap-2 rounded-xl border border-black/5 bg-black/[0.02] p-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.fullName.trim()) return setError("Nhập họ tên con");
        if (editing === "new") add.mutate({ leadId, ...payload() });
        else if (editing) upd.mutate({ leadId, childId: editing, ...payload() });
      }}
    >
      <label className="text-xs text-ink-600 sm:col-span-2">Họ tên con *<input className="input mt-1" autoFocus value={draft.fullName} onChange={set("fullName")} maxLength={120} /></label>
      <label className="text-xs text-ink-600">Năm sinh<input className="input mt-1" type="number" min={year - 18} max={year - 3} value={draft.birthYear} onChange={set("birthYear")} placeholder={`${year - 8}`} /></label>
      <label className="text-xs text-ink-600">Lớp / khối<input className="input mt-1" type="number" min={1} max={12} value={draft.grade} onChange={set("grade")} /></label>
      <label className="text-xs text-ink-600 sm:col-span-2">Trường<input className="input mt-1" value={draft.school} onChange={set("school")} maxLength={200} /></label>
      <label className="text-xs text-ink-600 sm:col-span-2">Khoá quan tâm
        <select className="input mt-1" value={draft.courseId} onChange={set("courseId")}>
          <option value="">— Chưa rõ —</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-ink-600 sm:col-span-3">Ghi chú<input className="input mt-1" value={draft.notes} onChange={set("notes")} maxLength={500} /></label>
      <div className="flex items-end justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setError(null); }}>Huỷ</button>
        <button className="btn-primary" disabled={busy}>{editing === "new" ? "Thêm con" : "Lưu"}</button>
      </div>
    </form>
  );

  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Con của phụ huynh <span className="text-xs font-normal text-ink-400">({items.length})</span></h2>
        {canEdit && editing !== "new" && <button type="button" className="btn-ghost text-xs" onClick={() => { setDraft(EMPTY); setEditing("new"); setError(null); }}>+ Thêm con</button>}
      </div>
      {items.length === 0 && legacyChildName && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-2 text-sm">
          <span>Thông tin con (cũ): <b>{legacyChildName}</b></span>
          {canEdit && <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => add.mutate({ leadId, fullName: legacyChildName, grade: legacyGrade })}>Đưa vào danh sách con</button>}
        </div>
      )}
      {items.length === 0 && !legacyChildName && <p className="text-xs text-ink-400">Chưa có thông tin con. Thêm để chốt và tạo đơn theo từng con.</p>}
      <ul className="divide-y divide-black/5">
        {items.map((c) => (
          <li key={c.id} className="py-2 text-sm">
            {editing === c.id ? form : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{c.fullName}</span>
                  <span className="text-xs text-ink-400">
                    {c.birthYear ? ` · ${year - c.birthYear} tuổi` : ""}{c.grade ? ` · lớp ${c.grade}` : ""}{c.school ? ` · ${c.school}` : ""}{c.courseCode ? ` · ${c.courseCode}` : " · chưa rõ khoá"}
                  </span>
                  {c.notes && <div className="text-[11px] text-ink-400">{c.notes}</div>}
                </div>
                {c.convertedStudentId ? (
                  <a href={`/students/${c.convertedStudentId}`} className="chip bg-green-100 text-green-800">Đã chốt · xem học viên</a>
                ) : canEdit ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="text-xs text-brand-700" onClick={() => startEdit(c)}>Sửa</button>
                    {confirmRm === c.id ? (
                      <>
                        <button type="button" className="text-xs font-semibold text-red-700" disabled={busy} onClick={() => rm.mutate({ leadId, childId: c.id })}>Xác nhận xoá?</button>
                        <button type="button" className="text-xs text-ink-400" onClick={() => setConfirmRm(null)}>Không</button>
                      </>
                    ) : (
                      <button type="button" className="text-xs text-ink-400 hover:text-red-700" onClick={() => setConfirmRm(c.id)}>Xoá</button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" && form}
      {error && <div className="text-sm text-red-700">{error}</div>}
      {notice && !error && <div className="text-xs text-green-700">{notice}</div>}
    </section>
  );
}
