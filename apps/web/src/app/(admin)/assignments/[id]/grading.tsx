"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { SubmissionStatus, SubmissionType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const CHIP: Record<SubmissionStatus, string> = {
  assigned: "bg-slate-100 text-slate-600", submitted: "bg-amber-100 text-amber-800", returned: "bg-blue-100 text-blue-700",
  graded: "bg-green-100 text-green-800", excused: "bg-slate-100 text-slate-500", missing: "bg-red-100 text-red-700",
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export function AssignmentActions({ id, status, missingFromRoster }: { id: string; status: string; missingFromRoster: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.content.assignmentAction.mutationOptions({ onSuccess: (_r, v) => { if (v.action === "delete") router.push("/assignments"); else router.refresh(); } }));
  const go = (action: "publish" | "close" | "reopen" | "sync" | "delete") => m.mutate({ id, action });
  return (
    <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
      {status === "draft" && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => go("publish")}>Giao bài & báo phụ huynh</button>}
      {status === "draft" && <button type="button" className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => go("delete")}>Xoá nháp</button>}
      {status === "published" && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => go("close")}>Đóng bài (chưa nộp → không nộp)</button>}
      {status === "published" && missingFromRoster > 0 && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => go("sync")}>Thêm {missingFromRoster} HV mới vào lớp</button>}
      {status === "closed" && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => go("reopen")}>Mở lại</button>}
      {m.error && <span className="text-red-700">{m.error.message}</span>}
      {m.data && (m.data.added > 0 || m.data.marked > 0) && <span className="text-green-700">{m.data.added ? `Đã giao cho ${m.data.added} HV. ` : ""}{m.data.marked ? `${m.data.marked} bài chuyển "không nộp".` : ""}</span>}
    </div>
  );
}

type Sub = {
  id: string; fullName: string; code: string | null; status: SubmissionStatus; statusLabel: string; answerText: string | null; link: string | null; submittedAt: string | null; submittedVia: string | null;
  late: boolean; attempts: number; score: number | null; feedback: string | null; gradedAt: string | null; gradedByName: string | null; coinAwarded: boolean; note: string | null;
  files: { name: string; mime: string; size: number; url: string }[]; parentLink: string | null;
};

