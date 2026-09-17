"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { PROPOSAL_TYPES, PROPOSAL_TYPE_VI, type ProposalType, type ProposalStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type LessonOpt = { id: string; label: string; title: string; objectives: string | null; materials: string | null };

export function NewProposal({ lessons, initialOpen, initialLesson, classId }: { lessons: LessonOpt[]; initialOpen: boolean; initialLesson?: string; classId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const first = lessons.find((l) => l.id === initialLesson) ?? lessons[0];
  const [open, setOpen] = useState(initialOpen && !!first);
  const [lessonId, setLesson] = useState(first?.id ?? "");
  const [type, setType] = useState<ProposalType>("objectives");
  const [reason, setReason] = useState("");
  const l = lessons.find((x) => x.id === lessonId);
  const [title, setTitle] = useState(first?.title ?? "");
  const [objectives, setObjectives] = useState(first?.objectives ?? "");
  const [materials, setMaterials] = useState(first?.materials ?? "");
  const pickLesson = (id: string) => {
    const x = lessons.find((y) => y.id === id);
    setLesson(id);
    setTitle(x?.title ?? "");
    setObjectives(x?.objectives ?? "");
    setMaterials(x?.materials ?? "");
  };
  const m = useMutation(trpc.content.createProposal.mutationOptions({ onSuccess: (r) => { setOpen(false); setReason(""); router.push(`/de-xuat-giao-an?id=${r.id}`); } }));
  if (!lessons.length) return <p className="text-sm text-ink-400">Bạn chưa phụ trách lớp nào có giáo trình để đề xuất.</p>;
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Gửi đề xuất</button>;
  return (
    <form className="card grid gap-2 p-4 text-sm md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ lessonId, type, reason, classId: classId ?? null, patch: { title, objectives, materials } }); }}>
      <h3 className="font-semibold md:col-span-2">Đề xuất sửa giáo án</h3>
      <label className="md:col-span-2">Bài học<select className="input mt-1 w-full" value={lessonId} onChange={(e) => pickLesson(e.target.value)}>{lessons.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>Loại đề xuất<select className="input mt-1 w-full" value={type} onChange={(e) => setType(e.target.value as ProposalType)}>{PROPOSAL_TYPES.map((t) => <option key={t} value={t}>{PROPOSAL_TYPE_VI[t]}</option>)}</select></label>
      <label>Tên bài<input className={`input mt-1 w-full ${l && title.trim() !== l.title ? "border-amber-500" : ""}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
      <label>Mục tiêu<textarea className={`input mt-1 w-full ${l && objectives.trim() !== (l.objectives ?? "") ? "border-amber-500" : ""}`} rows={4} value={objectives} onChange={(e) => setObjectives(e.target.value)} maxLength={3000} /></label>
      <label>Học cụ / chuẩn bị<textarea className={`input mt-1 w-full ${l && materials.trim() !== (l.materials ?? "") ? "border-amber-500" : ""}`} rows={4} value={materials} onChange={(e) => setMaterials(e.target.value)} maxLength={3000} /></label>
      <label className="md:col-span-2">Lý do / mô tả (≥ 20 ký tự)<textarea className="input mt-1 w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={3000} required /></label>
      <p className="text-xs text-ink-400 md:col-span-2">Ô viền cam là phần bạn đã sửa so với giáo án hiện tại.</p>
      {m.error && <p className="text-red-700 md:col-span-2">{m.error.message}</p>}
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Gửi</button></div>
    </form>
  );
}

type Txt = { title: string; objectives: string | null; materials: string | null };
type P = {
  id: string; code: string; typeLabel: string; status: ProposalStatus; statusLabel: string; reason: string; byName: string; reviewerName: string | null; createdAt: string; lessonSeq: number | null;
  snapshot: Txt; patch: { title?: string | null; objectives?: string | null; materials?: string | null }; current: Txt; fields: ("title" | "objectives" | "materials")[]; conflicts: string[];
  decisionNote: string | null; can: { withdraw: boolean; review: boolean; decide: boolean; apply: boolean; rejectApproved: boolean; comment: boolean };
  comments: { id: string; body: string; byName: string; createdAt: string }[];
};
const LABEL = { title: "Tên bài", objectives: "Mục tiêu", materials: "Học cụ / chuẩn bị" } as const;

export function ProposalPanel({ p, closeHref }: { p: P; closeHref: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const act = useMutation(trpc.content.proposalAction.mutationOptions({ onSuccess: () => { setNote(""); router.refresh(); } }));
  const cm = useMutation(trpc.content.proposalComment.mutationOptions({ onSuccess: () => { setComment(""); router.refresh(); } }));
  const go = (action: "review" | "approve" | "reject" | "apply" | "withdraw", force?: boolean) => act.mutate({ id: p.id, action, note: note || null, force });
  const fmt = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="card space-y-3 border-brand-600/30 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{p.code} · {p.typeLabel} <span className="text-sm font-normal text-ink-600">— {p.statusLabel}</span></h2>
          <p className="text-xs text-ink-400">Bài {p.lessonSeq} · {p.byName} · {fmt(p.createdAt)}{p.reviewerName ? ` · xử lý: ${p.reviewerName}` : ""}</p>
        </div>
        <Link href={closeHref} className="btn-ghost">Đóng</Link>
      </div>
      <p className="whitespace-pre-line rounded bg-black/5 p-2">{p.reason}</p>
      {p.fields.length === 0 ? <p className="text-xs text-ink-400">Không đề xuất thay đổi văn bản cụ thể.</p> : (
        <div className="grid gap-2 md:grid-cols-2">
          {p.fields.map((f) => (
            <div key={f} className="rounded border border-black/10 p-2">
              <div className="text-xs font-semibold uppercase text-ink-400">{LABEL[f]}{p.conflicts.includes(f) && <span className="ml-1 text-red-700">· giáo án đã đổi sau khi đề xuất</span>}</div>
              <div className="mt-1 whitespace-pre-line text-red-700 line-through">{p.status === "applied" ? p.snapshot[f] : p.current[f] || "(trống)"}</div>
              <div className="whitespace-pre-line text-green-700">{p.patch[f] || "(trống)"}</div>
            </div>
          ))}
        </div>
      )}
      {p.decisionNote && <p className="text-xs">Ghi chú xử lý: {p.decisionNote}</p>}
      {(p.can.withdraw || p.can.decide || p.can.apply || p.can.rejectApproved) && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input flex-1" placeholder="Ghi chú (bắt buộc khi từ chối)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          {p.can.review && <button type="button" className="btn-ghost" disabled={act.isPending} onClick={() => go("review")}>Nhận xem xét</button>}
          {p.can.decide && <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => go("approve")}>Duyệt</button>}
          {p.can.apply && <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => go("apply", p.conflicts.length > 0)}>{p.conflicts.length ? "Vẫn áp dụng (ghi đè)" : "Áp dụng vào giáo án"}</button>}
          {(p.can.decide || p.can.rejectApproved) && <button type="button" className="btn-ghost text-red-700" disabled={act.isPending} onClick={() => go("reject")}>Từ chối</button>}
          {p.can.withdraw && <button type="button" className="btn-ghost" disabled={act.isPending} onClick={() => go("withdraw")}>Rút đề xuất</button>}
        </div>
      )}
      {act.error && <p className="text-red-700">{act.error.message}</p>}
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase text-ink-400">Trao đổi</div>
        {p.comments.map((c) => <div key={c.id} className="text-xs"><b>{c.byName}</b> <span className="text-ink-400">{fmt(c.createdAt)}</span><div className="whitespace-pre-line">{c.body}</div></div>)}
        {p.can.comment && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); cm.mutate({ id: p.id, body: comment }); }}>
            <input className="input flex-1" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Viết bình luận…" maxLength={1000} />
            <button className="btn-ghost" disabled={cm.isPending || !comment.trim()}>Gửi</button>
          </form>
        )}
      </div>
    </section>
  );
}
