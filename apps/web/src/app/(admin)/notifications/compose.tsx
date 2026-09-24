"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Kind = "class" | "center" | "course";

export function Compose({ centers, courses, znsConfigured }: { centers: { id: string; code: string }[]; courses: { id: string; code: string }[]; znsConfigured: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("class");
  const [classId, setClassId] = useState("");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [channel, setChannel] = useState<"in_app" | "zns">("in_app");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("Kính gửi {ten_ph}, ");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cls = useQuery({ ...trpc.academics.classes.list.queryOptions({}), enabled: open });
  const audience = kind === "class" ? { kind, classId } : kind === "center" ? { kind, centerId } : { kind, courseId, centerId: centerId || null };
  const ready = kind === "class" ? !!classId : kind === "center" ? !!centerId : !!courseId;
  const pv = useMutation(trpc.care.previewBroadcast.mutationOptions({ onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const send = useMutation(trpc.care.sendBroadcast.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã gửi ${r.recipients} phụ huynh${r.queued ? ` (${r.queued} chờ gửi ZNS)` : ""}${r.optedOut ? ` · bỏ qua ${r.optedOut} người đã từ chối nhận tin tiếp thị` : ""}` }); pv.reset(); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Gửi thông báo</button>;
  const L = "text-xs text-ink-600";
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Gửi thông báo cho phụ huynh</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className={L}>Đối tượng<select className="input mt-1" value={kind} onChange={(e) => { setKind(e.target.value as Kind); pv.reset(); }}><option value="class">Một lớp</option><option value="center">Cả cơ sở</option><option value="course">Theo khoá học</option></select></label>
        {kind === "class" && <label className={`${L} md:col-span-2`}>Lớp<select className="input mt-1" value={classId} onChange={(e) => { setClassId(e.target.value); pv.reset(); }}><option value="">— Chọn —</option>{(cls.data ?? []).filter((c) => c.status === "running" || c.status === "recruiting").map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.enrolled})</option>)}</select></label>}
        {kind !== "class" && <label className={L}>Cơ sở<select className="input mt-1" value={centerId} onChange={(e) => { setCenterId(e.target.value); pv.reset(); }}>{kind === "course" && <option value="">Tất cả</option>}{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>}
        {kind === "course" && <label className={L}>Khoá<select className="input mt-1" value={courseId} onChange={(e) => { setCourseId(e.target.value); pv.reset(); }}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>}
        <label className={L}>Kênh<select className="input mt-1" value={channel} onChange={(e) => setChannel(e.target.value as "in_app" | "zns")}><option value="in_app">App phụ huynh</option><option value="zns">Zalo ZNS{znsConfigured ? "" : " (chưa cấu hình)"}</option></select></label>
      </div>
      <input className="input" placeholder="Tiêu đề" value={title} onChange={(e) => { setTitle(e.target.value); pv.reset(); }} />
      <textarea className="input h-28" value={body} onChange={(e) => { setBody(e.target.value); pv.reset(); }} />
      <div className="flex flex-wrap gap-1 text-xs">Chèn biến: {["ten_ph", "ten_hv", "lop", "co_so"].map((v) => <button key={v} type="button" className="chip bg-black/5" onClick={() => { setBody((b) => `${b}{${v}}`); pv.reset(); }}>{`{${v}}`}</button>)}</div>
      <input className="input" placeholder="Liên kết (tuỳ chọn)" value={link} onChange={(e) => setLink(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" disabled={!ready || pv.isPending} onClick={() => { setMsg(null); pv.mutate({ audience, title, body }); }}>Xem trước</button>
        <button className="btn-primary" disabled={!pv.data || pv.data.recipients === 0 || pv.data.unknownVars.length > 0 || send.isPending} onClick={() => send.mutate({ audience, title, body, channel, link: link || null })}>Gửi {pv.data ? `${pv.data.recipients} phụ huynh` : ""}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
      {pv.data && (
        <div className="space-y-1 rounded-xl bg-black/[0.03] p-3 text-sm">
          <div>
            {pv.data.recipients} phụ huynh nhận{pv.data.noParent ? ` · ${pv.data.noParent} học viên chưa có PH` : ""}
            {pv.data.optedOut ? <span className="text-amber-700"> · {pv.data.optedOut} người đã từ chối nhận tin tiếp thị (không gửi)</span> : null}
          </div>
          {pv.data.unknownVars.length > 0 && <div className="text-red-700">Biến không hỗ trợ: {pv.data.unknownVars.map((v) => `{${v}}`).join(", ")}</div>}
          {pv.data.sample.map((s, i) => <div key={i} className="rounded-lg bg-white p-2 text-xs"><div className="text-ink-400">Gửi {s.to}</div><b>{s.title}</b><div className="whitespace-pre-wrap">{s.body}</div></div>)}
        </div>
      )}
    </section>
  );
}

export function Retry({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.care.retryNotification.mutationOptions({ onSuccess: () => router.refresh() }));
  return <button className="mt-1 block text-xs text-brand-600" disabled={m.isPending} onClick={() => m.mutate({ id })}>Gửi lại</button>;
}

/** Ẩn (xoá mềm) thông báo đã đăng — phụ huynh không còn thấy; lý do bắt buộc và ghi nhật ký */
export function HideNotification({ id, hidden }: { id: string; hidden: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.care.hideNotification.mutationOptions({
    onSuccess: () => { setOpen(false); setReason(""); setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  if (!open) return <button className={`mt-1 block text-xs ${hidden ? "text-brand-600" : "text-red-700"}`} onClick={() => setOpen(true)}>{hidden ? "Bỏ ẩn" : "Ẩn thông báo"}</button>;
  return (
    <form className="mt-1 space-y-1" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, hidden: !hidden, reason }); }}>
      <input className="input !py-1 text-xs" required minLength={5} maxLength={300} placeholder="Lý do * (≥5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={m.isPending}>Xác nhận {hidden ? "bỏ ẩn" : "ẩn"}</button>
        <button type="button" className="text-xs text-ink-600" onClick={() => { setOpen(false); setError(null); }}>Huỷ</button>
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </form>
  );
}
