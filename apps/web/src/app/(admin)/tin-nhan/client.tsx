"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CONV_STATUSES, CONV_STATUS_VI, type ConvStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { StudentPicker, type PickedStudent } from "@/components/student-picker";

export function Composer({ id, canReply, canNote, windowNote }: { id: string; canReply: boolean; canNote: boolean; windowNote: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [note, setNote] = useState(!canReply);
  const m = useMutation(trpc.messaging.send.mutationOptions({ onSuccess: () => { setBody(""); router.refresh(); } }));
  if (!canReply && !canNote) return null;
  return (
    <form className="space-y-2 border-t border-black/5 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, body, note }); }}>
      {windowNote && <p className="text-xs text-amber-700">{windowNote}</p>}
      <textarea className={`input ${note ? "bg-amber-50" : ""}`} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={note ? "Ghi chú nội bộ (khách không thấy)" : "Trả lời khách…"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={note} disabled={!canReply} onChange={(e) => setNote(e.target.checked)} /> Ghi chú nội bộ</label>
        <button className="btn-primary" disabled={m.isPending || !body.trim()}>{note ? "Lưu ghi chú" : "Gửi"}</button>
      </div>
      {m.data && m.data.status !== "sent" && <p className="text-xs text-amber-700">Tin đã lưu nhưng chưa gửi ra kênh: {m.data.error}</p>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </form>
  );
}

export function ConvActions({ id, status, assignedTo, staff, canClearFlags, hasFlags }: { id: string; status: ConvStatus; assignedTo: string | null; staff: { id: string; name: string }[]; canClearFlags: boolean; hasFlags: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.messaging.update.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select className="input !w-auto !py-1 !text-xs" value={status} onChange={(e) => m.mutate({ id, status: e.target.value as ConvStatus })}>{CONV_STATUSES.map((s) => <option key={s} value={s}>{CONV_STATUS_VI[s]}</option>)}</select>
      <select className="input !w-auto !py-1 !text-xs" value={assignedTo ?? ""} onChange={(e) => m.mutate({ id, assignedTo: e.target.value || null })}><option value="">— Chưa giao —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      {canClearFlags && hasFlags && <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => m.mutate({ id, clearFlags: true })}>Gỡ cờ</button>}
      {m.error && <span className="text-red-700">{m.error.message}</span>}
    </div>
  );
}

export function StartConversation({ myStudents }: { myStudents: { id: string; fullName: string; code: string | null; classCode: string }[] | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [sid, setSid] = useState("");
  const [v, setV] = useState({ subject: "", body: "", includeTeacher: true });
  const m = useMutation(trpc.messaging.startParent.mutationOptions({ onSuccess: (r) => router.push(`/tin-nhan?id=${r.id}&link=${encodeURIComponent(r.link)}`) }));
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Nhắn phụ huynh</button>;
  const studentId = myStudents ? sid : student?.id ?? "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 w-full max-w-lg space-y-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ studentId, ...v }); }}>
        <h3 className="font-semibold">Nhắn phụ huynh</h3>
        <p className="text-xs text-ink-600">Hệ thống tạo liên kết riêng cho phụ huynh (không cần đăng nhập). Gửi liên kết qua Zalo/SMS của trung tâm; phụ huynh trả lời trong liên kết đó.</p>
        {myStudents ? (
          <label className="block">Học viên<select className="input mt-1" value={sid} onChange={(e) => setSid(e.target.value)} required><option value="">— chọn —</option>{myStudents.map((s) => <option key={s.id} value={s.id}>{s.classCode} · {s.fullName}</option>)}</select></label>
        ) : <div><div className="mb-1">Học viên</div><StudentPicker value={student} onChange={setStudent} /></div>}
        <label className="block">Chủ đề<input className="input mt-1" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} required placeholder="Tình hình học tập tháng 9" /></label>
        <label className="block">Nội dung<textarea className="input mt-1" rows={4} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} required maxLength={2000} /></label>
        {!myStudents && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.includeTeacher} onChange={(e) => setV({ ...v, includeTeacher: e.target.checked })} /> Giáo viên chủ nhiệm cùng theo dõi và trả lời</label>}
        {m.error && <p className="text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending || !studentId}>Tạo hội thoại</button></div>
      </form>
    </div>
  );
}

export function PortalLink({ id, link }: { id: string; link: string | null }) {
  const trpc = useTRPC();
  const m = useMutation(trpc.messaging.renewLink.mutationOptions());
  const [copied, setCopied] = useState(false);
  const url = m.data?.link ?? link;
  const full = url ? (typeof window !== "undefined" ? window.location.origin : "") + url : null;
  return (
    <div className="space-y-1 text-xs">
      {full ? (
        <div className="flex gap-1"><input readOnly className="input !py-1 !text-xs font-mono" value={full} /><button type="button" className="btn-ghost !py-1 !text-xs" onClick={async () => { try { await navigator.clipboard.writeText(full); setCopied(true); } catch { /* bỏ qua */ } }}>{copied ? "Đã chép" : "Chép"}</button></div>
      ) : <p className="text-ink-600">Liên kết chỉ hiện một lần khi tạo. Cần gửi lại cho phụ huynh → cấp liên kết mới (liên kết cũ hết hiệu lực).</p>}
      <button type="button" className="text-brand-600 hover:underline" disabled={m.isPending} onClick={() => m.mutate({ id })}>Cấp liên kết mới</button>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function LinkLeadForm({ id, centers }: { id: string; centers: { id: string; code: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState({ parentName: "", phone: "", childName: "", centerId: centers[0]?.id ?? "", consent: false });
  const m = useMutation(trpc.messaging.link.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="grid grid-cols-2 gap-2 text-xs" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, create: { ...v, childName: v.childName || null, centerId: v.centerId || null } }); }}>
      <input className="input !text-xs" value={v.parentName} onChange={(e) => setV({ ...v, parentName: e.target.value })} placeholder="Tên phụ huynh" required />
      <input className="input !text-xs" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="SĐT khách để lại" required />
      <input className="input !text-xs" value={v.childName} onChange={(e) => setV({ ...v, childName: e.target.value })} placeholder="Tên con (tuỳ chọn)" />
      <select className="input !text-xs" value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
      <label className="col-span-2 flex items-start gap-1"><input type="checkbox" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} /> Khách đồng ý để lại thông tin để trung tâm tư vấn (đã hỏi trong hội thoại)</label>
      {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
      <button className="btn-primary col-span-2 !py-1" disabled={m.isPending}>Tạo lead & gắn hội thoại</button>
    </form>
  );
}
