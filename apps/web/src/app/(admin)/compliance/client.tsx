"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DSR_TYPES, DSR_TYPE_VI, DSR_SLA_DAYS, CONSENT_PURPOSE_VI, INCIDENT_SEVERITIES, INCIDENT_SEVERITY_VI, type DsrType, type SubjectType, type ConsentPurpose, type IncidentSeverity } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const CHANNELS: { key: string; label: string }[] = [
  { key: "phone", label: "Điện thoại" }, { key: "zalo", label: "Zalo" }, { key: "email", label: "Email" },
  { key: "in_person", label: "Trực tiếp" }, { key: "letter", label: "Văn bản" }, { key: "web", label: "Website" },
];

type Subject = { type: SubjectType; id: string; label: string; anonymized: boolean };

function SubjectLookup({ onPick, picked }: { onPick: (s: Subject | null) => void; picked: Subject | null }) {
  const trpc = useTRPC();
  const [phone, setPhone] = useState("");
  const [q, setQ] = useState("");
  const r = useQuery({ ...trpc.compliance.findSubjects.queryOptions({ phone: q }), enabled: q.length >= 9, retry: false });
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="SĐT của chủ thể dữ liệu" />
        <button type="button" className="btn-ghost" onClick={() => setQ(phone.replace(/\D/g, ""))}>Tìm hồ sơ</button>
      </div>
      {r.error && <p className="text-xs text-red-700">{r.error.message}</p>}
      {r.data && (r.data.subjects.length === 0 ? <p className="text-xs text-ink-400">Không tìm thấy hồ sơ với {r.data.phone} — có thể ghi nhận trước và liên kết sau.</p> : (
        <ul className="space-y-1 text-xs">
          {r.data.subjects.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2">
                <input type="radio" name="subject" checked={picked?.id === s.id} onChange={() => onPick(s)} disabled={s.anonymized} />
                {s.label}{s.anonymized && <span className="chip bg-slate-100 text-ink-600">đã ẩn danh</span>}
              </label>
            </li>
          ))}
          {picked && <li><button type="button" className="text-ink-400 hover:underline" onClick={() => onPick(null)}>Bỏ chọn</button></li>}
        </ul>
      ))}
    </div>
  );
}

export function CreateRequestForm({ centers, globalCreate }: { centers: { id: string; code: string; name: string }[]; globalCreate: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ type: "access" as DsrType, requesterName: "", requesterPhone: "", channel: "phone", details: "", centerId: globalCreate ? "" : centers[0]?.id ?? "" });
  const [subject, setSubject] = useState<Subject | null>(null);
  const m = useMutation(trpc.compliance.create.mutationOptions({ onSuccess: (r) => { setOpen(false); router.push(`/compliance?id=${r.id}`); router.refresh(); } }));
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Ghi nhận yêu cầu</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ ...v, centerId: v.centerId || null, subjectType: subject?.type ?? null, subjectId: subject?.id ?? null });
      }}>
        <h3 className="col-span-2 font-semibold">Ghi nhận yêu cầu về dữ liệu cá nhân</h3>
        <p className="col-span-2 text-xs text-ink-600">Phản hồi tiếp nhận trong 2 ngày làm việc; hạn thực hiện loại này: {DSR_SLA_DAYS[v.type]} ngày (gia hạn 1 lần). Không hứa hẹn kết quả với người yêu cầu trước khi bộ phận bảo vệ dữ liệu xác minh.</p>
        <label className="col-span-2">Loại yêu cầu<select className="input mt-1" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as DsrType })}>{DSR_TYPES.map((t) => <option key={t} value={t}>{DSR_TYPE_VI[t]}</option>)}</select></label>
        <label>Người yêu cầu<input className="input mt-1" value={v.requesterName} onChange={(e) => setV({ ...v, requesterName: e.target.value })} required minLength={2} /></label>
        <label>SĐT người yêu cầu<input className="input mt-1" value={v.requesterPhone} onChange={(e) => setV({ ...v, requesterPhone: e.target.value })} required inputMode="tel" /></label>
        <label>Kênh<select className="input mt-1" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
        <label>Cơ sở<select className="input mt-1" value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{globalCreate && <option value="">Toàn hệ thống</option>}{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
        <label className="col-span-2">Nội dung<textarea className="input mt-1" rows={3} value={v.details} onChange={(e) => setV({ ...v, details: e.target.value })} required minLength={10} placeholder="Phụ huynh yêu cầu gì, phạm vi dữ liệu nào…" /></label>
        <div className="col-span-2"><div className="mb-1 text-xs text-ink-600">Hồ sơ liên quan (tuỳ chọn)</div><SubjectLookup picked={subject} onPick={setSubject} /></div>
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Ghi nhận</button>
        </div>
      </form>
    </div>
  );
}

