"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { leadEventsFor, LEAD_STATUS_VI, type LeadEvent, type LeadStatus } from "@satarobo/core";
import { LeadChip, SlaChip, EVENT_VI, fmtDateTime } from "@/components/lead-ui";

type Cls = { id: string; code: string; name: string; centerCode: string; enrolled: number; capacity: number };

type Center = { id: string; code: string; name: string };

export function LeadDetail({ id, classes, assignees, centers }: { id: string; classes: Cls[]; assignees: { id: string; fullName: string }[]; centers: Center[] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.leads.get.queryOptions({ id }));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"call" | "message" | "note">("call");
  const [trialAt, setTrialAt] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [conv, setConv] = useState({ classId: classes[0]?.id ?? "", packageSessions: 48, status: "active" as "active" | "trial", childId: "", mediaConsent: false, paidAmount: "", paidAt: "" });
  const [child, setChild] = useState({ fullName: "", grade: "", school: "" });
  const [showChild, setShowChild] = useState(false);
  const [xfer, setXfer] = useState({ toCenterId: "", reason: "" });
  const [showXfer, setShowXfer] = useState(false);

  const refresh = () => { qc.invalidateQueries({ queryKey: trpc.admissions.leads.get.queryKey({ id }) }); qc.invalidateQueries({ queryKey: trpc.admissions.leads.inbox.queryKey() }); };
  const onErr = (e: unknown) => setError((e as Error).message);
  const act = useMutation(trpc.admissions.leads.addActivity.mutationOptions({ onSuccess: () => { setNote(""); setError(null); refresh(); }, onError: onErr }));
  const tr = useMutation(trpc.admissions.leads.transition.mutationOptions({ onSuccess: () => { setError(null); refresh(); }, onError: onErr }));
  const assign = useMutation(trpc.admissions.leads.assign.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const done = useMutation(trpc.admissions.leads.completeTask.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const convert = useMutation(trpc.admissions.leads.convert.mutationOptions({ onSuccess: (r) => { setError(null); setNotice(r.accountPending ? "Đã chốt. Tài khoản phụ huynh ở trạng thái chờ kích hoạt — PH vào /kich-hoat nhập SĐT nhận OTP Zalo để đặt mật khẩu." : "Đã chốt."); refresh(); }, onError: onErr }));
  const addChild = useMutation(trpc.admissions.leads.addChild.mutationOptions({ onSuccess: () => { setChild({ fullName: "", grade: "", school: "" }); setShowChild(false); refresh(); }, onError: onErr }));
  const rmChild = useMutation(trpc.admissions.leads.removeChild.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const transfer = useMutation(trpc.admissions.leads.transferCenter.mutationOptions({ onSuccess: () => { setShowXfer(false); setNotice("Đã chuyển lead sang cơ sở khác."); refresh(); }, onError: onErr }));
  const [notice, setNotice] = useState<string | null>(null);

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy"}</div>;
  const l = q.data;
  const events = leadEventsFor(l.status);
  const busy = act.isPending || tr.isPending || assign.isPending || done.isPending || convert.isPending || addChild.isPending || rmChild.isPending || transfer.isPending;
  const openChildren = l.children.filter((c) => !c.convertedStudentId);

  const doEvent = (event: LeadEvent) => {
    if (event === "schedule_trial" && !trialAt) return setError("Chọn thời gian học thử trước");
    if (event === "lose" && !lostReason) return setError("Nhập lý do mất lead");
    if (event === "enroll") return setError("Dùng khung 'Ghi danh' bên dưới để tạo học viên + đăng ký lớp");
    tr.mutate({ leadId: id, event, trialAt: event === "schedule_trial" ? new Date(trialAt).toISOString() : undefined, lostReason: event === "lose" ? lostReason : undefined });
  };

  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-ink-600">← Hộp thư lead</Link>

      <header className="card p-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{l.parentName} <span className="font-mono text-sm text-ink-600 ml-2">{l.phone}</span></h1>
          <div className="text-sm text-ink-600">{l.childName ?? "Chưa có tên con"}{l.childGrade ? ` · lớp ${l.childGrade}` : ""}{l.school ? ` · ${l.school}` : ""}</div>
          <div className="text-xs text-ink-400 mt-1">Nguồn: {l.source ?? "—"}{l.utmCampaign ? ` · ${l.utmCampaign}` : ""} · {l.course?.code ?? "chưa rõ khoá"} · {l.center?.code ?? "chưa rõ cơ sở"} · tạo {fmtDateTime(l.createdAt)}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2"><LeadChip status={l.status} /><SlaChip sla={l.sla} /></div>
          <select className="input !w-auto text-xs" value={l.assignedToId ?? ""} onChange={(e) => assign.mutate({ leadId: id, assigneeId: e.target.value || null })} disabled={busy}>
            <option value="">— Chưa phân —</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
          </select>
          {l.status !== "enrolled" && <button className="text-xs text-ink-600 underline" onClick={() => setShowXfer((v) => !v)}>Chuyển lead sang cơ sở khác</button>}
        </div>
      </header>
      {showXfer && (
        <form className="card p-4 grid sm:grid-cols-[1fr_2fr_auto] gap-2 border-amber-300" onSubmit={(e) => { e.preventDefault(); transfer.mutate({ leadId: id, toCenterId: xfer.toCenterId, reason: xfer.reason }); }}>
          <select className="input" required value={xfer.toCenterId} onChange={(e) => setXfer({ ...xfer, toCenterId: e.target.value })}>
            <option value="">— Cơ sở đích —</option>
            {centers.filter((c) => c.id !== l.centerId).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <input className="input" required minLength={3} placeholder="Lý do chuyển (bắt buộc)" value={xfer.reason} onChange={(e) => setXfer({ ...xfer, reason: e.target.value })} />
          <button className="btn-primary" disabled={busy}>Chuyển</button>
        </form>
      )}

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex justify-between gap-3"><span>{notice}</span><button className="text-xs underline" onClick={() => setNotice(null)}>Đóng</button></div>}

      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4">
          {/* Việc cần làm */}
          {l.tasks.filter((t) => !t.doneAt).length > 0 && (
            <section className="card p-4 space-y-2">
              <h2 className="font-bold">Việc cần làm</h2>
              {l.tasks.filter((t) => !t.doneAt).map((t) => {
                const overdue = new Date(t.dueAt).getTime() < Date.now();
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/5 p-3">
                    <div><div className="font-medium">{t.title}</div><div className={`text-xs ${overdue ? "text-red-700" : "text-ink-400"}`}>Hạn {fmtDateTime(t.dueAt)}{overdue ? " · quá hạn" : ""}{t.createdByRule ? " · tự động" : ""}</div></div>
                    <button className="btn-ghost text-xs" disabled={busy} onClick={() => done.mutate({ taskId: t.id })}>Xong</button>
                  </div>
                );
              })}
            </section>
          )}

          {/* Con của phụ huynh (LeadChild) */}
          <section className="card p-4 space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-bold">Con của phụ huynh <span className="text-xs font-normal text-ink-400">({l.children.length})</span></h2><button className="btn-ghost text-xs" onClick={() => setShowChild((v) => !v)}>+ Thêm con</button></div>
            {l.children.length === 0 && <p className="text-xs text-ink-400">Chưa có thông tin con. Thêm để chốt theo từng con.</p>}
            <ul className="divide-y divide-black/5">
              {l.children.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div><span className="font-medium">{c.fullName}</span><span className="text-ink-400 text-xs">{c.grade ? ` · lớp ${c.grade}` : ""}{c.school ? ` · ${c.school}` : ""}{c.courseCode ? ` · ${c.courseCode}` : ""}</span></div>
                  {c.convertedStudentId ? <span className="chip bg-green-100 text-green-800">Đã chốt</span> : <button className="text-xs text-ink-400 hover:text-red-700" disabled={busy} onClick={() => rmChild.mutate({ leadId: id, childId: c.id })}>Xoá</button>}
                </li>
              ))}
            </ul>
            {showChild && (
              <form className="grid sm:grid-cols-[1fr_90px_1fr_auto] gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); addChild.mutate({ leadId: id, fullName: child.fullName, grade: child.grade ? Number(child.grade) : null, school: child.school || null }); }}>
                <input className="input" placeholder="Tên con *" required value={child.fullName} onChange={(e) => setChild({ ...child, fullName: e.target.value })} />
                <input className="input" type="number" min={1} max={12} placeholder="Lớp" value={child.grade} onChange={(e) => setChild({ ...child, grade: e.target.value })} />
                <input className="input" placeholder="Trường" value={child.school} onChange={(e) => setChild({ ...child, school: e.target.value })} />
                <button className="btn-primary" disabled={busy}>Lưu</button>
              </form>
            )}
          </section>

          {/* Ghi tương tác */}
          <section className="card p-4 space-y-2">
            <h2 className="font-bold">Ghi tương tác <span className="text-xs font-normal text-ink-400">(reset SLA)</span></h2>
            <div className="flex gap-2">
              {(["call", "message", "note"] as const).map((t) => <button key={t} type="button" className={`chip cursor-pointer ${noteType === t ? "bg-brand-500 text-white" : "bg-black/5"}`} onClick={() => setNoteType(t)}>{t === "call" ? "Gọi" : t === "message" ? "Nhắn" : "Ghi chú"}</button>)}
            </div>
            <textarea className="input min-h-20" placeholder="PH nói gì, hẹn gì, cần gì…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={busy || note.trim().length === 0} onClick={() => act.mutate({ leadId: id, type: noteType, content: note.trim() })}>Lưu tương tác</button>
          </section>

          {/* Chuyển trạng thái */}
          {events.length > 0 && (
            <section className="card p-4 space-y-3">
              <h2 className="font-bold">Chuyển trạng thái</h2>
              <div className="flex flex-wrap gap-2">
                {events.map((e) => <button key={e} className={e === "lose" ? "btn-ghost text-red-700" : "btn-ghost"} disabled={busy} onClick={() => doEvent(e)}>{EVENT_VI[e] ?? e}</button>)}
              </div>
              {!["enrolled", "lost"].includes(l.status) && <p className="text-xs text-ink-600">Muốn xếp bé vào một buổi học cụ thể (có kiểm tra chỗ trống, báo GV)? <Link href={`/lop-trial?lead=${id}`} className="font-semibold text-brand-600 hover:underline">Xếp vào Lớp Trial →</Link></p>}
              {events.includes("schedule_trial") && <div><label className="label">Thời gian học thử (cho "Hẹn học thử")</label><input type="datetime-local" className="input max-w-xs" value={trialAt} onChange={(e) => setTrialAt(e.target.value)} /></div>}
              {events.includes("lose") && <div><label className="label">Lý do mất (cho "Mất")</label><input className="input max-w-xs" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Học phí / xa / chọn nơi khác…" /></div>}
            </section>
          )}

          {/* Ghi danh */}
          {l.status !== "enrolled" && l.status !== "lost" && (
            <section className="card p-4 space-y-3 border-brand-500/30">
              <h2 className="font-bold">Ghi danh (chốt)</h2>
              <p className="text-xs text-ink-600">Tạo phụ huynh (ghép theo SĐT nếu đã có), học viên và đăng ký lớp trong một bước. Lead chuyển sang "Đã đăng ký".</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {openChildren.length > 0 && (
                  <select className="input sm:col-span-3" value={conv.childId} onChange={(e) => setConv({ ...conv, childId: e.target.value })}>
                    <option value="">— Chọn con để chốt —</option>
                    {openChildren.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.grade ? ` · lớp ${c.grade}` : ""}</option>)}
                  </select>
                )}
                <select className="input sm:col-span-2" value={conv.classId} onChange={(e) => setConv({ ...conv, classId: e.target.value })}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.enrolled}/{c.capacity})</option>)}
                </select>
                <input type="number" className="input" min={1} value={conv.packageSessions} onChange={(e) => setConv({ ...conv, packageSessions: Number(e.target.value) })} title="Số buổi gói" />
                <input type="number" className="input" min={0} step={100000} placeholder="Đã đóng (đ)" value={conv.paidAmount} onChange={(e) => setConv({ ...conv, paidAmount: e.target.value })} />
                <input type="date" className="input" value={conv.paidAt} onChange={(e) => setConv({ ...conv, paidAt: e.target.value })} title="Ngày đóng" />
                <label className="text-sm flex items-center gap-2 px-1"><input type="checkbox" checked={conv.mediaConsent} onChange={(e) => setConv({ ...conv, mediaConsent: e.target.checked })} /> PH đồng ý đăng ảnh con</label>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm flex items-center gap-1"><input type="radio" checked={conv.status === "active"} onChange={() => setConv({ ...conv, status: "active" })} /> Chính thức</label>
                <label className="text-sm flex items-center gap-1"><input type="radio" checked={conv.status === "trial"} onChange={() => setConv({ ...conv, status: "trial" })} /> Học thử trong lớp</label>
                <button className="btn-primary ml-auto" disabled={busy || !conv.classId || (openChildren.length > 0 && !conv.childId)} onClick={() => convert.mutate({ leadId: id, classId: conv.classId, packageSessions: conv.packageSessions, status: conv.status, childId: conv.childId || null, mediaConsent: conv.mediaConsent, paidAmount: conv.paidAmount ? Number(conv.paidAmount) : null, paidAt: conv.paidAt || null })}>{convert.isPending ? "Đang ghi danh…" : "Ghi danh"}</button>
              </div>
              <p className="text-[11px] text-ink-400">Sau chốt: tài khoản PH ở trạng thái "chờ kích hoạt" — PH tự kích hoạt bằng OTP Zalo. Học phí đối soát ở module Tài chính.</p>
            </section>
          )}
          {l.status === "enrolled" && l.convertedStudentId && (
            <section className="card p-4 bg-green-50 border-green-200 text-sm">Đã ghi danh · <Link className="underline font-medium" href={`/classes`}>xem lớp</Link> · mã HV được tạo tự động.</section>
          )}
        </div>

        {/* Timeline */}
        <aside className="card p-4">
          <h2 className="font-bold mb-2">Timeline</h2>
          <ol className="space-y-3 text-sm">
            {l.activities.map((a) => {
              const m = (a.meta ?? {}) as Record<string, string | null>;
              return (
                <li key={a.id} className="border-l-2 border-black/10 pl-3">
                  <div className="text-[11px] text-ink-400">{fmtDateTime(a.createdAt)} · {a.actorName ?? "Hệ thống"}</div>
                  <div>
                    {a.type === "status_change" && <span className="font-medium">{LEAD_STATUS_VI[m.from as LeadStatus] ?? m.from ?? "?"} → {LEAD_STATUS_VI[m.to as LeadStatus] ?? m.to ?? "?"}</span>}
                    {a.type === "trial_booked" && <span className="font-medium">Hẹn học thử {m.trialAt ? fmtDateTime(m.trialAt) : ""}</span>}
                    {a.type === "assignment" && <span className="font-medium">Phân bổ</span>}
                    {a.type === "call" && <span className="chip bg-sky-100 text-sky-800 mr-1">Gọi</span>}
                    {a.type === "message" && <span className="chip bg-violet-100 text-violet-800 mr-1">Nhắn</span>}
                    {a.type === "task_done" && <span className="chip bg-green-100 text-green-800 mr-1">Xong việc</span>}
                    {a.content && <span className="text-ink-600"> {a.content}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
