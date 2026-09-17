"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FEEDBACK_TAGS, FEEDBACK_TAG_VI, CONTACT_CHANNELS, CONTACT_CHANNEL_VI, type FeedbackTag, type ContactChannel } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <span>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => onChange(n)} className={`text-2xl ${value >= n ? "text-amber-400" : "text-black/15"}`}>★</button>)}</span>;
}

export function NewFeedback() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [rating, setRating] = useState(5);
  const [tRating, setTRating] = useState(5);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [comment, setComment] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("zalo");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ctxQ = useQuery({ ...trpc.care.requestContext.queryOptions({ studentId: student?.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: !!student });
  const sess = useQuery({ ...trpc.care.recentSessions.queryOptions({ enrollmentId: enrollmentId || "00000000-0000-0000-0000-000000000000" }), enabled: !!enrollmentId });
  const m = useMutation(trpc.care.createFeedback.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: r.priority === "urgent" ? "Đã lưu — đã tạo việc chăm sóc gọi lại trong 24h" : "Đã lưu đánh giá" }); setComment(""); setTags([]); setSessionId(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Ghi nhận đánh giá</button>;
  const low = Math.min(rating, tRating) <= 3;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Ghi nhận đánh giá của phụ huynh</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <div className="grid gap-2 md:grid-cols-3">
        <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollmentId(""); setSessionId(""); }} />
        {ctxQ.data && <select className="input" value={enrollmentId} onChange={(e) => { setEnrollmentId(e.target.value); setSessionId(""); }}><option value="">— Lớp —</option>{ctxQ.data.enrollments.map((e) => <option key={e.id} value={e.id}>{e.classCode} · {e.courseCode}</option>)}</select>}
        {enrollmentId && <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Đánh giá chung (không theo buổi)</option>{(sess.data ?? []).map((s) => <option key={s.id} value={s.id}>Buổi {s.sequenceNo} · {s.date.split("-").reverse().join("/")}{s.teacherName ? ` · ${s.teacherName}` : ""}</option>)}</select>}
      </div>
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span>Hài lòng chung <StarInput value={rating} onChange={setRating} /></span>
        <span>Giáo viên <StarInput value={tRating} onChange={setTRating} /></span>
        <select className="input w-auto" value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>{CONTACT_CHANNELS.map((c) => <option key={c} value={c}>{CONTACT_CHANNEL_VI[c]}</option>)}</select>
      </div>
      <div className="flex flex-wrap gap-1">{FEEDBACK_TAGS.map((t) => <button key={t} type="button" className={`chip ${tags.includes(t) ? "bg-brand-100 text-brand-800" : "bg-black/5"}`} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{FEEDBACK_TAG_VI[t]}</button>)}</div>
      <textarea className="input h-20" placeholder={low ? "Ý kiến phụ huynh (bắt buộc với đánh giá ≤ 3 sao)" : "Ý kiến phụ huynh"} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={!enrollmentId || m.isPending || (low && comment.trim().length < 5)} onClick={() => { setMsg(null); m.mutate({ studentId: student!.id, enrollmentId, sessionId: sessionId || null, rating, teacherRating: tRating, tags, comment: comment.trim() || null, channel }); }}>Lưu đánh giá</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}

export function RespondFeedback({ id, status }: { id: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation(trpc.care.respondFeedback.mutationOptions({ onSuccess: () => { setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {status === "new" && <button className="btn-ghost !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id, status: "acknowledged" })}>Đã tiếp nhận</button>}
      <input className="input !w-80 !py-1 text-xs" placeholder="Nội dung phản hồi gửi phụ huynh" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary !py-1 text-xs" disabled={m.isPending || text.trim().length < 5} onClick={() => m.mutate({ id, status: "resolved", response: text.trim() })}>Phản hồi & đóng</button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
