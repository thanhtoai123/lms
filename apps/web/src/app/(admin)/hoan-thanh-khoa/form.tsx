"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type Item = {
  enrollmentId: string; studentId: string; fullName: string; code: string | null; consumed: number; packageSessions: number;
  avg: number | null; suggestedGrade: string; ok: boolean; errors: string[]; warnings: string[]; proposed: boolean;
};
const GRADES = ["Xuất sắc", "Giỏi", "Khá", "Hoàn thành"];

/**
 * Hoàn thành khoá cho nhiều học viên một lần.
 * Người có quyền duyệt: cấp chứng chỉ ngay. Giáo viên: chỉ gửi ĐỀ XUẤT chờ duyệt.
 */
export function CompleteForm({ items, canApprove, canPropose }: { items: Item[]; canApprove: boolean; canPropose: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [rows, setRows] = useState(() => Object.fromEntries(items.map((i) => [i.enrollmentId, { checked: false, grade: i.suggestedGrade, evaluation: "" }])));
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string; certificateNo?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const onDone = (r: { results: { enrollmentId: string; ok: boolean; message: string; certificateNo?: string }[] }) => {
    setResults(Object.fromEntries(r.results.map((x) => [x.enrollmentId, x])));
    setError(null);
    router.refresh();
  };
  const complete = useMutation(trpc.learning.completeCourse.mutationOptions({ onSuccess: onDone, onError: (e) => setError(e.message) }));
  const propose = useMutation(trpc.learning.proposeCompletion.mutationOptions({ onSuccess: onDone, onError: (e) => setError(e.message) }));
  const busy = complete.isPending || propose.isPending;

  const set = (id: string, patch: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const selected = items.filter((i) => rows[i.enrollmentId]?.checked && i.ok && !i.proposed);
  const payload = () => ({ items: selected.map((i) => ({ enrollmentId: i.enrollmentId, grade: rows[i.enrollmentId]!.grade, teacherEvaluation: rows[i.enrollmentId]!.evaluation })) });

  if (items.length === 0) return <p className="text-sm text-ink-400">Lớp không có học viên đang học.</p>;
  if (!canPropose) return <p className="text-sm text-ink-400">Bạn chỉ xem được danh sách — không có quyền đề xuất hoặc duyệt hoàn thành khoá.</p>;
  return (
    <div className="space-y-3">
      {!canApprove && <div className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">Bạn chỉ gửi được đề xuất; quản lý duyệt xong mới cấp chứng chỉ.</div>}
      <div className="space-y-2">
        {items.map((i) => {
          const r = rows[i.enrollmentId]!;
          const res = results[i.enrollmentId];
          const blocked = !i.ok || i.proposed;
          return (
            <div key={i.enrollmentId} className={`rounded-xl border p-3 ${res ? (res.ok ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60") : r.checked ? "border-brand-600/40 bg-brand-50/40" : "border-black/5"} ${blocked ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <input type="checkbox" disabled={blocked || !!res?.ok} checked={r.checked} onChange={(e) => set(i.enrollmentId, { checked: e.target.checked })} />
                <div className="min-w-[180px] flex-1">
                  <span className="font-medium">{i.fullName}</span> <span className="font-mono text-xs text-ink-400">{i.code}</span>
                  {i.proposed && <span className="chip ml-2 bg-amber-100 text-amber-800">Đã có đề xuất chờ duyệt</span>}
                  <div className="text-xs text-ink-400">Đã học {i.consumed}/{i.packageSessions} · TB học bạ {i.avg ?? "—"}</div>
                </div>
                <select className="input !w-auto !py-1 text-sm" disabled={blocked} value={r.grade} onChange={(e) => set(i.enrollmentId, { grade: e.target.value })}>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
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
      {Object.values(results).some((x) => x.ok) && (
        <OkBox>
          {canApprove
            ? `Đã cấp ${Object.values(results).filter((x) => x.ok).length} chứng chỉ; việc tư vấn tái tục được tạo cho tư vấn viên.`
            : `Đã gửi ${Object.values(results).filter((x) => x.ok).length} đề xuất — chờ quản lý duyệt.`}
        </OkBox>
      )}
      <button
        className="btn-primary"
        disabled={busy || selected.length === 0}
        onClick={() => (canApprove ? complete.mutate(payload()) : propose.mutate(payload()))}
      >
        {busy ? "Đang xử lý…" : canApprove ? `Hoàn thành khoá cho ${selected.length} học viên` : `Gửi đề xuất cho ${selected.length} học viên`}
      </button>
    </div>
  );
}

type Proposal = {
  id: string; grade: string; teacherEvaluation: string; averageScore: string | null; proposedAt: Date | string | null; proposedByName: string | null;
  studentId: string; studentName: string; studentCode: string | null; classCode: string; centerCode: string; courseCode: string;
  consumed: number; packageSessions: number;
};

/** Khối "Đề xuất chờ duyệt": Duyệt (sinh chứng chỉ) / Từ chối (bắt buộc lý do) */
export function ProposalQueue({ items }: { items: Proposal[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.learning.decideCompletion.mutationOptions({
    onSuccess: (r) => { setMsg(r.status === "approved" ? `Đã duyệt — cấp chứng chỉ ${r.certificateNo}.` : "Đã từ chối đề xuất."); setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  if (items.length === 0) return <p className="text-sm text-ink-400">Không có đề xuất nào chờ duyệt.</p>;
  return (
    <div className="space-y-2">
      {msg && <OkBox>{msg}</OkBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {items.map((p) => (
        <div key={p.id} className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{p.studentName}</span> <span className="font-mono text-xs text-ink-400">{p.studentCode}</span>
              <div className="text-xs text-ink-400">{p.courseCode} · {p.classCode} · {p.centerCode} — đã học {p.consumed}/{p.packageSessions} buổi</div>
            </div>
            <div className="text-right text-xs text-ink-400">
              <div>Xếp loại đề xuất: <b className="text-ink-900">{p.grade}</b>{p.averageScore ? ` · TB ${p.averageScore}` : ""}</div>
              <div>{p.proposedByName ?? "?"}{p.proposedAt ? ` · ${new Date(p.proposedAt).toLocaleDateString("vi-VN")}` : ""}</div>
            </div>
          </div>
          <p className="whitespace-pre-wrap rounded-lg bg-black/[0.03] p-2 text-sm text-ink-600">{p.teacherEvaluation}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id: p.id, action: "approve" })}>Duyệt & cấp chứng chỉ</button>
            <input className="input !w-64 !py-1 text-xs" placeholder="Lý do từ chối *" value={reason[p.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [p.id]: e.target.value }))} />
            <button className="btn-ghost !py-1 text-xs text-red-700" disabled={m.isPending || !(reason[p.id] ?? "").trim()} onClick={() => m.mutate({ id: p.id, action: "reject", reason: reason[p.id] })}>Từ chối</button>
          </div>
        </div>
      ))}
    </div>
  );
}
