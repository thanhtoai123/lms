"use client";

import { useEffect, useMemo, useState } from "react";
import { enqueueAttendance, isNetworkError, saveLocal, loadLocal, dropLocal, queued, QUEUE_EVENT } from "@/lib/offline-queue";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@satarobo/core";
import { ATT_LABEL, ATT_STYLE, StatusChip, fmtDate, fmtTime } from "@/components/ui";
import { EvaluationPanel, type Form as EvalForm } from "@/components/portfolio/evaluation-panel";
import { SessionTodo } from "@/components/portfolio/session-todo";

type Draft = Record<string, { status: AttendanceStatus; remark: string; rating: number | null; needsMakeup: boolean | null; absenceReason: string }>;

const isAbsent = (s: AttendanceStatus) => s === "absent_excused" || s === "absent_unexcused";

/**
 * Một màn hình, ba bước, không rời ngữ cảnh (đầu trang: khối "Buổi này cần hoàn thiện" — bài học, tiêu chí + mô tả 4 mức,
 * danh mục việc cần xong theo chuẩn hồ sơ học tập; bấm một dòng để cuộn tới đúng học viên):
 *   1. Điểm danh (chạm để xoay trạng thái, mặc định "có mặt")
 *   2. Nhận xét buổi (bắt buộc) + PHIẾU NHẬN XÉT từng HV có mặt (rubric 4 mức, tự lưu nháp)
 *   3. Hoàn tất → trạng thái completed, phiếu nhận xét được phát hành cùng lúc, PH nhận thông báo (worker)
 */
