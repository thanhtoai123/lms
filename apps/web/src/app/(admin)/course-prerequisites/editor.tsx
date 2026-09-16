"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function AddPrereq({ courses }: { courses: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ courseId: "", requiredCourseId: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation(trpc.catalog.addPrerequisite.mutationOptions({ onSuccess: () => { setF({ courseId: "", requiredCourseId: "", note: "" }); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-semibold">Thêm điều kiện</h2>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Muốn học khoá
          <select className="input mt-1" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
            <option value="">— Chọn —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">phải hoàn thành
          <select className="input mt-1" value={f.requiredCourseId} onChange={(e) => setF({ ...f, requiredCourseId: e.target.value })}>
            <option value="">— Chọn —</option>
            {courses.filter((c) => c.id !== f.courseId).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Ghi chú<input className="input mt-1" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="btn-primary" disabled={add.isPending || !f.courseId || !f.requiredCourseId} onClick={() => add.mutate({ ...f, note: f.note || null })}>Thêm</button>
      </div>
    </section>
  );
}

export function RemovePrereq({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const rm = useMutation(trpc.catalog.removePrerequisite.mutationOptions({ onSuccess: () => router.refresh() }));
  return confirm ? (
    <span className="flex justify-end gap-2 text-xs"><button className="font-semibold text-red-700" disabled={rm.isPending} onClick={() => rm.mutate({ id })}>Xác nhận gỡ</button><button onClick={() => setConfirm(false)}>Thôi</button></span>
  ) : <button className="text-xs text-red-700 hover:underline" onClick={() => setConfirm(true)}>Gỡ</button>;
}
