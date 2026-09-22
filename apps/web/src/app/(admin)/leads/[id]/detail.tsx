"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LEAD_STATUS_VI, OPEN_LEAD_STATUSES, DISTRIBUTION_MODE_VI, HANDOVER_NOTE_MIN, LEAD_SHARE_LABEL, type LeadStatus } from "@satarobo/core";
import { LeadChip, SlaChip, ACTIVITY_VI, fmtDateTime, fmtDay } from "@/components/lead-ui";
import { LeadStatusSelect, LeadDeleteButton } from "@/components/lead-status";
import { OrderChip, vnd } from "@/components/finance-ui";
import { LeadChildrenBlock } from "./children";
import { LeadTrialClassesBlock } from "./trial-classes";
import { LeadTrialReportsBlock } from "@/components/trial-report/lead-block";

type Center = { id: string; code: string; name: string };
type Assignee = { id: string; fullName: string; centerId: string | null };
type Course = { id: string; code: string; name: string };
type ActType = "call" | "message" | "note" | "email";

export function LeadDetail({ id, assignees, centers, courses }: { id: string; assignees: Assignee[]; centers: Center[]; courses: Course[] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery(trpc.admissions.leads.get.queryOptions({ id }));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [act, setAct] = useState<{ type: ActType; content: string; caller: string; durationMin: string; platform: "Zalo" | "SMS" | "Messenger"; to: string; subject: string }>({ type: "call", content: "", caller: "", durationMin: "", platform: "Zalo", to: "", subject: "" });
  const [panel, setPanel] = useState<"transfer" | "redistribute" | null>(null);
  const [xfer, setXfer] = useState({ toCenterId: "", toUserId: "", handoverNote: "", reason: "" });
  const [redis, setRedis] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: trpc.admissions.leads.get.queryKey({ id }) });
    qc.invalidateQueries({ queryKey: trpc.admissions.leads.inbox.queryKey() });
  };
  const onErr = (e: { message: string }) => { setNotice(null); setError(e.message); };
  const ok = (text: string) => { setError(null); setNotice(text); refresh(); };
  const addAct = useMutation(trpc.admissions.leads.addActivity.mutationOptions({ onSuccess: () => { setAct((a) => ({ ...a, content: "", durationMin: "", subject: "" })); ok("Đã ghi hoạt động"); }, onError: onErr }));
  const setShared = useMutation(trpc.admissions.leads.setShared.mutationOptions({ onSuccess: (r) => ok(r.notice), onError: onErr }));
  const assign = useMutation(trpc.admissions.leads.assign.mutationOptions({ onSuccess: () => ok("Đã gán lead"), onError: onErr }));
  const done = useMutation(trpc.admissions.leads.completeTask.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const transfer = useMutation(trpc.admissions.leads.transfer.mutationOptions({
    onSuccess: (r) => { setPanel(null); setXfer({ toCenterId: "", toUserId: "", handoverNote: "", reason: "" }); ok(r.centerChanged ? (r.toUserId ? "Đã chuyển lead sang cơ sở khác và bàn giao cho sale nhận." : "Đã chuyển lead sang cơ sở khác — chưa có sale nhận, lead vào pool của cơ sở.") : "Đã bàn giao lead."); },
    onError: onErr,
  }));
  const redistribute = useMutation(trpc.admissions.leads.redistribute.mutationOptions({
    onSuccess: (r) => { setPanel(null); setRedis(""); ok(`Đã chia lại lead theo cấu hình cơ sở${r.assigneeName ? ` — giao cho ${r.assigneeName}` : ""}`); },
    onError: onErr,
  }));

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy"}</div>;
  const l = q.data;
  const busy = addAct.isPending || assign.isPending || done.isPending || transfer.isPending || redistribute.isPending || setShared.isPending;
  const isOpen = (OPEN_LEAD_STATUSES as readonly LeadStatus[]).includes(l.status);
  const openChildren = l.children.filter((c) => !c.convertedStudentId);
  const canConvert = l.perms.convert && l.status !== "lost" && (l.status !== "enrolled" || openChildren.length > 0);
  const pay = l.payment;
  const headerAssignees = [...new Map(assignees.map((a) => [a.id, a] as const)).values()];
  const targetCenter = xfer.toCenterId || l.centerId;
  const receivers = [...new Map(assignees.filter((a) => a.centerId === null || a.centerId === targetCenter).map((a) => [a.id, a] as const)).values()];
  const phoneFull = !/x/i.test(l.phone);

  const submitActivity = () => {
    const meta = act.type === "call" ? { caller: act.caller.trim() || null, durationMin: act.durationMin ? Number(act.durationMin) : null }
      : act.type === "message" ? { platform: act.platform }
      : act.type === "email" ? { to: act.to.trim() || null, subject: act.subject.trim() || null }
      : null;
    addAct.mutate({ leadId: id, type: act.type, content: act.content.trim(), meta });
  };

  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-ink-600">← Danh sách lead</Link>

      <header className="card flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold">
            {l.parentName}{" "}
            {phoneFull ? <a href={`tel:${l.phone}`} className="ml-2 font-mono text-sm text-ink-600 hover:underline">{l.phone}</a> : <span className="ml-2 font-mono text-sm text-ink-600">{l.phone}</span>}
          </h1>
          <div className="text-sm text-ink-600">{l.childName ?? "Chưa có tên con"}{l.childGrade ? ` · lớp ${l.childGrade}` : ""}{l.school ? ` · ${l.school}` : ""}{l.email ? ` · ${l.email}` : ""}</div>
          <div className="text-xs text-ink-400">
            Nguồn: {l.source ?? "—"}{l.utmCampaign ? ` · ${l.utmCampaign}` : ""} · {l.course?.code ?? "chưa rõ khoá"} · {l.center?.code ?? "chưa rõ cơ sở"} · sale: {l.assignee?.fullName ?? "chưa phân công"}
          </div>
          <div className="text-xs text-ink-400">
            Nhận lead: {fmtDateTime(l.createdAt)}
            {l.reentryCount > 0 && <span className="ml-1 chip bg-amber-100 text-amber-800">nhập lại {l.reentryCount} lần{l.lastReentryAt ? ` · gần nhất ${fmtDateTime(l.lastReentryAt)}` : ""}</span>}
            {l.creator && <> · nhân viên nhập: {l.creator.fullName}</>}
            {l.facebookUrl && <> · <a href={/^https?:\/\//i.test(l.facebookUrl) ? l.facebookUrl : `https://${l.facebookUrl}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Facebook</a></>}
          </div>
          {l.dropReason && (l.status === "lost" || l.status === "nurturing") && <div className="text-xs text-red-700">Lý do rời phễu: {l.dropReason}{l.droppedAt ? ` (${fmtDay(l.droppedAt)})` : ""}</div>}
          {l.notes && <div className="whitespace-pre-line pt-1 text-xs text-ink-600">{l.notes}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <LeadChip status={l.status} />
            <SlaChip sla={l.sla} />
            {l.sharedWithCenter && <span className="chip bg-sky-100 text-sky-800">{LEAD_SHARE_LABEL.chip}</span>}
          </div>
          {/* Lead dùng chung: mọi CSKH cùng cơ sở thấy được lead này */}
          {l.perms.share && (
            <label className="flex items-center gap-2 text-xs text-ink-600" title="Bật để người trực cùng cơ sở trả lời khách thay bạn khi bạn bận">
              <input type="checkbox" checked={l.sharedWithCenter} disabled={busy} onChange={(e) => setShared.mutate({ leadId: id, shared: e.target.checked })} />
              {LEAD_SHARE_LABEL.toggle}
            </label>
          )}
          {l.sharedWithCenter && l.visibility === "owner" && <span className="text-[11px] text-sky-700">{LEAD_SHARE_LABEL.mineShared}</span>}
          {!l.sharedWithCenter && !l.perms.share && l.visibility === "shared" && <span className="text-[11px] text-ink-400">{LEAD_SHARE_LABEL.off}</span>}
          <div className="flex flex-wrap justify-end gap-2">
            {l.perms.update && <LeadStatusSelect leadId={id} status={l.status} onDone={() => ok("Đã đổi trạng thái")} />}
            {l.perms.update && <Link href={`/leads/${id}/edit`} className="btn-ghost !py-1.5 text-xs">Sửa</Link>}
          </div>
          {l.perms.assign && (
            <select className="input !w-auto text-xs" value={l.assignedToId ?? ""} onChange={(e) => assign.mutate({ leadId: id, assigneeId: e.target.value || null })} disabled={busy} title="Gán cho sale (không tiêu lượt)">
              <option value="">— Gán cho… —</option>
              {headerAssignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select>
          )}
          <div className="flex flex-wrap justify-end gap-3 text-xs">
            {l.perms.assign && l.status !== "enrolled" && <button type="button" className="text-ink-600 underline" onClick={() => setPanel(panel === "transfer" ? null : "transfer")}>Chuyển lead</button>}
            {l.perms.assign && isOpen && !l.convertedAt && l.distributionMode !== "manual" && <button type="button" className="text-ink-600 underline" onClick={() => setPanel(panel === "redistribute" ? null : "redistribute")}>Chia lại lead</button>}
            {l.perms.delete && l.status !== "enrolled" && !l.convertedAt && <LeadDeleteButton leadId={id} name={l.parentName} onDeleted={() => router.push("/leads")} />}
          </div>
        </div>
      </header>

      {panel === "transfer" && (
        <form className="card grid gap-2 border-amber-300 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); transfer.mutate({ leadId: id, toCenterId: xfer.toCenterId || null, toUserId: xfer.toUserId || null, handoverNote: xfer.handoverNote, reason: xfer.reason || null }); }}>
          <h2 className="font-semibold sm:col-span-2">Chuyển lead</h2>
          <label className="text-xs text-ink-600">Cơ sở đích
            <select className="input mt-1" value={xfer.toCenterId} onChange={(e) => setXfer({ ...xfer, toCenterId: e.target.value, toUserId: "" })}>
              <option value="">— Giữ nguyên ({l.center?.code ?? "chưa rõ"}) —</option>
              {centers.filter((c) => c.id !== l.centerId).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Sale nhận
            <select className="input mt-1" value={xfer.toUserId} onChange={(e) => setXfer({ ...xfer, toUserId: e.target.value })}>
              <option value="">{xfer.toCenterId ? "— Để hệ thống chia theo cơ sở đích —" : "— Chọn sale —"}</option>
              {receivers.map((a) => <option key={a.id} value={a.id} disabled={a.id === l.assignedToId}>{a.fullName}{a.id === l.assignedToId ? " (đang phụ trách)" : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600 sm:col-span-2">Note bàn giao — đã tư vấn gì cho KH *
            <textarea className="input mt-1 min-h-20" required minLength={HANDOVER_NOTE_MIN} maxLength={2000} value={xfer.handoverNote} onChange={(e) => setXfer({ ...xfer, handoverNote: e.target.value })} placeholder="Tóm tắt nội dung đã tư vấn để sale mới không hỏi lại…" />
          </label>
          <label className="text-xs text-ink-600 sm:col-span-2">Lý do chuyển (tuỳ chọn)
            <input className="input mt-1" maxLength={300} value={xfer.reason} onChange={(e) => setXfer({ ...xfer, reason: e.target.value })} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-ghost" onClick={() => setPanel(null)}>Huỷ</button>
            <button className="btn-primary" disabled={busy || xfer.handoverNote.trim().length < HANDOVER_NOTE_MIN}>Chuyển lead</button>
          </div>
        </form>
      )}
      {panel === "redistribute" && (
        <form className="card flex flex-wrap items-end gap-2 border-amber-300 p-4" onSubmit={(e) => { e.preventDefault(); redistribute.mutate({ leadId: id, reason: redis }); }}>
          <label className="min-w-64 flex-1 text-xs text-ink-600">Chia lại theo cấu hình cơ sở ({DISTRIBUTION_MODE_VI[l.distributionMode]}) — bỏ qua sale đang giữ. Lý do *
            <input className="input mt-1" required minLength={3} maxLength={300} value={redis} onChange={(e) => setRedis(e.target.value)} placeholder="VD: sale nghỉ phép dài ngày" />
          </label>
          <button type="button" className="btn-ghost" onClick={() => setPanel(null)}>Huỷ</button>
          <button className="btn-primary" disabled={busy || redis.trim().length < 3}>Chia lại lead</button>
        </form>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="flex justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"><span>{notice}</span><button className="text-xs underline" onClick={() => setNotice(null)}>Đóng</button></div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {l.tasks.filter((t) => !t.doneAt).length > 0 && (
            <section className="card space-y-2 p-4">
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

          {/* Thanh toán — điều kiện chốt */}
          <section className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Thanh toán</h2>
              {l.perms.createOrder && l.status !== "lost" && <Link href={`/orders/new?leadId=${id}`} className="text-sm font-semibold text-brand-600 hover:underline">+ Tạo đơn hàng cho lead này</Link>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-black/[0.03] p-3"><div className="text-xs text-ink-400">Đã nộp</div><div className="text-lg font-bold tabular-nums text-green-700">{vnd(pay.paid)}</div>{pay.recorded > 0 && <div className="text-[11px] text-amber-700">{vnd(pay.recorded)} chờ kế toán</div>}</div>
              <div className="rounded-xl bg-black/[0.03] p-3"><div className="text-xs text-ink-400">Tổng phải thu</div><div className="text-lg font-bold tabular-nums">{vnd(pay.total)}</div></div>
              <div className="rounded-xl bg-black/[0.03] p-3"><div className="text-xs text-ink-400">Còn thiếu</div><div className={`text-lg font-bold tabular-nums ${pay.outstanding ? "text-red-700" : ""}`}>{vnd(pay.outstanding)}</div></div>
            </div>
            {pay.orders.length === 0 ? <p className="text-sm text-ink-400">Chưa có đơn hàng</p> : (
              <ul className="divide-y divide-black/5 text-sm">
                {pay.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <Link href={`/orders/${o.id}`} className="font-mono font-semibold text-brand-600">{o.code}</Link>
                    <span className="text-xs text-ink-600">{vnd(o.total)} · đã ghi nhận {vnd(o.recorded)} · KT xác nhận {vnd(o.confirmed)}</span>
                    <OrderChip status={o.status} />
                  </li>
                ))}
              </ul>
            )}
            {canConvert && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3">
                {pay.gate ? (
                  <>
                    <div className="text-sm font-medium text-amber-800">⚠ {pay.gate}</div>
                    <div className="flex items-center gap-3">
                      <Link href={`/leads/${id}/convert?hocbong=1`} className="text-xs text-ink-600 underline" title="Chỉ khi mọi học viên được học bổng toàn phần (đơn 0đ)">Chốt học bổng toàn phần</Link>
                      <button type="button" className="btn-primary" disabled title={pay.gate}>Chuyển đổi</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-green-800">Đủ điều kiện chốt{openChildren.length ? ` · ${openChildren.length} con chưa chốt` : ""}.</div>
                    <Link href={`/leads/${id}/convert`} className="btn-primary">Chuyển đổi</Link>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Nguồn & theo dõi — chỉ có khi lead vào từ form công khai */}
          {l.tracking.hasAny && (
            <section className="card space-y-2 p-4">
              <h2 className="font-bold">Nguồn &amp; theo dõi <span className="text-xs font-normal text-ink-400">(lead vào từ form công khai)</span></h2>
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[150px_1fr]">
                <Track label="Chiến dịch" value={[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(" · ") || null} />
                <Track label="Trang đích" value={l.tracking.landingPage} link />
                <Track label="Từ trang" value={l.tracking.referrer} link />
                <Track label="Id sự kiện QC" value={l.tracking.eventId} mono />
                <Track label="Địa chỉ IP" value={l.tracking.ipAddress} mono note={l.tracking.ipMasked ? "che — cần quyền xem PII" : null} />
                <Track label="Trình duyệt" value={l.tracking.userAgent} />
              </dl>
            </section>
          )}

          <LeadChildrenBlock leadId={id} legacyChildName={l.childName} legacyGrade={l.childGrade} items={l.children} courses={courses} centers={centers} canEdit={l.perms.update && l.status !== "lost"} onChanged={refresh} />
          {isOpen && <LeadTrialClassesBlock leadId={id} legacyChildName={l.childName} onChanged={refresh} />}
          <LeadTrialReportsBlock leadId={id} kids={l.children.map((c) => ({ id: c.id, fullName: c.fullName }))} canCreate={l.perms.update && l.status !== "lost"} />
          {isOpen && <p className="px-1 text-xs text-ink-600">Muốn xếp bé vào một buổi học lẻ của lớp chính quy (có kiểm tra chỗ trống, báo GV)? <Link href={`/lop-trial/buoi-le?lead=${id}`} className="font-semibold text-brand-600 hover:underline">Xếp học thử buổi lẻ →</Link></p>}

          {/* Ghi nhanh hoạt động */}
          {l.perms.update && (
            <section className="card space-y-2 p-4">
              <h2 className="font-bold">Ghi nhanh hoạt động <span className="text-xs font-normal text-ink-400">(reset SLA)</span></h2>
              <div className="flex flex-wrap gap-2">
                {(["call", "message", "note", "email"] as const).map((t) => (
                  <button key={t} type="button" className={`chip cursor-pointer ${act.type === t ? "bg-brand-500 text-white" : "bg-black/5"}`} onClick={() => setAct({ ...act, type: t })}>{ACTIVITY_VI[t]!.label}</button>
                ))}
              </div>
              {act.type === "call" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder="Người gọi" value={act.caller} onChange={(e) => setAct({ ...act, caller: e.target.value })} maxLength={120} />
                  <input className="input" type="number" min={0} max={600} placeholder="Thời lượng (phút)" value={act.durationMin} onChange={(e) => setAct({ ...act, durationMin: e.target.value })} />
                </div>
              )}
              {act.type === "message" && (
                <select className="input max-w-xs" value={act.platform} onChange={(e) => setAct({ ...act, platform: e.target.value as "Zalo" | "SMS" | "Messenger" })}>
                  {(["Zalo", "SMS", "Messenger"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {act.type === "email" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" type="email" placeholder="Người nhận (email)" value={act.to} onChange={(e) => setAct({ ...act, to: e.target.value })} />
                  <input className="input" placeholder="Tiêu đề" value={act.subject} onChange={(e) => setAct({ ...act, subject: e.target.value })} maxLength={200} />
                </div>
              )}
              <textarea
                className="input min-h-20"
                placeholder={act.type === "call" ? "Nội dung trao đổi…" : act.type === "message" ? "Nội dung tin nhắn…" : act.type === "email" ? "Nội dung email…" : "Ghi chú…"}
                value={act.content}
                maxLength={2000}
                onChange={(e) => setAct({ ...act, content: e.target.value })}
              />
              <button className="btn-primary" disabled={busy || act.content.trim().length === 0} onClick={submitActivity}>Ghi hoạt động</button>
            </section>
          )}

          {l.status === "enrolled" && l.convertedStudentId && openChildren.length === 0 && (
            <section className="card border-green-200 bg-green-50 p-4 text-sm">Đã đăng ký · <Link className="font-medium underline" href={`/students/${l.convertedStudentId}`}>xem học viên</Link>{l.convertedAt ? ` · chốt ${fmtDay(l.convertedAt)}` : ""}</section>
          )}
        </div>

        <aside className="card p-4">
          <h2 className="mb-2 font-bold">Lịch sử tương tác <span className="text-xs font-normal text-ink-400">({l.activities.length})</span></h2>
          <ol className="space-y-3 text-sm">
            {l.activities.map((a) => {
              const m = (a.meta ?? {}) as Record<string, string | number | boolean | null>;
              const t = ACTIVITY_VI[a.type] ?? { label: a.type, chip: "bg-black/5" };
              return (
                <li key={a.id} className="border-l-2 border-black/10 pl-3">
                  <div className="text-[11px] text-ink-400">{fmtDateTime(a.createdAt)} · {a.actorName ?? "Hệ thống"}</div>
                  <div>
                    <span className={`chip mr-1 ${t.chip}`}>{t.label}</span>
                    {a.type === "status_change" && m.from && m.to && <span className="font-medium">{LEAD_STATUS_VI[m.from as LeadStatus] ?? m.from} → {LEAD_STATUS_VI[m.to as LeadStatus] ?? m.to} </span>}
                    {a.type === "trial_booked" && m.trialAt && <span className="font-medium">{fmtDateTime(String(m.trialAt))} </span>}
                    {a.type === "call" && (m.caller || m.durationMin) ? <span className="text-xs text-ink-400">{[m.caller, m.durationMin ? `${m.durationMin} phút` : null].filter(Boolean).join(" · ")} </span> : null}
                    {a.type === "message" && m.platform ? <span className="text-xs text-ink-400">{m.platform} </span> : null}
                    {a.type === "email" && (m.to || m.subject) ? <span className="text-xs text-ink-400">{[m.to, m.subject].filter(Boolean).join(" · ")} </span> : null}
                    {a.content && <span className="whitespace-pre-line text-ink-600">{a.content}</span>}
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

/** Một dòng trong khối "Nguồn & theo dõi" — bỏ qua khi không có dữ liệu */
function Track({ label, value, link, mono, note }: { label: string; value: string | null; link?: boolean; mono?: boolean; note?: string | null }) {
  if (!value) return null;
  const cls = `min-w-0 break-words ${mono ? "font-mono text-xs" : ""}`;
  return (
    <>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className={cls}>
        {link && /^https?:\/\//i.test(value)
          ? <a href={value} target="_blank" rel="noreferrer nofollow" className="text-brand-600 hover:underline">{value}</a>
          : value}
        {note && <span className="ml-2 text-[11px] text-ink-400">{note}</span>}
      </dd>
    </>
  );
}