export function SessionWorkflow({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.academics.sessions.get.queryOptions({ id: sessionId }));
  const [draft, setDraftState] = useState<Draft>({});
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [cached, setCached] = useState<typeof q.data | null>(null);
  const setDraft = (u: Draft | ((d: Draft) => Draft)) => setDraftState((d) => {
    const next = typeof u === "function" ? u(d) : u;
    saveLocal(`draft:${sessionId}`, next);
    return next;
  });
  useEffect(() => {
    const d = loadLocal<Draft>(`draft:${sessionId}`);
    if (d) setDraftState(d);
    setCached(loadLocal<NonNullable<typeof q.data>>(`session:${sessionId}`));
    const sync = () => setOfflineSaved(queued().some((x) => x.sessionId === sessionId));
    sync();
    window.addEventListener(QUEUE_EVENT, sync);
    return () => window.removeEventListener(QUEUE_EVENT, sync);
  }, [sessionId]);
  useEffect(() => { if (q.data) saveLocal(`session:${sessionId}`, q.data); }, [q.data, sessionId]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.academics.sessions.get.queryKey({ id: sessionId }) });
    qc.invalidateQueries({ queryKey: trpc.teacher.today.queryKey() });
    qc.invalidateQueries({ queryKey: trpc.academics.evaluations.board.queryKey({ sessionId }) });
  };
  const onErr = (e: unknown) => setError((e as Error).message);

  const record = useMutation(trpc.academics.sessions.recordAttendance.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const saveNote = useMutation(trpc.academics.sessions.saveNote.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const transition = useMutation(trpc.academics.sessions.transition.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const saveChecklist = useMutation(trpc.academics.sessions.saveChecklist.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const confirmLesson = useMutation(trpc.academics.sessions.confirmLesson.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  const trialResult = useMutation(trpc.admissions.trials.result.mutationOptions({ onSuccess: () => { setError(null); invalidate(); }, onError: onErr }));
  // Phiếu nhận xét buổi quản lý ô nhận xét của HV có mặt (không nhập hai lần) — dùng chung bộ nhớ đệm với khối phiếu
  const evalBoard = useQuery({ ...trpc.academics.evaluations.board.queryOptions({ sessionId }), retry: false });
  const evalManaged = !!evalBoard.data?.canWrite;
  // Nội dung phiếu đang hiển thị (kể cả chưa lưu) — khối "Buổi này cần hoàn thiện" tự tính theo đó
  const [liveForms, setLiveForms] = useState<Record<string, EvalForm>>({});
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const onJump = (target: "attendance" | "sheet" | "note", id: string | null) => {
    if (target === "sheet" && id) { setJump({ id, n: Date.now() }); return; }
    const elId = target === "attendance" ? (id ? `dd-${id}` : "diem-danh") : target === "note" ? "nhan-xet-buoi" : "phieu-nhan-xet";
    try { document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* trình duyệt cũ */ }
  };

  const s = q.data ?? (q.isError && cached ? cached : undefined);
  const offlineView = !q.data && !!s;
  const roster = s?.roster ?? [];

  const effective = useMemo(() => {
    const m: Draft = {};
    for (const r of roster) {
      m[r.enrollmentId] = draft[r.enrollmentId] ?? {
        status: (r.attendanceStatus ?? "present") as AttendanceStatus, remark: r.studentRemark ?? "", rating: r.rating ?? null,
        needsMakeup: r.needsMakeup ?? null, absenceReason: r.absenceReason ?? "",
      };
    }
    return m;
  }, [roster, draft]);

  if (q.isLoading && !cached) return <div className="card p-6 text-sm text-ink-400">Đang tải buổi học…</div>;
  if (!s) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy buổi học"}</div>;

  const cycle = (id: string) => {
    const cur = effective[id]!.status;
    const idx = ATTENDANCE_STATUSES.indexOf(cur);
    const next = ATTENDANCE_STATUSES[(idx + 1) % ATTENDANCE_STATUSES.length]!;
    setDraft((d) => ({ ...d, [id]: { ...effective[id]!, status: next } }));
  };
  const setRemark = (id: string, remark: string) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, remark } }));
  const setNeedsMakeup = (id: string, needsMakeup: boolean | null) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, needsMakeup } }));
  const setAbsenceReason = (id: string, absenceReason: string) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, absenceReason } }));
  const setRating = (id: string, rating: number) => setDraft((d) => ({ ...d, [id]: { ...effective[id]!, rating: effective[id]!.rating === rating ? null : rating } }));
  const toggleCheck = (phase: "pre" | "post", key: string) => {
    const cur = s.checklist ?? {};
    const next = { pre: { ...(cur.pre ?? {}) }, post: { ...(cur.post ?? {}) } };
    next[phase][key] = !next[phase][key];
    saveChecklist.mutate({ sessionId, checklist: next });
  };
  const markAll = (status: AttendanceStatus) => setDraft(Object.fromEntries(roster.map((r) => [r.enrollmentId, { ...effective[r.enrollmentId]!, status }])));

  const submitAttendance = async () => {
    const records = roster.map((r) => {
      const v = effective[r.enrollmentId]!;
      // HV có mặt: nhận xét nằm ở phiếu nhận xét buổi → không gửi kèm để khỏi ghi đè bằng bản cũ
      const remarkByPanel = evalManaged && !isAbsent(v.status);
      return {
        enrollmentId: r.enrollmentId, status: v.status, studentRemark: remarkByPanel ? undefined : v.remark || null, rating: v.rating,
        needsMakeup: isAbsent(v.status) ? v.needsMakeup : null,
        absenceReason: isAbsent(v.status) ? v.absenceReason.trim() || null : null,
      };
    });
    const submit = s.status === "scheduled" || s.status === "in_progress";
    const queue = () => { enqueueAttendance({ sessionId, records, submit }); setError(null); setOfflineSaved(true); };
    if (typeof navigator !== "undefined" && !navigator.onLine) return queue();
    try {
      await record.mutateAsync({ sessionId, records });
    } catch (e) {
      if (isNetworkError(e)) return queue();
      return;
    }
    dropLocal(`draft:${sessionId}`);
    if (submit) await transition.mutateAsync({ sessionId, event: "submit_attendance" }).catch(onErr);
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

      {offlineView && <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm">Đang xem dữ liệu đã lưu trên máy (mất kết nối). Điểm danh vẫn ghi được và sẽ tự gửi khi có mạng.</div>}
      {offlineSaved && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Điểm danh buổi này đã lưu trên máy, chờ gửi lên hệ thống.</div>}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* Buổi này cần hoàn thiện: bài học, tiêu chí + mô tả 4 mức, danh mục việc cần xong (chuẩn hồ sơ học tập) */}
      {!isFuture && s.status !== "cancelled" && s.status !== "rescheduled" && evalBoard.data && (
        <SessionTodo
          board={evalBoard.data}
          sheets={liveForms}
          roster={roster.map((r) => ({ enrollmentId: r.enrollmentId, name: r.fullName, status: effective[r.enrollmentId]?.status ?? null, saved: !!r.attendanceStatus }))}
          hasSessionNote={!!s.sessionNote?.trim()}
          onJump={onJump}
        />
      )}

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
      <section id="diem-danh" className="card scroll-mt-20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Điểm danh <span className="text-ink-400 font-normal text-sm">({present}/{roster.length} có mặt)</span></h2>
          {s.date === s.today && <Link href={`/teacher/sessions/${sessionId}/quet`} className="text-xs font-semibold text-brand-600 underline">Quét thẻ QR</Link>}
          <div className="flex gap-1">
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => markAll("present")} disabled={busy || s.status === "completed"}>Tất cả có mặt</button>
          </div>
        </div>
        <ul className="divide-y divide-black/5">
          {roster.map((r) => {
            const v = effective[r.enrollmentId]!;
            return (
              <li key={r.enrollmentId} id={`dd-${r.enrollmentId}`} className="scroll-mt-20 py-2 flex items-center gap-3">
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
                  {evalManaged && !isAbsent(v.status) ? (
                    <a href="#phieu-nhan-xet" className="mt-1 block truncate text-xs text-ink-400 hover:text-brand-600">{r.studentRemark ? `Nhận xét: ${r.studentRemark}` : "Nhận xét ở phiếu nhận xét buổi bên dưới ↓"}</a>
                  ) : (
                    <input
                      className="mt-1 w-full bg-transparent text-xs text-ink-600 outline-none placeholder:text-ink-400"
                      placeholder="Nhận xét nhanh (tuỳ chọn)…"
                      value={v.remark}
                      onChange={(e) => setRemark(r.enrollmentId, e.target.value)}
                      disabled={s.status === "completed"}
                    />
                  )}
                  {isAbsent(v.status) && (
                    <div className="mt-1 space-y-1 rounded-lg bg-black/[0.03] p-2">
                      <div className="flex flex-wrap items-center gap-1 text-[11px]">
                        <span className="text-ink-600">Học bù:</span>
                        <button type="button" disabled={s.status === "completed"} onClick={() => setNeedsMakeup(r.enrollmentId, true)} className={`chip cursor-pointer px-2 py-0.5 ${v.needsMakeup === true ? "bg-violet-600 text-white" : "bg-black/5"}`}>Cần học bù</button>
                        <button type="button" disabled={s.status === "completed"} onClick={() => setNeedsMakeup(r.enrollmentId, false)} className={`chip cursor-pointer px-2 py-0.5 ${v.needsMakeup === false ? "bg-ink-900 text-white" : "bg-black/5"}`}>Không bù</button>
                        {v.needsMakeup === null && <span className="text-ink-400">chưa chọn — mặc định xếp vào &ldquo;Chờ xếp bù&rdquo;</span>}
                      </div>
                      <input
                        className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none placeholder:text-ink-400"
                        placeholder="Lý do phụ huynh xin vắng…"
                        maxLength={500}
                        value={v.absenceReason}
                        onChange={(e) => setAbsenceReason(r.enrollmentId, e.target.value)}
                        disabled={s.status === "completed"}
                      />
                    </div>
                  )}
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

      {/* Phiếu nhận xét buổi học — từng HV có mặt (hồ sơ học tập) */}
      {!isFuture && s.status !== "cancelled" && s.status !== "rescheduled" && (
        <EvaluationPanel
          sessionId={sessionId}
          attendance={Object.fromEntries(roster.map((r) => [r.enrollmentId, effective[r.enrollmentId]?.status]))}
          sessionDone={s.status === "completed"}
          disabled={offlineView}
          onFormsChange={setLiveForms}
          jump={jump}
        />
      )}

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
      <section id="nhan-xet-buoi" className={`card scroll-mt-20 p-4 space-y-3 ${step < 2 ? "opacity-60" : ""}`}>
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

      {/* Xác nhận bài đã dạy */}
      <ConfirmLesson
        sessionId={sessionId}
        confirmed={!!s.lessonConfirmedAt}
        lessonTitle={s.lesson?.title ?? null}
        topic={s.topic ?? null}
        byName={s.lessonConfirmedByName}
        disabled={busy || s.status === "completed" || s.status === "cancelled" || isFuture}
        onConfirm={(v) => confirmLesson.mutate({ sessionId, ...v })}
        pending={confirmLesson.isPending}
      />

      {/* Quy trình sau buổi */}
      <section className="card p-4 space-y-2">
        <h2 className="font-bold">Quy trình sau buổi <span className="text-xs font-normal text-ink-400">(mục * bắt buộc trước khi hoàn tất)</span></h2>
        <ul className="space-y-1 text-sm">
          {(s.completion ?? []).map((c) => (
            <li key={c.key} className={c.done ? "text-green-800" : c.required ? "text-ink-900" : "text-ink-600"}>
              <span className="mr-1">{c.done ? "✓" : "○"}</span>{c.label}{c.required && !c.done && <span className="text-red-600">*</span>}
              {c.hint && <span className="text-xs text-ink-400"> — {c.hint}</span>}
            </li>
          ))}
        </ul>
        <div className="border-t border-black/5 pt-2">
          <div className="mb-1 text-xs font-semibold text-ink-600">Tự tick</div>
          <ul className="space-y-1">
            {s.checklistTemplate.post.map((i) => (
              <li key={i.key}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.checklist?.post?.[i.key]} disabled={busy || s.status === "cancelled"} onChange={() => toggleCheck("post", i.key)} /> {i.label}{i.required && <span className="text-red-600">*</span>}</label></li>
            ))}
          </ul>
        </div>
        <PrivateNote initial={s.privateNote ?? ""} disabled={busy} onSave={(t) => saveChecklist.mutate({ sessionId, checklist: s.checklist ?? {}, privateNote: t || null })} />
      </section>

      {/* Bước 3: Hoàn tất */}
      <section className={`card p-4 space-y-3 ${step < 3 ? "opacity-60" : ""}`}>
        <h2 className="font-bold">Hoàn tất buổi học</h2>
        <p className="text-sm text-ink-600">Sau khi hoàn tất, phiếu nhận xét của từng học viên được phát hành (lưu vào hồ sơ học tập, không sửa được nếu không ghi lý do), phụ huynh nhận thông báo điểm danh + nhận xét; buổi được tính vào gói học.</p>
        {s.status !== "completed" && (s.completionBlockers ?? []).length > 0 && (
          <ul className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
            {(s.completionBlockers ?? []).map((b) => <li key={b}>• {b}</li>)}
          </ul>
        )}
        {s.status === "completed" ? (
          <div className="flex items-center justify-between">
            <span className="chip bg-green-100 text-green-800">Đã hoàn tất</span>
            <button className="btn-ghost text-xs" onClick={reopen} disabled={busy}>Mở lại để sửa</button>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={complete} disabled={busy || step < 3 || (s.completionBlockers ?? []).length > 0}>
            {transition.isPending ? "Đang chốt…" : "Hoàn tất buổi học ✓"}
          </button>
        )}
      </section>
    </div>
  );
}

/** Xác nhận bài đã dạy (bắt buộc trước khi hoàn tất); đổi sang bài khác của giáo trình nếu lớp học lệch bài */
function ConfirmLesson({ sessionId, confirmed, lessonTitle, topic, byName, disabled, pending, onConfirm }: {
  sessionId: string; confirmed: boolean; lessonTitle: string | null; topic: string | null; byName: string | null;
  disabled: boolean; pending: boolean; onConfirm: (v: { lessonId?: string | null; topic?: string | null }) => void;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [lessonId, setLessonId] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const options = useQuery({ ...trpc.academics.sessions.lessonOptions.queryOptions({ sessionId }), enabled: open });
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Bài đã dạy {confirmed ? <span className="chip ml-1 bg-green-100 text-green-800">Đã xác nhận</span> : <span className="chip ml-1 bg-amber-100 text-amber-800">Chưa xác nhận</span>}</h2>
        {!disabled && <button className="text-xs font-semibold text-brand-600" onClick={() => setOpen(!open)}>{open ? "Đóng" : "Đổi bài"}</button>}
      </div>
      <p className="text-sm text-ink-600">{lessonTitle ?? topic ?? "Chưa gắn bài giảng"}{byName ? ` · xác nhận bởi ${byName}` : ""}</p>
      {open && (
        <div className="space-y-2">
          <select className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">— Giữ bài hiện tại —</option>
            {options.data?.map((l) => <option key={l.id} value={l.id}>Bài {l.sequenceNo}: {l.title}</option>)}
          </select>
          {(options.data?.length ?? 0) === 0 && !options.isFetching && (
            <input className="input" maxLength={200} placeholder="Chủ đề đã dạy (lớp chưa có giáo trình)" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} />
          )}
        </div>
      )}
      {!disabled && (
        <button className="btn-primary w-full" disabled={pending} onClick={() => onConfirm({ lessonId: lessonId || null, topic: customTopic.trim() || null })}>
          {pending ? "Đang lưu…" : confirmed ? "Xác nhận lại bài đã dạy" : "Xác nhận bài đã dạy"}
        </button>
      )}
    </section>
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
