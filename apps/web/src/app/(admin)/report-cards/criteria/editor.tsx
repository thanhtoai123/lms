"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Crit = { id: string; name: string; description: string | null; isActive: boolean };

export function CourseCriteria({ course, criteria, allCourses, canEdit }: { course: { id: string; code: string; name: string; nextCourseId: string | null; milestones: number[] }; criteria: Crit[]; allCourses: { id: string; code: string; name: string }[]; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ok = () => { setError(null); router.refresh(); };
  const onError = (e: { message: string }) => setError(e.message);
  const upsert = useMutation(trpc.learning.upsertCriterion.mutationOptions({ onSuccess: () => { setName(""); setEditId(null); ok(); }, onError }));
  const move = useMutation(trpc.learning.moveCriterion.mutationOptions({ onSuccess: ok, onError }));
  const next = useMutation(trpc.learning.setNextCourse.mutationOptions({ onSuccess: ok, onError }));
  const busy = upsert.isPending || move.isPending || next.isPending;

  return (
    <section className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">{course.name}</div>
        <div className="text-xs text-ink-400">{course.code} · mốc học bạ: buổi {course.milestones.join(", ")}</div>
      </div>
      {criteria.length === 0 ? <p className="text-sm text-ink-400">Chưa có tiêu chí.</p> : (
        <ol className="space-y-1">
          {criteria.map((c, i) => (
            <li key={c.id} className={`flex items-center gap-2 rounded-lg border border-black/5 px-2 py-1.5 text-sm ${c.isActive ? "" : "opacity-50"}`}>
              <span className="w-5 text-xs text-ink-400">{i + 1}.</span>
              {editId === c.id ? (
                <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); upsert.mutate({ id: c.id, courseId: course.id, name: editName, description: c.description }); }}>
                  <input className="input !py-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy}>Lưu</button>
                </form>
              ) : <span className="flex-1">{c.name}{!c.isActive && <span className="ml-1 text-xs">(đã tắt)</span>}</span>}
              {canEdit && editId !== c.id && (
                <span className="flex gap-1 text-xs">
                  <button disabled={busy || i === 0} className="px-1 disabled:opacity-30" onClick={() => move.mutate({ id: c.id, direction: "up" })} aria-label="Lên">↑</button>
                  <button disabled={busy || i === criteria.length - 1} className="px-1 disabled:opacity-30" onClick={() => move.mutate({ id: c.id, direction: "down" })} aria-label="Xuống">↓</button>
                  <button className="px-1 text-brand-600" onClick={() => { setEditId(c.id); setEditName(c.name); }}>Sửa</button>
                  <button disabled={busy} className="px-1 text-ink-600" onClick={() => upsert.mutate({ id: c.id, courseId: course.id, name: c.name, description: c.description, isActive: !c.isActive })}>{c.isActive ? "Tắt" : "Bật"}</button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); upsert.mutate({ courseId: course.id, name }); }}>
          <input className="input" placeholder="Tên tiêu chí mới" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary" disabled={busy || name.trim().length < 2}>Thêm</button>
        </form>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-600">Khoá tiếp theo gợi ý:</span>
        <select className="input !w-auto !py-1 text-sm" disabled={!canEdit || busy} value={course.nextCourseId ?? ""} onChange={(e) => next.mutate({ courseId: course.id, nextCourseId: e.target.value || null })}>
          <option value="">— Không —</option>
          {allCourses.filter((x) => x.id !== course.id).map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
        </select>
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </section>
  );
}
