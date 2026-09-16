"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@satarobo/core";
import { ATT_LABEL, ATT_STYLE, StatusChip, fmtDate, fmtTime } from "@/components/ui";

type Draft = Record<string, { status: AttendanceStatus; remark: string; rating: number | null }>;

/**
 * Một màn hình, ba bước, không rời ngữ cảnh:
 *   1. Điểm danh (chạm để xoay trạng thái, mặc định "có mặt")
 *   2. Nhận xét buổi (bắt buộc) + nhận xét nhanh từng HV (tuỳ chọn)
 *   3. Hoàn tất → trạng thái completed, PH nhận thông báo (worker)
 */
export function SessionWorkflow({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.academics.sessions.get.queryOptions({ id: sessionId }));
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.academics.sessions.get.queryKey({ id: sessionId }) });
    qc.invalidateQueries({ queryKey: trpc.teacher.today.queryKey() });
  };
  const onErr = (e: unknown) => setError((e as Error).message);

  const record = useMutation(trpc.academics.sessions.recordAttendance.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const saveNote = useMutation(trpc.academics.sessions.saveNote.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const transition = useMutation(trpc.academics.sessions.transition.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const saveChecklist = useMutation(trpc.academics.sessions.saveChecklist.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const trialResult = useMutation(trpc.admissions.trials.result.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));

  const s = q.data;
  const roster = s?.roster ?? [];

  const effective = useMemo(() => {
    const m: Draft = {};
    for (const r of roster) {
      m[r.enrollmentId] = draft[r.enrollmentId] ?? { status: (r.attendanceStatus ?? "present") as AttendanceStatus, remark: r.studentRemark ?? "", rating: r.rating ?? null };
    }
    return m;
  }, [roster, draft]);

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải buổi học…</div>;
  if (q.error || !s) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy buổi học"}</div>;

  const cycle = (id: string) => {
    const cur = effective[id]!.status;
    const idx = ATTENDANCE_STATUSES.indexOf(cur);
    const next = ATTENDANCE_STATUSES[(idx + 1) % ATTENDANCE_STATUSES.length]!;
    setDraft((d) => ({ ...d, [id]: { ...effective[id]!, status: next } }));
  };
  const setRemark = (id: string, remark: string) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, remark } }));
  const setRating = (id: string, rating: number) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, rating: effective[id]!.rating === rating ? null : rating } }));
  const toggleCheck = (phase: "pre" | "post", key: string) => {
    const cur = s.checklist ?? {};
    const next = { pre: { ...(cur.pre ?? {}) }, post: { ...(cur.post ?? {}) } };
    next[phase][key] = !next[phase][key];
    saveChecklist.mutate({ sessionId, checklist: next });
  };
  const markAll = (status: AttendanceStatus) => setDraft(Object.fromEntries(roster.map((r) => [r.enrollmentId, { ...effective[r.enrollmentId]!, status }])));

  const submitAttendance = async () => {
    await record.mutateAsync({ sessionId, records: roster.map((r) => ({ enrollmentId: r.enrollmentId, status: effective[r.enrollmentId]!.status, studentRemark: effective[r.enrollmentId]!.remark || null, rating: effective[r.enrollmentId]!.rating })) });
    if (s.status === "scheduled" || s.status === "in_progress") await transition.mutateAsync({ sessionId, event: "submit_attendance" }).catch(onErr);
  };
  const submitNote = async () => {
    const text = (note ?? s.sessionNote ?? "").trim();
    await saveNote.mutateAsync({ sessionId, note: text });
    if (s.status === "attendance_done") await transition.mutateAsync({ sessionId, event: "submit_notes" }).catch(onErr);
  };
  const complete = () => transition.mutate({ sessionId, event: "complete" });
  const reopen = () => transition.mutate({ sessionId, event: "reopen", reason: "GV mở lại để sửa" });

  const busy = record.isPending || saveNote.isPending || transition.isPending || saveChecklist.isPending;
  const isFuture = s.date > s.today;
  const step = s.status === "scheduled" || s.status === "in_progress" ? 1 : s.status === "attendance_done" ? 2 : s.status === "notes_done" ? 3 : 4;
  const present = Object.values(effective).filter((v) => v.status === "present" || v.status === "late" || v.status === "makeup").length;

  return (
    <div className="space-y-4">
      <Link href="/teacher" className="text-sm text-ink-600">← Hôm nay</Link>

      <header className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-400">{fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)} · {s.room?.code ?? "—"}</div>
            <h1 className="font-bold">{s.className}</h1>
            <div className="text-sm text-ink-600">{s.label}{s.lesson?.title ? ` · ${s.lesson.title}` : s.topic ? ` · ${s.topic}` : ""}</div>
            {s.lesson?.isReportCardMilestone && <span className="chip mt-1 bg-violet-100 text-violet-800">Mốc học bạ</span>}
          </div>
          <StatusChip status={s.status} />
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-1 text-[11px] font-semibold">
          {["Điểm danh", "Nhận xét", "Hoàn tất"].map((l, i) => (
            <li key={l} className={`rounded-lg px-2 py-1 text-center ${step > i + 1 ? "bg-green-100 text-green-800" : step === i + 1 ? "bg-brand-100 text-brand-700" : "bg-black/5 text-ink-400"}`}>{i + 1}. {l}</li>
          ))}
        </ol>
        {s.isOverdue && <p className="mt-2 text-xs text-red-700">Buổi này đã qua ngày nhưng chưa hoàn tất — vui lòng chốt.</p>}
        {isFuture && <p className="mt-2 text-xs text-ink-600">Buổi học chưa diễn ra; điểm danh sẽ mở vào ngày học.</p>}
      </header>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* Chuẩn bị trước buổi */}
      <section className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Chuẩn bị trước buổi</h2>
          {s.status === "scheduled" && !isFuture && <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy} onClick={() => transition.mutate({ sessionId, event: "start" })}>Bắt đầu buổi</button>}
          {s.startedAt && <span className="text-xs text-ink-400">bắt đầu {new Date(s.startedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        <ul className="space-y-1">
          {s.checklistTemplate.pre.map((i) => (
            <li key={i.key}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.checklist?.pre?.[i.key]} disabled={busy || s.status === "cancelled"} onChange={() => toggleCheck("pre", i.key)} /> {i.label}</label></li>
          ))}
        </ul>
      </section>

      {/* Bước 1: Điểm danh */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Điểm danh <span className="text-ink-400 font-normal text-sm">({present}/{roster.length} có mặt)</span></h2>
          <div className="flex gap-1">
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => markAll("present")} disabled={busy || s.status === "completed"}>Tất cả có mặt</button>
          </div>
        </div>
        <ul className="divide-y divide-black/5">
          {roster.map((r) => {
            const v = effective[r.enrollmentId]!;
            return (
              <li key={r.enrollmentId} className="py-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => cycle(r.enrollmentId)}
                  disabled={busy || s.status === "completed" || isFuture}
                  className={`shrink-0 w-20 rounded-lg py-2 text-xs font-bold ${ATT_STYLE[v.status]}`}
                  aria-label={`Trạng thái ${r.fullName}: ${ATT_LABEL[v.status]}`}
                >
                  {ATT_LABEL[v.status]}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.fullName}{r.enrollmentStatus === "trial" && <span className="chip ml-1 bg-amber-100 text-amber-800">Trial</span>}</div>
                  <div className="mt-0.5 flex gap-0.5" aria-label="Đánh giá nhanh">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" disabled={s.status === "completed"} onClick={() => setRating(r.enrollmentId, n)} className={`text-sm leading-none ${v.rating && n <= v.rating ? "text-amber-500" : "text-black/15"}`} aria-label={`${n} sao`}>★</button>
                    ))}
                  </div>
                  <input
                    className="mt-1 w-full bg-transparent text-xs text-ink-600 outline-none placeholder:text-ink-400"
                    placeholder="Nhận xét nhanh (tuỳ chọn)…"
                    value={v.remark}
                    onChange={(e) => setRemark(r.enrollmentId, e.target.value)}
                    disabled={s.status === "completed"}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {s.status !== "completed" && (
          <button className="btn-primary w-full" onClick={submitAttendance} disabled={busy || isFuture || roster.length === 0}>
            {record.isPending ? "Đang lưu…" : step === 1 ? "Lưu điểm danh" : "Cập nhật điểm danh"}
          </button>
        )}
      </section>

      {s.trialGuests.length > 0 && (
        <section className="card p-4 space-y-2">
          <h2 className="font-bold">Học thử trong buổi <span className="text-ink-400 font-normal text-sm">({s.trialGuests.length})</span></h2>
          <p className="text-xs text-ink-600">Bé học thử không nằm trong danh sách điểm danh. Ghi nhận bé có đến hay không để tư vấn gọi chốt.</p>
          <ul className="divide-y divide-black/5">
            {s.trialGuests.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{g.childName ?? "Bé học thử"} <span className="chip ml-1 bg-fuchsia-100 text-fuchsia-800">Học thử</span></div>
                  {g.note && <div className="text-xs text-ink-400">{g.note}</div>}
                </div>
                {g.status === "booked" ? (
                  <div className="flex gap-1">
                    <button className="btn-primary !px-2 !py-1 text-xs" disabled={trialResult.isPending || isFuture} onClick={() => trialResult.mutate({ bookingId: g.id, result: "attend" })}>Có đến</button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" disabled={trialResult.isPending || isFuture} onClick={() => trialResult.mutate({ bookingId: g.id, result: "no_show" })}>Không đến</button>
                  </div>
                ) : (
                  <span className={`chip ${g.status === "attended" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{g.status === "attended" ? "Đã học thử" : "Không đến"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bước 2: Nhận xét buổi */}
      <section className={`card p-4 space-y-3 ${step < 2 ? "opacity-60" : ""}`}>
        <h2 className="font-bold">Nhận xét buổi học <span className="text-xs text-ink-400 font-normal">(bắt buộc, PH sẽ đọc)</span></h2>
        <textarea
          className="input min-h-28"
          placeholder="Hôm nay lớp học gì, các con làm được gì, cần PH hỗ trợ gì…"
          value={note ?? s.sessionNote ?? ""}
          onChange={(e) => setNote(e.target.value)}
          disabled={step < 2 || s.status === "completed"}
        />
        {s.status !== "completed" && (
          <button className="btn-primary w-full" onClick={submitNote} disabled={busy || step < 2 || (note ?? s.sessionNote ?? "").trim().length < 10}>
            {saveNote.isPending ? "Đang lưu…" : "Lưu nhận xét"}
          </button>
        )}
      </section>

      {/* Quy trình sau buổi */}
      <section className="card p-4 space-y-2">
        <h2 className="font-bold">Quy trình sau buổi <span className="text-xs font-normal text-ink-400">(mục * bắt buộc trước khi hoàn tất)</span></h2>
        <ul className="space-y-1">
          {s.checklistTemplate.post.map((i) => (
            <li key={i.key}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.checklist?.post?.[i.key]} disabled={busy || s.status === "cancelled"} onChange={() => toggleCheck("post", i.key)} /> {i.label}{i.required && <span className="text-red-600">*</span>}</label></li>
          ))}
        </ul>
        <PrivateNote initial={s.privateNote ?? ""} disabled={busy} onSave={(t) => saveChecklist.mutate({ sessionId, checklist: s.checklist ?? {}, privateNote: t || null })} />
      </section>

      {/* Bước 3: Hoàn tất */}
      <section className={`card p-4 space-y-3 ${step < 3 ? "opacity-60" : ""}`}>
        <h2 className="font-bold">Hoàn tất buổi học</h2>
        <p className="text-sm text-ink-600">Sau khi hoàn tất, phụ huynh nhận thông báo điểm danh + nhận xét; buổi được tính vào gói học.</p>
        {s.status !== "completed" && s.checklistMissing.length > 0 && <p className="text-xs text-amber-800">Còn {s.checklistMissing.length} mục bắt buộc trong “Quy trình sau buổi”.</p>}
        {s.status === "completed" ? (
          <div className="flex items-center justify-between">
            <span className="chip bg-green-100 text-green-800">Đã hoàn tất</span>
            <button className="btn-ghost text-xs" onClick={reopen} disabled={busy}>Mở lại để sửa</button>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={complete} disabled={busy || step < 3 || s.checklistMissing.length > 0}>
            {transition.isPending ? "Đang chốt…" : "Hoàn tất buổi học ✓"}
          </button>
        )}
      </section>
    </div>
  );
}

function PrivateNote({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (t: string) => void }) {
  const [t, setT] = useState(initial);
  return (
    <div className="space-y-1 pt-2">
      <label className="label">Ghi chú nội bộ (phụ huynh không thấy)</label>
      <textarea className="input min-h-16" maxLength={2000} value={t} onChange={(e) => setT(e.target.value)} placeholder="Thiếu 2 bộ pin, bé A cần hỗ trợ thêm…" />
      <button type="button" className="btn-ghost !py-1 text-xs" disabled={disabled || t === initial} onClick={() => onSave(t.trim())}>Lưu ghi chú</button>
    </div>
  );
}
