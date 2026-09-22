"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { TRIAL_STATUS_VI, LEAD_STATUS_VI, type TrialStatus, type LeadStatus } from "@satarobo/core";
import { Empty } from "@/components/ui";
import { SlotPicker, fmtDay } from "./book";
import { TrialReportButton } from "@/components/trial-report/drawer";

type Item = {
  id: string; status: TrialStatus; childName: string | null; note: string | null; reason: string | null; resultNote: string | null; rescheduledFromId: string | null;
  leadId: string; parentName: string; leadStatus: LeadStatus; assigneeName: string | null; bookedByName: string | null;
  sessionId: string; date: string; startTime: string; endTime: string; sequenceNo: number;
  classId: string; classCode: string; centerCode: string; courseCode: string; teacherName: string | null; roomCode: string | null;
  canRecord: boolean; needsResult: boolean;
};

const CHIP: Record<TrialStatus, string> = {
  booked: "bg-sky-100 text-sky-800",
  attended: "bg-green-100 text-green-800",
  no_show: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
  rescheduled: "bg-amber-100 text-amber-800",
};

type Mode = { id: string; kind: "reschedule" | "cancel" | "result" | "undo" } | null;

export function TrialBoard({ items, today, openReport }: { items: Item[]; today: string; centers: { id: string; code: string }[]; /** Mở sẵn phiếu đánh giá của lượt thử này (link từ "Việc hôm nay") */ openReport?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [newSession, setNewSession] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const done = (text: string) => { setMsg({ ok: true, text }); setMode(null); setReason(""); setNewSession(null); router.refresh(); };
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const reschedule = useMutation(trpc.admissions.trials.reschedule.mutationOptions({ onSuccess: () => done("Đã đổi lịch học thử và báo giáo viên."), onError }));
  const cancel = useMutation(trpc.admissions.trials.cancel.mutationOptions({ onSuccess: () => done("Đã huỷ lượt học thử."), onError }));
  const result = useMutation(trpc.admissions.trials.result.mutationOptions({ onSuccess: (r) => done(r.status === "attended" ? "Đã ghi nhận học thử — việc 'Gọi chốt sau học thử' được tạo cho tư vấn." : "Đã ghi nhận không đến."), onError }));
  const undo = useMutation(trpc.admissions.trials.undo.mutationOptions({ onSuccess: () => done("Đã hoàn tác kết quả."), onError }));
  const busy = reschedule.isPending || cancel.isPending || result.isPending || undo.isPending;

  const open = (id: string, kind: NonNullable<Mode>["kind"]) => { setMode({ id, kind }); setReason(""); setNewSession(null); setMsg(null); };

  if (items.length === 0) return <Empty>Không có lượt học thử nào trong khoảng đã chọn.</Empty>;

  const days = [...new Set(items.map((i) => i.date))];
  return (
    <div className="space-y-3">
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      {days.map((day) => (
        <section key={day} className="card overflow-hidden">
          <h3 className={`border-b border-black/5 px-4 py-2 text-sm font-semibold ${day === today ? "bg-brand-50 text-brand-700" : day < today ? "text-ink-600" : ""}`}>
            {fmtDay(day)}{day === today ? " · Hôm nay" : ""}
          </h3>
          <ul className="divide-y divide-black/5">
            {items.filter((i) => i.date === day).map((t) => (
              <li key={t.id} className={`p-3 ${t.needsResult ? "bg-red-50/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm">
                      <span className="font-mono text-xs text-ink-400">{t.startTime.slice(0, 5)}–{t.endTime.slice(0, 5)}</span>{" "}
                      <b>{t.childName ?? "Bé học thử"}</b>{" "}
                      <span className="text-ink-600">· PH <Link href={`/leads/${t.leadId}`} className="text-brand-600 hover:underline">{t.parentName}</Link></span>{" "}
                      <span className={`chip ${CHIP[t.status]}`}>{TRIAL_STATUS_VI[t.status]}</span>
                      {t.needsResult && <span className="chip ml-1 bg-red-100 text-red-700">Chưa ghi kết quả</span>}
                    </div>
                    <div className="text-xs text-ink-600">
                      <Link href={`/lich?date=${t.date}`} className="font-mono hover:underline">{t.classCode}</Link> · buổi {t.sequenceNo} · {t.centerCode} · {t.courseCode} · GV {t.teacherName ?? "—"}{t.roomCode ? ` · ${t.roomCode}` : ""}
                    </div>
                    <div className="text-xs text-ink-400">
                      Lead: {LEAD_STATUS_VI[t.leadStatus]} · tư vấn {t.assigneeName ?? "—"} · xếp bởi {t.bookedByName ?? "—"}
                      {t.rescheduledFromId && " · (đổi lịch từ buổi khác)"}
                    </div>
                    {t.note && <div className="text-xs text-ink-600">Ghi chú: {t.note}</div>}
                    {t.reason && <div className="text-xs text-amber-800">Lý do: {t.reason}</div>}
                    {t.resultNote && <div className="text-xs text-ink-600">Kết quả: {t.resultNote}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.status === "booked" && t.canRecord && <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy} onClick={() => open(t.id, "result")}>Ghi kết quả</button>}
                    {t.status === "booked" && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => open(t.id, "reschedule")}>Đổi lịch</button>}
                    {t.status === "booked" && <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={busy} onClick={() => open(t.id, "cancel")}>Huỷ</button>}
                    {t.status === "attended" && <TrialReportButton source={{ trialBookingId: t.id }} autoOpen={openReport === t.id} onChanged={() => router.refresh()} />}
                    {(t.status === "attended" || t.status === "no_show") && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => open(t.id, "undo")}>Hoàn tác</button>}
                  </div>
                </div>

                {mode?.id === t.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-black/10 bg-white p-3">
                    {mode.kind === "result" && (
                      <>
                        <label className="label">Nhận xét buổi thử (tuỳ chọn — tư vấn sẽ dùng khi gọi chốt)</label>
                        <input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bé hào hứng, lắp xong mô hình…" />
                        <div className="flex gap-2">
                          <button className="btn-primary" disabled={busy} onClick={() => result.mutate({ bookingId: t.id, result: "attend", note: reason.trim() || null })}>Bé đã đến học</button>
                          <button className="btn-ghost text-red-700" disabled={busy} onClick={() => result.mutate({ bookingId: t.id, result: "no_show", note: reason.trim() || null })}>Không đến</button>
                          <button className="btn-ghost" onClick={() => setMode(null)}>Thôi</button>
                        </div>
                      </>
                    )}
                    {mode.kind === "reschedule" && (
                      <>
                        <div className="label">Chọn buổi mới</div>
                        <SlotPicker leadId={t.leadId} excludeSessionId={t.sessionId} selected={newSession} onSelect={setNewSession} />
                        <label className="label">Lý do đổi lịch (bắt buộc, GV sẽ thấy)</label>
                        <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="PH bận đột xuất…" />
                        <div className="flex gap-2">
                          <button className="btn-primary" disabled={busy || !newSession || reason.trim().length < 5} onClick={() => newSession && reschedule.mutate({ bookingId: t.id, newSessionId: newSession, reason: reason.trim() })}>Đổi lịch</button>
                          <button className="btn-ghost" onClick={() => setMode(null)}>Thôi</button>
                        </div>
                      </>
                    )}
                    {(mode.kind === "cancel" || mode.kind === "undo") && (
                      <>
                        <label className="label">{mode.kind === "cancel" ? "Lý do huỷ (bắt buộc)" : "Lý do hoàn tác (bắt buộc)"}</label>
                        <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode.kind === "cancel" ? "PH không sắp xếp được thời gian…" : "Ghi nhầm bé…"} />
                        <div className="flex gap-2">
                          <button className={mode.kind === "cancel" ? "btn-primary !bg-red-600" : "btn-primary"} disabled={busy || reason.trim().length < 5} onClick={() => (mode.kind === "cancel" ? cancel.mutate({ bookingId: t.id, reason: reason.trim() }) : undo.mutate({ bookingId: t.id, reason: reason.trim() }))}>
                            {mode.kind === "cancel" ? "Huỷ lượt học thử" : "Hoàn tác"}
                          </button>
                          <button className="btn-ghost" onClick={() => setMode(null)}>Thôi</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
