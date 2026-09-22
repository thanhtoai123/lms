"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  TRIAL_SESSION_STATUS_VI, TRIAL_ENROLLMENT_STATUS_VI, TRIAL_ATTENDANCE_STATUSES, TRIAL_ATTENDANCE_STATUS_VI,
  LEAD_STATUS_VI, type TrialSessionStatus, type TrialAttendanceStatus,
} from "@satarobo/core";
import { ErrorBox, OkBox, fmtDate } from "@/components/admin-ui";
import { TrialClassChip } from "../classes";
import { TrialReportButton } from "@/components/trial-report/drawer";

const SESSION_CHIP: Record<TrialSessionStatus, string> = {
  scheduled: "bg-sky-100 text-sky-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

type SessionDraft = { date: string; startTime: string; endTime: string; roomId: string; teacherId: string; topic: string };
const EMPTY_SESSION: SessionDraft = { date: "", startTime: "18:00", endTime: "19:30", roomId: "", teacherId: "", topic: "" };

/** Một dòng trong bảng "Tìm & thêm học viên": mỗi con một dòng (lead chưa tách con thì dùng tên con trên lead) */
type CandidateRow = { key: string; childId: string | null; name: string; inClass: { className: string; trialClassId: string } | null };
/** Ô điểm danh của một học viên trong buổi đang mở ("" = chưa đánh dấu) */
type Mark = { status: TrialAttendanceStatus | ""; note: string };
const EMPTY_MARK: Mark = { status: "", note: "" };

export function TrialClassDetail({ id, openReport }: { id: string; /** Mở sẵn phiếu đánh giá của học viên này (link từ "Việc hôm nay") */ openReport?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.trials.classDetail.queryOptions({ id }));

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Thêm buổi
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SessionDraft>(EMPTY_SESSION);
  // Sửa / huỷ buổi (đều bắt buộc lý do)
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SessionDraft>(EMPTY_SESSION);
  const [sessionReason, setSessionReason] = useState("");
  const [confirmCancelSession, setConfirmCancelSession] = useState(false);
  // Huỷ lớp
  const [cancelClassOpen, setCancelClassOpen] = useState(false);
  const [confirmCancelClass, setConfirmCancelClass] = useState(false);
  const [classReason, setClassReason] = useState("");
  // Học viên
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picker, setPicker] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  // Điểm danh
  const [attSession, setAttSession] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const candidates = useQuery({ ...trpc.admissions.trials.classCandidates.queryOptions({ trialClassId: id, q: debounced || undefined }), enabled: picker });

  const refresh = () => qc.invalidateQueries({ queryKey: trpc.admissions.trials.classDetail.queryKey({ id }) });
  const onError = (e: { message: string }) => { setNotice(null); setError(e.message); };
  const ok = (text: string) => { setError(null); setNotice(text); refresh(); };

  const addSession = useMutation(trpc.admissions.trials.addSession.mutationOptions({
    onSuccess: () => { setAdding(false); setDraft(EMPTY_SESSION); ok("Đã thêm buổi — mọi học viên trong lớp đều học buổi này."); },
    onError,
  }));
  const reschedule = useMutation(trpc.admissions.trials.rescheduleSession.mutationOptions({
    onSuccess: () => { setEditing(null); setSessionReason(""); ok("Đã lưu lịch mới và báo giáo viên."); },
    onError,
  }));
  const cancelSession = useMutation(trpc.admissions.trials.cancelSession.mutationOptions({
    onSuccess: () => { setEditing(null); setSessionReason(""); setConfirmCancelSession(false); ok("Đã huỷ buổi và báo giáo viên."); },
    onError,
  }));
  const completeSession = useMutation(trpc.admissions.trials.completeSession.mutationOptions({ onSuccess: () => ok("Đã đánh dấu buổi đã dạy xong."), onError }));
  const cancelClass = useMutation(trpc.admissions.trials.cancelClass.mutationOptions({
    onSuccess: () => { setCancelClassOpen(false); setConfirmCancelClass(false); setClassReason(""); ok("Đã huỷ lớp trải nghiệm."); router.refresh(); },
    onError,
  }));
  const enroll = useMutation(trpc.admissions.trials.enrollToClass.mutationOptions({
    onSuccess: () => { setPicker(false); setSearch(""); ok("Đã xếp học viên — em học toàn bộ buổi của lớp, kể cả buổi tạo sau."); },
    onError,
  }));
  const withdraw = useMutation(trpc.admissions.trials.withdrawFromClass.mutationOptions({
    onSuccess: () => { setWithdrawing(null); setWithdrawReason(""); ok("Đã rút học viên khỏi lớp."); },
    onError,
  }));
  const markAttendance = useMutation(trpc.admissions.trials.markClassAttendance.mutationOptions({ onSuccess: () => ok("Đã lưu điểm danh."), onError }));

  const busy = addSession.isPending || reschedule.isPending || cancelSession.isPending || completeSession.isPending
    || cancelClass.isPending || enroll.isPending || withdraw.isPending || markAttendance.isPending;

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message ?? "Không tìm thấy lớp trải nghiệm"}</div>;

  const d = q.data;
  const c = d.class;
  const active = d.enrollments.filter((e) => e.status === "enrolled");
  const perms = d.perms;
  const attOf = (sessionId: string, enrollmentId: string) => d.attendance.find((a) => a.trialSessionId === sessionId && a.enrollmentId === enrollmentId) ?? null;

  const openEdit = (s: (typeof d.sessions)[number]) => {
    setEditing(s.id);
    setConfirmCancelSession(false);
    setSessionReason("");
    setError(null);
    setEditDraft({ date: s.date, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), roomId: s.roomId ?? "", teacherId: s.teacherId ?? "", topic: s.topic ?? "" });
  };

  const openAttendance = (sessionId: string) => {
    if (attSession === sessionId) return setAttSession(null);
    const next: Record<string, Mark> = {};
    for (const e of active) {
      const a = attOf(sessionId, e.id);
      next[e.id] = { status: a?.status ?? "", note: a?.note ?? "" };
    }
    setMarks(next);
    setAttSession(sessionId);
    setError(null);
  };

  const saveAttendance = (sessionId: string) => {
    const records = Object.entries(marks)
      .filter(([, v]) => v.status !== "")
      .map(([enrollmentId, v]) => ({ enrollmentId, status: v.status as TrialAttendanceStatus, note: v.note.trim() || null }));
    if (!records.length) return setError("Chưa đánh dấu học viên nào");
    markAttendance.mutate({ sessionId, records });
  };

  const unmarked = active.filter((e) => !marks[e.id] || marks[e.id]!.status === "").length;
  // Phiếu đánh giá: lập được khi lớp đã có ít nhất một buổi diễn ra
  const hasPastSession = d.sessions.some((s) => s.status !== "cancelled" && s.date <= d.today);
  const canReport = hasPastSession && (perms.attendance || perms.manage);

  return (
    <div className="space-y-4">
      <Link href="/lop-trial" className="text-sm text-ink-600">← Danh sách lớp trải nghiệm</Link>

      <header className="card flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{c.name} <TrialClassChip status={c.status} /></h1>
          <div className="font-mono text-xs text-ink-400">{c.code}</div>
          <div className="text-sm text-ink-600">
            {c.centerCode} — {c.centerName}{c.courseCode ? ` · khoá trải nghiệm ${c.courseCode}` : " · chưa chọn khoá trải nghiệm"} · Sĩ số {c.enrolled}/{c.capacity} · {c.sessionCount} buổi
          </div>
          {c.note && <div className="text-xs text-ink-600">{c.note}</div>}
          {c.status === "cancelled" && c.cancelReason && <div className="text-xs text-red-700">Lý do huỷ lớp: {c.cancelReason}</div>}
        </div>
        {perms.manage && c.status !== "cancelled" && (
          cancelClassOpen ? (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <label className="text-xs text-ink-600">Lý do huỷ lớp (bắt buộc)
                <input className="input mt-1" autoFocus maxLength={300} value={classReason} onChange={(e) => { setClassReason(e.target.value); setConfirmCancelClass(false); }} placeholder="VD: không đủ học viên đăng ký" />
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn-ghost text-xs" onClick={() => { setCancelClassOpen(false); setConfirmCancelClass(false); }}>Thôi</button>
                {confirmCancelClass ? (
                  <button className="btn-primary !bg-red-600 text-xs" disabled={busy} onClick={() => cancelClass.mutate({ id, reason: classReason.trim() })}>Bấm lại để xác nhận</button>
                ) : (
                  <button className="btn-ghost text-xs text-red-700" disabled={busy || classReason.trim().length < 5} onClick={() => setConfirmCancelClass(true)}>Huỷ lớp</button>
                )}
              </div>
            </div>
          ) : (
            <button className="btn-ghost text-xs text-red-700" onClick={() => { setCancelClassOpen(true); setError(null); setNotice(null); }}>Huỷ lớp</button>
          )
        )}
      </header>

      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && !error && <OkBox>{notice}</OkBox>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Buổi học & điểm danh */}
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Buổi học & điểm danh <span className="text-xs font-normal text-ink-400">({d.sessions.length})</span></h2>
            {perms.manage && c.status === "open" && !adding && <button className="btn-ghost text-xs" onClick={() => { setAdding(true); setDraft({ ...EMPTY_SESSION, date: d.today }); setError(null); }}>+ Thêm buổi học</button>}
          </div>
          <p className="text-xs text-ink-600">Ngày / giờ / phòng / giáo viên chọn theo từng buổi. Đổi lịch hoặc huỷ buổi bắt buộc ghi lý do — nội dung gửi thẳng cho giáo viên phụ trách buổi.</p>

          {adding && (
            <form
              className="grid gap-2 rounded-xl border border-black/5 bg-black/[0.02] p-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                addSession.mutate({
                  trialClassId: id, date: draft.date, startTime: draft.startTime, endTime: draft.endTime,
                  roomId: draft.roomId || null, teacherId: draft.teacherId || null, topic: draft.topic.trim() || null,
                });
              }}
            >
              <label className="text-xs text-ink-600">Ngày *<input className="input mt-1" type="date" required min={d.today} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              <label className="text-xs text-ink-600">Giờ bắt đầu<input className="input mt-1" type="time" required value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></label>
              <label className="text-xs text-ink-600">Giờ kết thúc<input className="input mt-1" type="time" required value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></label>
              <label className="text-xs text-ink-600">Phòng
                <select className="input mt-1" value={draft.roomId} onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}>
                  <option value="">— chưa xếp phòng —</option>
                  {d.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-600">Giáo viên
                <select className="input mt-1" value={draft.teacherId} onChange={(e) => setDraft({ ...draft, teacherId: e.target.value })} disabled={!perms.assignTeacher}>
                  <option value="">— chưa xếp giáo viên —</option>
                  {d.teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-600">Nội dung buổi<input className="input mt-1" maxLength={200} value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="VD: Làm quen bộ kit" /></label>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Huỷ</button>
                <button className="btn-primary" disabled={busy}>Thêm buổi</button>
              </div>
            </form>
          )}

          {d.sessions.length === 0 ? (
            <p className="rounded-xl bg-black/[0.03] p-3 text-sm text-ink-600">Lớp chưa có buổi nào — thêm buổi trước, vì lớp chưa có buổi thì không xếp được học viên.</p>
          ) : (
            <ul className="space-y-2">
              {d.sessions.map((s) => (
                <li key={s.id} className="rounded-xl border border-black/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm">
                      <b>Buổi {s.seq}</b> · {fmtDate(s.date)} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}{" "}
                      <span className={`chip ${SESSION_CHIP[s.status]}`}>{TRIAL_SESSION_STATUS_VI[s.status]}</span>
                      <div className="text-xs text-ink-600">GV {s.teacherName ?? "— chưa xếp —"}{s.roomCode ? ` · phòng ${s.roomCode}` : " · chưa xếp phòng"}{s.topic ? ` · ${s.topic}` : ""}</div>
                      {s.rescheduleReason && <div className="text-xs text-amber-800">Lý do dời: {s.rescheduleReason}</div>}
                      {s.cancelReason && <div className="text-xs text-red-700">Lý do huỷ: {s.cancelReason}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {perms.attendance && s.status !== "cancelled" && s.date <= d.today && (
                        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => openAttendance(s.id)}>{attSession === s.id ? "Đóng điểm danh" : "Điểm danh"}</button>
                      )}
                      {perms.attendance && s.status === "scheduled" && s.date <= d.today && (
                        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => completeSession.mutate({ sessionId: s.id })}>Hoàn tất buổi</button>
                      )}
                      {perms.manage && s.status === "scheduled" && s.date >= d.today && (
                        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => (editing === s.id ? setEditing(null) : openEdit(s))}>Sửa buổi học</button>
                      )}
                    </div>
                  </div>

                  {editing === s.id && (
                    <div className="mt-3 grid gap-2 rounded-xl border border-black/10 bg-white p-3 sm:grid-cols-3">
                      <label className="text-xs text-ink-600">Ngày<input className="input mt-1" type="date" min={d.today} value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} /></label>
                      <label className="text-xs text-ink-600">Giờ bắt đầu<input className="input mt-1" type="time" value={editDraft.startTime} onChange={(e) => setEditDraft({ ...editDraft, startTime: e.target.value })} /></label>
                      <label className="text-xs text-ink-600">Giờ kết thúc<input className="input mt-1" type="time" value={editDraft.endTime} onChange={(e) => setEditDraft({ ...editDraft, endTime: e.target.value })} /></label>
                      <label className="text-xs text-ink-600">Phòng
                        <select className="input mt-1" value={editDraft.roomId} onChange={(e) => setEditDraft({ ...editDraft, roomId: e.target.value })}>
                          <option value="">— chưa xếp phòng —</option>
                          {d.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-ink-600">Giáo viên
                        <select className="input mt-1" value={editDraft.teacherId} onChange={(e) => setEditDraft({ ...editDraft, teacherId: e.target.value })} disabled={!perms.assignTeacher}>
                          <option value="">— chưa xếp giáo viên —</option>
                          {d.teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-ink-600">Nội dung buổi<input className="input mt-1" maxLength={200} value={editDraft.topic} onChange={(e) => setEditDraft({ ...editDraft, topic: e.target.value })} /></label>
                      <label className="text-xs text-ink-600 sm:col-span-3">Lý do dời / huỷ *
                        <input className="input mt-1" maxLength={300} value={sessionReason} onChange={(e) => { setSessionReason(e.target.value); setConfirmCancelSession(false); }} placeholder="VD: giáo viên bận đột xuất" />
                        <span className="mt-1 block text-[11px] text-ink-400">Nội dung này được gửi thẳng cho giáo viên.</span>
                      </label>
                      <div className="flex flex-wrap justify-end gap-2 sm:col-span-3">
                        <button className="btn-ghost" onClick={() => setEditing(null)}>Đóng</button>
                        {confirmCancelSession ? (
                          <button className="btn-primary !bg-red-600" disabled={busy} onClick={() => cancelSession.mutate({ sessionId: s.id, reason: sessionReason.trim() })}>Bấm lại để xác nhận</button>
                        ) : (
                          <button className="btn-ghost text-red-700" disabled={busy || sessionReason.trim().length < 5} onClick={() => setConfirmCancelSession(true)}>Huỷ buổi</button>
                        )}
                        <button
                          className="btn-primary"
                          disabled={busy || sessionReason.trim().length < 5 || !editDraft.date}
                          onClick={() => reschedule.mutate({
                            sessionId: s.id, date: editDraft.date, startTime: editDraft.startTime, endTime: editDraft.endTime,
                            roomId: editDraft.roomId || null, teacherId: editDraft.teacherId || null, topic: editDraft.topic.trim() || null, reason: sessionReason.trim(),
                          })}
                        >
                          Lưu & báo giáo viên
                        </button>
                      </div>
                    </div>
                  )}

                  {attSession === s.id && (
                    <div className="mt-3 space-y-2 rounded-xl border border-black/10 bg-white p-3">
                      {active.length === 0 ? <p className="text-sm text-ink-400">Lớp chưa có học viên nào.</p> : (
                        <>
                          <ul className="divide-y divide-black/5">
                            {active.map((e) => {
                              const m: Mark = marks[e.id] ?? EMPTY_MARK;
                              return (
                                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                                  <span className="min-w-40 font-medium">{e.studentName}</span>
                                  <div className="flex gap-1">
                                    {TRIAL_ATTENDANCE_STATUSES.map((st) => (
                                      <button
                                        key={st}
                                        type="button"
                                        className={`chip cursor-pointer ${m.status === st ? "bg-brand-500 text-white" : "bg-black/5"}`}
                                        onClick={() => setMarks({ ...marks, [e.id]: { ...m, status: m.status === st ? "" : st } })}
                                      >
                                        {TRIAL_ATTENDANCE_STATUS_VI[st]}
                                      </button>
                                    ))}
                                  </div>
                                  <input className="input !py-1 flex-1 text-xs" maxLength={300} placeholder="Ghi chú…" value={m.note} onChange={(ev) => setMarks({ ...marks, [e.id]: { ...m, note: ev.target.value } })} />
                                </li>
                              );
                            })}
                          </ul>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-ink-400">{unmarked > 0 ? `Còn ${unmarked} em chưa đánh dấu` : "Đã đánh dấu đủ"}</span>
                            <button className="btn-primary" disabled={busy} onClick={() => saveAttendance(s.id)}>Lưu điểm danh</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Học viên */}
        <aside className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Học viên <span className="text-xs font-normal text-ink-400">({active.length}/{c.capacity})</span></h2>
            {perms.manage && c.status === "open" && (
              <button className="btn-ghost text-xs" onClick={() => { setPicker(!picker); setError(null); }}>{picker ? "Đóng" : "Tìm & thêm học viên"}</button>
            )}
          </div>
          <p className="text-xs text-ink-600">Thêm một em vào lớp = em đó học toàn bộ buổi của lớp, kể cả buổi tạo sau.</p>
          {c.seatsLeft === 0 && <p className="text-xs text-amber-800">Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số.</p>}

          {picker && (
            <div className="space-y-2 rounded-xl border border-black/10 p-2">
              <input className="input !py-1.5 text-sm" autoFocus placeholder="Tên bé / tên PH / SĐT…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-72 overflow-y-auto">
                {candidates.isLoading ? <div className="p-2 text-xs text-ink-400">Đang tìm…</div>
                  : candidates.error ? <div className="p-2 text-xs text-red-700">{candidates.error.message}</div>
                  : (candidates.data ?? []).length === 0 ? <div className="p-2 text-xs text-ink-400">Không có khách phù hợp ở cơ sở {c.centerCode}.</div>
                  : (
                    <ul className="divide-y divide-black/5 text-sm">
                      {candidates.data!.map((l) => {
                        const rows: CandidateRow[] = l.children.length
                          ? l.children.map((k) => ({ key: k.id, childId: k.id, name: k.fullName, inClass: k.inClass }))
                          : [{ key: l.id, childId: null, name: l.childName ?? "(chưa có tên bé)", inClass: l.inClass }];
                        return (
                          <li key={l.id} className="py-2">
                            <div className="text-xs text-ink-600">PH {l.parentName} · {l.phone} · {LEAD_STATUS_VI[l.status]}</div>
                            {rows.map((r) => (
                              <div key={r.key} className="mt-1 flex items-center justify-between gap-2">
                                <span>{r.name}</span>
                                {r.inClass ? (
                                  <span className="text-[11px] text-ink-400">đang ở lớp {r.inClass.className}</span>
                                ) : (
                                  <button
                                    className="btn-ghost !px-2 !py-1 text-xs"
                                    disabled={busy}
                                    onClick={() => {
                                      const over = c.seatsLeft === 0;
                                      if (over && !perms.overrideCapacity) return setError("Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số.");
                                      if (over && !window.confirm("Lớp đã đủ sĩ số. Bạn có quyền vượt sĩ số — vẫn xếp?")) return;
                                      enroll.mutate({ trialClassId: id, leadId: l.id, childId: r.childId, override: over || undefined });
                                    }}
                                  >
                                    Xếp vào lớp
                                  </button>
                                )}
                              </div>
                            ))}
                          </li>
                        );
                      })}
                    </ul>
                  )}
              </div>
            </div>
          )}

          {d.enrollments.length === 0 ? (
            <p className="text-sm text-ink-400">Chưa có học viên nào trong lớp.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {d.enrollments.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {e.studentName}{" "}
                        <span className={`chip ${e.status === "enrolled" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{TRIAL_ENROLLMENT_STATUS_VI[e.status]}</span>
                        {e.overCapacity && <span className="chip ml-1 bg-amber-100 text-amber-800">vượt sĩ số</span>}
                      </div>
                      <div className="text-xs text-ink-400">
                        PH <Link href={`/leads/${e.leadId}`} className="text-brand-600 hover:underline">{e.parentName}</Link> · {e.phone} · {LEAD_STATUS_VI[e.leadStatus]}
                      </div>
                      {e.withdrawReason && <div className="text-[11px] text-red-700">Lý do rút: {e.withdrawReason}</div>}
                    </div>
                    {/* GV chỉ có quyền "của mình" không thấy nút chung, nhưng mở từ "Việc hôm nay" vẫn điền được (máy chủ kiểm quyền) */}
                    {(canReport || openReport === e.id) && e.status === "enrolled" && (
                      <TrialReportButton source={{ trialClassEnrollmentId: e.id }} autoOpen={openReport === e.id} />
                    )}
                    {perms.manage && e.status === "enrolled" && (
                      withdrawing === e.id ? (
                        <div className="flex flex-col items-end gap-1">
                          <input className="input !py-1 text-xs" autoFocus maxLength={300} placeholder="Lý do rút (tuỳ chọn)" value={withdrawReason} onChange={(ev) => setWithdrawReason(ev.target.value)} />
                          <div className="flex gap-2">
                            <button className="text-xs font-semibold text-red-700" disabled={busy} onClick={() => withdraw.mutate({ enrollmentId: e.id, reason: withdrawReason.trim() || null })}>Xác nhận gỡ?</button>
                            <button className="text-xs text-ink-400" onClick={() => setWithdrawing(null)}>Không</button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-xs text-ink-400 hover:text-red-700" onClick={() => { setWithdrawing(e.id); setWithdrawReason(""); }}>Gỡ</button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