export function LinkSubject({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [subject, setSubject] = useState<Subject | null>(null);
  const m = useMutation(trpc.compliance.link.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="space-y-2 text-sm">
      <SubjectLookup picked={subject} onPick={setSubject} />
      {subject && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({ id, subjectType: subject.type, subjectId: subject.id })}>Liên kết hồ sơ</button>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function RequestActions({ id, status }: { id: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const m = useMutation(trpc.compliance.action.mutationOptions({ onSuccess: () => { setNote(""); router.refresh(); } }));
  const act = (action: "verify" | "start" | "complete" | "reject") => m.mutate({ id, action, note: note || null });
  return (
    <div className="space-y-2 text-sm">
      <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú / kết quả phản hồi người yêu cầu (bắt buộc khi hoàn tất hoặc từ chối, ≥ 10 ký tự)" />
      <div className="flex flex-wrap gap-2">
        {status === "received" && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => act("verify")}>Xác minh danh tính</button>}
        {(status === "received" || status === "verifying") && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => act("start")}>Bắt đầu xử lý</button>}
        {status === "in_progress" && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => act("complete")}>Hoàn tất</button>}
        <button type="button" className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => act("reject")}>Từ chối</button>
      </div>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function ExportButton({ id, existingUrl }: { id: string; existingUrl: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.compliance.export.mutationOptions({ onSuccess: () => router.refresh() }));
  const url = m.data?.url ?? existingUrl;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ id })}>{existingUrl ? "Xuất lại bản sao" : "Xuất bản sao dữ liệu (JSON)"}</button>
      {url && <a href={url} className="text-brand-600 hover:underline" target="_blank" rel="noreferrer">Tải file (hết hạn sau 15 phút)</a>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      <p className="w-full text-xs text-ink-400">Mỗi lần xuất được ghi nhật ký truy cập dữ liệu cá nhân.</p>
    </div>
  );
}

export function ConsentToggle({ id, purpose, granted }: { id: string; purpose: ConsentPurpose; granted: boolean | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.compliance.setConsent.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="inline-flex gap-1">
      {granted !== true && <button type="button" className="text-xs text-green-700 hover:underline" disabled={m.isPending} onClick={() => m.mutate({ id, purpose, granted: true })}>Ghi nhận đồng ý</button>}
      {granted !== false && <button type="button" className="text-xs text-red-700 hover:underline" disabled={m.isPending} onClick={() => m.mutate({ id, purpose, granted: false })}>Rút đồng ý</button>}
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
      <span className="sr-only">{CONSENT_PURPOSE_VI[purpose]}</span>
    </span>
  );
}

export function EraseForm({ id, code, mode }: { id: string; code: string; mode: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const m = useMutation(trpc.compliance.erase.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, confirm: confirm.trim() }); }}>
      <p className="text-xs text-red-700">Không thể hoàn tác. {mode === "partial" ? "Chỉ ẩn thông tin liên hệ; tên trên chứng từ kế toán được giữ." : "Toàn bộ tên, SĐT, email, ghi chú sẽ bị thay bằng dữ liệu ẩn danh."}</p>
      <div className="flex gap-2">
        <input className="input font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`Nhập ${code} để xác nhận`} />
        <button className="btn-primary !bg-red-600" disabled={m.isPending || confirm.trim() !== code}>Ẩn danh hoá</button>
      </div>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </form>
  );
}

