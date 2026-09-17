"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PARENT_REQUEST_TYPES, PARENT_REQUEST_TYPE_VI, PARENT_REQUEST_SLA_HOURS, CONTACT_CHANNELS, CONTACT_CHANNEL_VI, type ParentRequestType, type ContactChannel } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

const dmy = (d: string) => d.split("-").reverse().join("/");

export function NewParentRequest() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [type, setType] = useState<ParentRequestType>("absence");
  const [channel, setChannel] = useState<ContactChannel>("zalo");
  const [f, setF] = useState({ parentId: "", enrollmentId: "", sessionId: "", missedSessionId: "", dateFrom: "", dateTo: "", content: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  const ctxQ = useQuery({ ...trpc.care.requestContext.queryOptions({ studentId: student?.id ?? "00000000-0000-0000-0000-000000000000", enrollmentId: f.enrollmentId || null }), enabled: !!student });
  const m = useMutation(trpc.care.createRequest.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã tạo ${r.code}`, id: r.id }); setF((x) => ({ ...x, content: "", sessionId: "", missedSessionId: "" })); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Ghi nhận yêu cầu</button>;
  const c = ctxQ.data;
  const needEnr = type !== "complaint" && type !== "other";
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const L = "text-xs text-ink-600";
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Ghi nhận yêu cầu phụ huynh</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <div className="flex flex-wrap gap-1">{PARENT_REQUEST_TYPES.map((t) => <button key={t} className={`btn-ghost !py-1 text-xs ${type === t ? "ring-2 ring-brand-300" : ""}`} onClick={() => setType(t)}>{PARENT_REQUEST_TYPE_VI[t]} <span className="text-ink-400">({PARENT_REQUEST_SLA_HOURS[t]}h)</span></button>)}</div>
      <div className="grid gap-2 md:grid-cols-2">
        <StudentPicker value={student} onChange={(s) => { setStudent(s); setF({ parentId: "", enrollmentId: "", sessionId: "", missedSessionId: "", dateFrom: "", dateTo: "", content: f.content }); }} />
        <label className={L}>Kênh<select className="input mt-1" value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>{CONTACT_CHANNELS.map((x) => <option key={x} value={x}>{CONTACT_CHANNEL_VI[x]}</option>)}</select></label>
      </div>
      {c && (
        <div className="grid gap-2 md:grid-cols-3">
          <label className={L}>Phụ huynh<select className="input mt-1" value={f.parentId} onChange={(e) => set("parentId", e.target.value)}><option value="">(PH chính)</option>{c.guardians.map((g) => <option key={g.id} value={g.id}>{g.fullName}{g.isPrimary ? " · chính" : ""}</option>)}</select></label>
          {needEnr && <label className={L}>Lớp<select className="input mt-1" value={f.enrollmentId} onChange={(e) => { set("enrollmentId", e.target.value); set("sessionId", ""); set("missedSessionId", ""); }}><option value="">— Chọn —</option>{c.enrollments.map((e) => <option key={e.id} value={e.id}>{e.classCode} · {e.courseCode}{e.status !== "active" ? ` (${e.status})` : ""}</option>)}</select></label>}
          {type === "absence" && f.enrollmentId && <label className={L}>Buổi xin nghỉ<select className="input mt-1" value={f.sessionId} onChange={(e) => set("sessionId", e.target.value)}><option value="">— Chọn —</option>{c.upcoming.map((s) => <option key={s.id} value={s.id}>Buổi {s.sequenceNo} · {dmy(s.date)} {s.startTime.slice(0, 5)}</option>)}</select></label>}
          {type === "makeup" && f.enrollmentId && <label className={L}>Buổi đã vắng<select className="input mt-1" value={f.missedSessionId} onChange={(e) => set("missedSessionId", e.target.value)}><option value="">— Chọn —</option>{c.absences.map((s) => <option key={s.id} value={s.id}>Buổi {s.sequenceNo} · {dmy(s.date)}{s.status === "absent_excused" ? " (có phép)" : ""}</option>)}</select>{c.absences.length === 0 && <span className="text-[11px] text-amber-700">Không có buổi vắng trong 30 ngày</span>}</label>}
          {type === "pause" && (
            <>
              <label className={L}>Bảo lưu từ<input type="date" className="input mt-1" value={f.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} /></label>
              <label className={L}>Học lại từ<input type="date" className="input mt-1" value={f.dateTo} onChange={(e) => set("dateTo", e.target.value)} /></label>
            </>
          )}
          {c.recent.length > 0 && <div className="text-xs text-ink-600 md:col-span-3">Gần đây: {c.recent.map((r) => `${r.code} ${PARENT_REQUEST_TYPE_VI[r.type]} (${r.status})`).join(" · ")}</div>}
        </div>
      )}
      <label className={`${L} block`}>Nội dung phụ huynh trao đổi *<textarea className="input mt-1 h-20" value={f.content} onChange={(e) => set("content", e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!student || m.isPending || f.content.trim().length < 5} onClick={() => { setMsg(null); m.mutate({
          type, channel, studentId: student!.id, parentId: f.parentId || null, enrollmentId: needEnr ? f.enrollmentId || null : null,
          sessionId: f.sessionId || null, missedSessionId: f.missedSessionId || null, dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, content: f.content.trim(),
        }); }}>Tạo yêu cầu</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}{msg.id && <> · <a className="underline" href={`/parent-requests/${msg.id}`}>Mở</a></>}</span>}
      </div>
    </section>
  );
}
