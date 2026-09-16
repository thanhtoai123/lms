"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type Item = { enrollmentId: string; studentId: string; fullName: string; code: string | null; consumed: number; packageSessions: number; avg: number | null; suggestedGrade: string; ok: boolean; errors: string[]; warnings: string[] };
const GRADES = ["Xuất sắc", "Giỏi", "Khá", "Hoàn thành"];

export function CompleteForm({ items }: { items: Item[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [rows, setRows] = useState(() => Object.fromEntries(items.map((i) => [i.enrollmentId, { checked: false, grade: i.suggestedGrade, evaluation: "" }])));
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string; certificateNo?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.learning.completeCourse.mutationOptions({
    onSuccess: (r) => { setResults(Object.fromEntries(r.results.map((x) => [x.enrollmentId, x]))); setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const set = (id: string, patch: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const selected = items.filter((i) => rows[i.enrollmentId]?.checked && i.ok);
  if (items.length === 0) return <p className="text-sm text-ink-400">Lớp không có học viên đang học.</p>;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((i) => {
          const r = rows[i.enrollmentId]!;
          const res = results[i.enrollmentId];
          return (
            <div key={i.enrollmentId} className={`rounded-xl border p-3 ${res ? (res.ok ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60") : r.checked ? "border-brand-600/40 bg-brand-50/40" : "border-black/5"} ${i.ok ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <input type="checkbox" disabled={!i.ok || !!res?.ok} checked={r.checked} onChange={(e) => set(i.enrollmentId, { checked: e.target.checked })} />
                <div className="min-w-[180px] flex-1"><span className="font-medium">{i.fullName}</span> <span className="font-mono text-xs text-ink-400">{i.code}</span><div className="text-xs text-ink-400">Đã học {i.consumed}/{i.packageSessions} · TB học bạ {i.avg ?? "—"}</div></div>
                <select className="input !w-auto !py-1 text-sm" disabled={!i.ok} value={r.grade} onChange={(e) => set(i.enrollmentId, { grade: e.target.value })}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
              </div>
              {i.errors.map((x) => <div key={x} className="mt-1 text-xs text-red-700">{x}</div>)}
              {i.ok && i.warnings.map((x) => <div key={x} className="mt-1 text-xs text-amber-700">⚠ {x}</div>)}
              {r.checked && !res?.ok && <textarea className="input mt-2 min-h-16 text-sm" placeholder="Đánh giá cuối khoá của GV * (tối thiểu 20 ký tự)" value={r.evaluation} onChange={(e) => set(i.enrollmentId, { evaluation: e.target.value })} />}
              {res && <div className={`mt-1 text-xs ${res.ok ? "text-green-800" : "text-red-700"}`}>{res.message}{res.certificateNo ? ` · ${res.certificateNo}` : ""}</div>}
            </div>
          );
        })}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {Object.values(results).some((x) => x.ok) && <OkBox>Đã cấp {Object.values(results).filter((x) => x.ok).length} chứng chỉ; việc tư vấn tái tục được tạo cho tư vấn viên.</OkBox>}
      <button className="btn-primary" disabled={m.isPending || selected.length === 0} onClick={() => m.mutate({ items: selected.map((i) => ({ enrollmentId: i.enrollmentId, grade: rows[i.enrollmentId]!.grade, teacherEvaluation: rows[i.enrollmentId]!.evaluation })) })}>
        {m.isPending ? "Đang xử lý…" : `Hoàn thành khoá cho ${selected.length} học viên`}
      </button>
    </div>
  );
}
