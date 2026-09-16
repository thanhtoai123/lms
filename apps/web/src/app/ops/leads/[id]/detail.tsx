"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { leadEventsFor, type LeadEvent } from "@satarobo/core";
import { LeadChip, SlaChip, EVENT_VI, fmtDateTime } from "@/components/lead-ui";

type Cls = { id: string; code: string; name: string; centerCode: string; enrolled: number; capacity: number };

export function LeadDetail({ id, classes, assignees }: { id: string; classes: Cls[]; assignees: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.leads.get.queryOptions({ id }));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"call" | "message" | "note">("call");
  const [trialAt, setTrialAt] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [conv, setConv] = useState({ classId: classes[0]?.id ?? "", packageSessions: 48, status: "active" as "active" | "trial" });

  const refresh = () => { qc.invalidateQueries({ queryKey: trpc.admissions.leads.get.queryKey({ id }) }); qc.invalidateQueries({ queryKey: trpc.admissions.leads.inbox.queryKey() }); };
  const onErr = (e: unknown) => setError((e as Error).message);
  const act = useMutation(trpc.admissions.leads.addActivity.mutationOptions({ onSuccess: () => { setNote(""); setError(null); refresh(); }, onError: onErr }));
  const tr = useMutation(trpc.admissions.leads.transition.mutationOptions({ onSuccess: () => { setError(null); refresh(); }, onError: onErr }));
  const assign = useMutation(trpc.admissions.leads.assign.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const done = useMutation(trpc.admissions.leads.completeTask.mutationOptions({ onSuccess: refresh, onError: onErr }));
  const convert = useMutation(trpc.admissions.leads.convert.mutationOptions({ onSuccess: () => { setError(null); refresh(); }, onError: onErr }));

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy"}</div>;
  const l = q.data;
  const events = leadEventsFor(l.status);
  const busy = act.isPending || tr.isPending || assign.isPending || done.isPending || convert.isPending;

  const doEvent = (event: LeadEvent) => {
    if (event === "schedule_trial" && !trialAt) return setError("Chọn thời gian học thử trước");
    if (event === "lose" && !lostReason) return setError("Nhập lý do mất lead");
    if (event === "enroll") return setError("Dùng khung 'Ghi danh' bên dưới để tạo học viên + đăng ký lớp");
    tr.mutate({ leadId: id, event, trialAt: event === "schedule_trial" ? new Date(trialAt).toISOString() : undefined, lostReason: event === "lose" ? lostReason : undefined });
  };

  return (
    <div className="space-y-4">
      <Link href="/ops/leads" className="text-sm text-ink-600">← Hộp thư lead</Link>

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
        </div>
      </header>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

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
                <select className="input sm:col-span-2" value={conv.classId} onChange={(e) => setConv({ ...conv, classId: e.target.value })}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.enrolled}/{c.capacity})</option>)}
                </select>
                <input type="number" className="input" min={1} value={conv.packageSessions} onChange={(e) => setConv({ ...conv, packageSessions: Number(e.target.value) })} title="Số buổi gói" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm flex items-center gap-1"><input type="radio" checked={conv.status === "active"} onChange={() => setConv({ ...conv, status: "active" })} /> Chính thức</label>
                <label className="text-sm flex items-center gap-1"><input type="radio" checked={conv.status === "trial"} onChange={() => setConv({ ...conv, status: "trial" })} /> Học thử trong lớp</label>
                <button className="btn-primary ml-auto" disabled={busy || !conv.classId} onClick={() => convert.mutate({ leadId: id, classId: conv.classId, packageSessions: conv.packageSessions, status: conv.status })}>{convert.isPending ? "Đang ghi danh…" : "Ghi danh"}</button>
              </div>
            </section>
          )}
          {l.status === "enrolled" && l.convertedStudentId && (
            <section className="card p-4 bg-green-50 border-green-200 text-sm">Đã ghi danh · <Link className="underline font-medium" href={`/ops/classes`}>xem lớp</Link> · mã HV được tạo tự động.</section>
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
                    {a.type === "status_change" && <span className="font-medium">{m.from ?? "?"} → {m.to ?? "?"}</span>}
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