export function RetentionRun({ due }: { due: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.compliance.retention.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ dryRun: true })}>Kiểm tra (không thay đổi)</button>
        {due > 0 && <button type="button" className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => { if (window.confirm(`Ẩn danh hoá ${due} lead quá hạn lưu giữ? Không thể hoàn tác.`)) m.mutate({ dryRun: false }); }}>Ẩn danh ngay</button>}
      </div>
      {m.data && <p className="text-xs text-ink-600">Mốc: trước {m.data.cutoff} · {m.data.count} lead đến hạn · đã xử lý {m.data.done}</p>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function ExtendForm({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.compliance.extend.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="flex flex-wrap gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, reason }); }}>
      <input className="input flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do gia hạn (1 lần, thông báo cho người yêu cầu)" />
      <button className="btn-ghost" disabled={m.isPending || reason.trim().length < 10}>Gia hạn</button>
      {m.error && <p className="w-full text-red-700">{m.error.message}</p>}
    </form>
  );
}

export function ReportIncidentForm({ centers, globalCreate }: { centers: { id: string; code: string; name: string }[]; globalCreate: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [v, setV] = useState({ title: "", description: "", severity: "medium" as IncidentSeverity, detectedAt: nowLocal(), affectedCount: 0, dataTypes: "", centerId: globalCreate ? "" : centers[0]?.id ?? "" });
  const m = useMutation(trpc.compliance.reportIncident.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className="btn-ghost text-red-700" onClick={() => setOpen(true)}>+ Báo sự cố</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ ...v, detectedAt: new Date(v.detectedAt).toISOString(), centerId: v.centerId || null, dataTypes: v.dataTypes || null });
      }}>
        <h3 className="col-span-2 font-semibold">Báo sự cố dữ liệu cá nhân</h3>
        <p className="col-span-2 text-xs text-ink-600">Báo ngay khi phát hiện (gửi nhầm danh sách, mất máy có dữ liệu, lộ tài khoản…). Không tự xử lý bằng cách xoá dấu vết.</p>
        <label className="col-span-2">Tiêu đề<input className="input mt-1" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required /></label>
        <label className="col-span-2">Mô tả<textarea className="input mt-1" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required placeholder="Điều gì xảy ra, khi nào, dữ liệu gì, ai nhận được" /></label>
        <label>Mức độ<select className="input mt-1" value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value as IncidentSeverity })}>{INCIDENT_SEVERITIES.map((x) => <option key={x} value={x}>{INCIDENT_SEVERITY_VI[x]}</option>)}</select></label>
        <label>Phát hiện lúc<input type="datetime-local" className="input mt-1" value={v.detectedAt} onChange={(e) => setV({ ...v, detectedAt: e.target.value })} required /></label>
        <label>Số người ảnh hưởng<input type="number" min={0} className="input mt-1" value={v.affectedCount} onChange={(e) => setV({ ...v, affectedCount: Number(e.target.value) })} /></label>
        <label>Cơ sở<select className="input mt-1" value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{globalCreate && <option value="">Toàn hệ thống</option>}{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        <label className="col-span-2">Loại dữ liệu<input className="input mt-1" value={v.dataTypes} onChange={(e) => setV({ ...v, dataTypes: e.target.value })} placeholder="Họ tên, SĐT phụ huynh, ảnh học viên…" /></label>
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          <button className="btn-primary" disabled={m.isPending}>Ghi nhận</button>
        </div>
      </form>
    </div>
  );
}

export function IncidentActions({ id, severity, notifiedAuthority, notifiedSubjects, containment }: { id: string; severity: string; notifiedAuthority: boolean; notifiedSubjects: boolean; containment: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [text, setText] = useState(containment ?? "");
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.compliance.updateIncident.mutationOptions({ onSuccess: () => router.refresh() }));
  const go = (action: "contain" | "notify_authority" | "notify_subjects" | "close") => m.mutate({ id, action, containment: text || null, noNotifyReason: reason || null });
  return (
    <div className="w-56 space-y-1 text-xs">
      <textarea className="input !text-xs" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Biện pháp khoanh vùng / khắc phục" />
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-ghost !px-2 !py-1" disabled={m.isPending} onClick={() => go("contain")}>Đã khoanh vùng</button>
        {!notifiedAuthority && <button type="button" className="btn-ghost !px-2 !py-1" disabled={m.isPending} onClick={() => go("notify_authority")}>Đã báo A05</button>}
        {!notifiedSubjects && <button type="button" className="btn-ghost !px-2 !py-1" disabled={m.isPending} onClick={() => go("notify_subjects")}>Đã báo người bị ảnh hưởng</button>}
      </div>
      {severity === "low" && !notifiedAuthority && <input className="input !text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do không thông báo (mức thấp)" />}
      <button type="button" className="btn-primary !px-2 !py-1" disabled={m.isPending} onClick={() => go("close")}>Đóng sự cố</button>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}