export function SubmissionRow({ s, maxScore, canGrade, submissionType, closed }: { s: Sub; maxScore: number; canGrade: boolean; submissionType: SubmissionType; closed: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [score, setScore] = useState(s.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [upload, setUpload] = useState(false);
  const grade = useMutation(trpc.content.grade.mutationOptions({ onSuccess: () => router.refresh() }));
  const act = useMutation(trpc.content.submissionAction.mutationOptions({ onSuccess: () => router.refresh() }));
  const gradable = s.status === "submitted" || s.status === "graded" || (submissionType === "offline" && (s.status === "assigned" || s.status === "missing"));
  const copy = async () => {
    if (!s.parentLink) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${s.parentLink}`); setCopied(true); } catch { /* bỏ qua */ }
  };
  return (
    <tr>
      <td className="p-3">
        <div className="font-medium">{s.fullName}</div><div className="font-mono text-xs text-ink-400">{s.code}</div>
        {s.parentLink && <button type="button" className="text-xs text-brand-600" onClick={copy}>{copied ? "Đã chép link PH" : "Chép link nộp bài cho PH"}</button>}
      </td>
      <td className="p-3 text-xs">
        {s.submittedAt ? <div>{fmt(s.submittedAt)}{s.late && <span className="chip ml-1 bg-red-100 text-red-700">muộn</span>}{s.submittedVia === "staff" ? " · nộp hộ" : ""}{s.attempts > 1 ? ` · lần ${s.attempts}` : ""}</div> : <div className="text-ink-400">—</div>}
        {s.answerText && <p className="whitespace-pre-line">{s.answerText}</p>}
        {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600">{s.link}</a>}
        {s.files.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{s.files.map((f, i) => f.mime.startsWith("image/") ? (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={f.name} className="h-16 w-16 rounded object-cover" /></a>
        ) : <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="text-brand-600">{f.name}</a>)}</div>}
        {canGrade && !closed && (s.status === "assigned" || s.status === "returned") && submissionType !== "offline" && (
          upload ? <StaffSubmit id={s.id} type={submissionType} onDone={() => { setUpload(false); router.refresh(); }} /> : <button type="button" className="mt-1 text-brand-600" onClick={() => setUpload(true)}>Nộp hộ</button>
        )}
      </td>
      <td className="p-3 text-xs">
        <span className={`chip ${CHIP[s.status]}`}>{s.statusLabel}</span>
        {s.status === "graded" && <div className="mt-1 text-sm font-semibold">{s.score}/{maxScore}{s.coinAwarded && <span className="ml-1 text-amber-600">+xu</span>}</div>}
        {s.gradedByName && <div className="text-ink-400">{s.gradedByName} · {fmt(s.gradedAt)}</div>}
        {s.feedback && s.status !== "graded" && <div className="text-ink-600">{s.feedback}</div>}
        {s.note && <div className="text-ink-400">{s.note}</div>}
      </td>
      <td className="p-3">
        {canGrade && (
          <div className="space-y-1 text-xs">
            {gradable && (
              <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); grade.mutate({ id: s.id, score: Number(score), feedback: feedback || null }); }}>
                <div className="flex items-center gap-1"><input type="number" step="0.5" min={0} max={maxScore} className="input w-20 !py-1" value={score} onChange={(e) => setScore(e.target.value)} required aria-label="Điểm" /> / {maxScore}
                  <button className="btn-primary !py-1 text-xs" disabled={grade.isPending}>{s.status === "graded" ? "Sửa điểm" : "Chấm"}</button></div>
                <textarea className="input w-full !py-1" rows={2} placeholder="Nhận xét (bắt buộc nếu dưới trung bình)" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} />
                {grade.error && <p className="text-red-700">{grade.error.message}</p>}
                {grade.data?.coin.error && <p className="text-amber-700">Không thưởng được xu: {grade.data.coin.error}</p>}
                {grade.data && grade.data.coin.awarded > 0 && <p className="text-green-700">+{grade.data.coin.awarded} xu</p>}
              </form>
            )}
            <div className="flex flex-wrap gap-1">
              {(s.status === "submitted" || s.status === "graded") && !closed && <button type="button" className="btn-ghost !py-0.5 text-xs" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: "return", note })}>Trả lại làm lại</button>}
              {s.status !== "graded" && s.status !== "excused" && <button type="button" className="btn-ghost !py-0.5 text-xs" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: "excuse", note })}>Miễn</button>}
              {(s.status === "excused" || s.status === "missing") && <button type="button" className="btn-ghost !py-0.5 text-xs" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: "reopen" })}>Mở lại</button>}
            </div>
            {(s.status === "submitted" || s.status === "graded" || s.status === "assigned" || s.status === "returned") && <input className="input w-full !py-0.5" placeholder="Lý do / hướng dẫn (khi trả lại, miễn)" value={note} onChange={(e) => setNote(e.target.value)} />}
            {act.error && <p className="text-red-700">{act.error.message}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

function StaffSubmit({ id, type, onDone }: { id: string; type: SubmissionType; onDone: () => void }) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("submissionId", id);
    fd.set("text", text);
    fd.set("link", link);
    for (const f of Array.from(files ?? [])) fd.append("files", f);
    const r = await fetch("/api/content/submission", { method: "POST", body: fd }).then((x) => x.json() as Promise<{ ok: boolean; error?: string }>).catch(() => ({ ok: false, error: "Không kết nối được" }));
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.error ?? "Lỗi");
  };
  return (
    <div className="mt-1 space-y-1 rounded border border-black/10 p-2">
      {type === "file" && <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFiles(e.target.files)} />}
      {type === "link" && <input className="input w-full !py-1" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />}
      {type === "text" && <textarea className="input w-full !py-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} />}
      <button type="button" className="btn-primary !py-0.5 text-xs" disabled={busy} onClick={send}>Nộp</button>
      {err && <p className="text-red-700">{err}</p>}
    </div>
  );
}
