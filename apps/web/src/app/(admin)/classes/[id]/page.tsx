import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentChip } from "@/components/admin-ui";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty, WEEKDAY_VI } from "@/components/ui";
import { CLASS_STATUS_VI } from "@satarobo/core";
import type { RouterOutputs } from "@/lib/trpc/types";
import { StatusPanel, InfoPanel, SchedulePanel, CheckPanel, AddSessionPanel, EventTimeline, CancelClassPanel } from "./workspace";
import { SessionList } from "./session-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết lớp" };

type MakeupData = RouterOutputs["schedule"]["makeups"];
type FeedbackData = RouterOutputs["care"]["feedback"];

// 3 tab việc. "Ảnh lớp" trước đây là tab thứ tư nhưng chỉ lặp lại trang /media
// (nơi có cả tải ảnh, gắn thẻ và bộ lọc trạng thái) → đổi thành một liên kết.
const TABS = [
  { key: "", label: "Tổng quan" },
  { key: "hoc-bu", label: "Học bù" },
  { key: "danh-gia", label: "Đánh giá & nhận xét" },
] as const;

export default async function ClassDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab ?? "") : "";
  const { caller } = await getServerCaller();
  const c = await caller.academics.classes.get({ id }).catch((e: { code?: string; data?: { code?: string } }) => {
    if (e?.code === "NOT_FOUND" || e?.data?.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!c) notFound();
  const [ws, check] = await Promise.all([
    caller.academics.classes.workspace({ id }),
    c.sessions.length ? caller.academics.classes.scheduleCheck({ id }) : Promise.resolve(null),
  ]);
  // Dữ liệu của tab đang mở — tái dùng service sẵn có, chỉ thêm bộ lọc theo lớp
  const makeups = tab === "hoc-bu" ? await caller.schedule.makeups({ classId: id }).catch(() => null) : null;
  const feedback = tab === "danh-gia" ? await caller.care.feedback({ classId: id }).catch(() => null) : null;
  const regular = c.sessions.filter((s) => s.kind === "regular");
  const extra = c.sessions.filter((s) => s.kind !== "regular");
  const done = regular.filter((s) => s.status === "completed").length;
  const active = c.roster.filter((r) => r.status === "active" || r.status === "trial").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/classes" className="text-sm text-ink-600">← Lớp học</Link>
        <h1 className="mt-1 text-2xl font-bold">{c.name}</h1>
        <div className="text-sm text-ink-600">
          {c.code} · {c.course.name} · {c.center.name}{c.homeRoom ? ` · ${c.homeRoom.name}` : ""} · GV: {c.leadTeacher?.fullName ?? "—"}{c.assistantTeacher ? ` · Trợ giảng: ${c.assistantTeacher.fullName}` : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="chip bg-brand-100 text-brand-700">{CLASS_STATUS_VI[c.status]}</span>
          {ws.phases.filter((s) => s.current || (ws.planning && !s.past)).map((s) => (
            <span key={s.id} className="chip bg-brand-50 text-brand-700">{WEEKDAY_VI[s.weekday]} {s.startTime}–{s.endTime}</span>
          ))}
          <span className="chip bg-black/5">{done}/{regular.length || ws.info.plannedSessions || 0} buổi</span>
          <span className={`chip ${active < c.minCapacity ? "bg-amber-100 text-amber-800" : "bg-black/5"}`}>{active}/{c.capacity} HV (tối thiểu {c.minCapacity})</span>
          {extra.length > 0 && <span className="chip bg-black/5">{extra.length} buổi ngoài lộ trình</span>}
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-black/5 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `/classes/${id}?tab=${t.key}` : `/classes/${id}`} className={`rounded-t-lg px-3 py-2 ${tab === t.key ? "border-b-2 border-brand-600 font-semibold text-brand-700" : "text-ink-600 hover:text-ink-900"}`}>{t.label}</Link>
        ))}
        <Link href={`/media?class=${id}`} className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">Ảnh lớp →</Link>
      </nav>

      {tab === "hoc-bu" && <MakeupTab data={makeups} />}
      {tab === "danh-gia" && <FeedbackTab data={feedback} sessions={c.sessions} />}

      {tab === "" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <StatusPanel classId={id} ws={ws} />
          <InfoPanel classId={id} ws={ws} />
          <SchedulePanel classId={id} ws={ws} />
          {check && <CheckPanel classId={id} check={check} canUpdate={ws.canUpdate} />}
          <CancelClassPanel classId={id} ws={ws} />
        </div>
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Học viên & rủi ro</h2>
              {(c.status === "recruiting" || c.status === "running") && <Link href={`/enrollments/new?classId=${c.id}`} className="btn-ghost !py-1 text-xs">+ Ghi danh vào lớp</Link>}
            </div>
            <div className="card divide-y divide-black/5">
              {c.roster.map((r) => (
                <div key={r.enrollmentId} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium"><Link href={`/students/${r.studentId}`} className="hover:text-brand-600">{r.fullName}</Link> <span className="text-xs text-ink-400">{r.code}</span></div>
                    <div className="text-xs text-ink-600">Chuyên cần {Math.round(r.attendance.rate * 100)}% · {r.attendance.attended}/{r.attendance.total} buổi · gói {r.packageSessions}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <EnrollmentChip status={r.status} />
                    {r.risks.map((k) => <span key={k.code} className="chip bg-red-100 text-red-700" title={k.detail}>{k.code === "CONSECUTIVE_ABSENCE" ? "Nghỉ liên tiếp" : k.code === "LOW_ATTENDANCE" ? "Chuyên cần thấp" : "Chờ học bù"}</span>)}
                  </div>
                </div>
              ))}
              {c.roster.length === 0 && <div className="p-4 text-sm text-ink-400">Chưa có học viên.</div>}
            </div>
          </section>

          <AddSessionPanel classId={id} ws={ws} />

          <section className="space-y-2">
            <h2 className="font-bold">Buổi học</h2>
            {c.sessions.length === 0 ? (
              <div className="card p-4 text-sm text-ink-400">{ws.planning ? "Buổi học sẽ được sinh tự động khi lớp được duyệt mở." : "Chưa có buổi học."}</div>
            ) : (
              <SessionList
                classId={id}
                canEdit={ws.canEditSessions}
                enrolled={active}
                rooms={ws.roomOptions.map((r) => ({ id: r.id, label: `${r.code} — ${r.name}` }))}
                teachers={ws.teacherOptions.map((t) => ({ id: t.id, label: t.fullName }))}
                sessions={[...c.sessions]
                  .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
                  .map((s) => ({
                    id: s.id, label: s.label, sequenceNo: s.sequenceNo, kind: s.kind, date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status,
                    topic: s.topic, roomId: s.roomId, teacherId: s.teacherId, marked: s.marked, remarks: s.remarks, trials: s.trials,
                    cancelReason: s.cancelReason, rescheduledFromDate: s.rescheduledFromDate,
                  }))}
              />
            )}
          </section>
          <EventTimeline ws={ws} />
        </div>
      </div>
      )}
    </div>
  );
}

/* --------------------------- Tab: Học bù --------------------------- */

const MAKEUP_VI: Record<string, string> = { requested: "Chờ xếp buổi", approved: "Đã xếp buổi", done: "Đã học bù", rejected: "Từ chối" };

function MakeupTab({ data }: { data: MakeupData | null }) {
  if (!data) return <Empty>Bạn không có quyền xem học bù của lớp này.</Empty>;
  if (data.items.length === 0) return <Empty>Lớp chưa có yêu cầu học bù nào.</Empty>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Buổi vắng</th><th className="p-3">Buổi bù</th><th className="p-3">Trạng thái</th><th className="p-3">Ghi chú</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {data.items.map((m) => (
            <tr key={m.id}>
              <td className="p-3"><Link href={`/students/${m.studentId}`} className="text-brand-600">{m.studentName}</Link><div className="text-[11px] text-ink-400">{m.studentCode}</div></td>
              <td className="p-3 text-xs">Buổi {m.missedSeq} · {m.missedDate?.split("-").reverse().join("/")}</td>
              <td className="p-3 text-xs">{m.targetSessionId ? `${m.targetClassCode ?? ""} · ${m.targetDate?.split("-").reverse().join("/")} ${m.targetStart?.slice(0, 5) ?? ""}` : "—"}</td>
              <td className="p-3"><span className="chip bg-black/5">{MAKEUP_VI[m.status] ?? m.status}</span>{m.done && <span className="chip ml-1 bg-green-100 text-green-800">đã điểm danh</span>}</td>
              <td className="p-3 text-xs text-ink-600">{m.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------ Tab: Đánh giá & nhận xét ----------------------- */

function FeedbackTab({ data, sessions }: { data: FeedbackData | null; sessions: { id: string; label: string; date: string; sessionNote: string | null; remarks: number; status: string }[] }) {
  const noted = sessions.filter((s) => (s.sessionNote ?? "").trim().length > 0 || s.remarks > 0).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="font-bold">Nhận xét buổi học</h2>
        {noted.length === 0 ? <Empty>Chưa có nhận xét buổi nào.</Empty> : (
          <ul className="card divide-y divide-black/5 text-sm">
            {noted.map((s) => (
              <li key={s.id} className="p-3">
                <div className="flex items-center justify-between gap-2"><b>{s.label}</b><span className="text-xs text-ink-400">{s.date.split("-").reverse().join("/")}</span></div>
                {s.sessionNote && <p className="text-ink-600">{s.sessionNote}</p>}
                {s.remarks > 0 && <div className="text-[11px] text-ink-400">{s.remarks} nhận xét từng học viên</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">Đánh giá của phụ huynh</h2>
        {!data ? <Empty>Bạn không có quyền xem đánh giá phụ huynh.</Empty> : data.items.length === 0 ? <Empty>Lớp chưa có đánh giá nào.</Empty> : (
          <>
            <div className="card p-3 text-sm">
              Điểm chung trung bình <b>{data.stats.overall.avg?.toFixed(1) ?? "—"}</b>/5 · điểm giáo viên <b>{data.stats.teacher.avg?.toFixed(1) ?? "—"}</b>/5 · {data.stats.pending} đánh giá chưa phản hồi
            </div>
            <ul className="card divide-y divide-black/5 text-sm">
              {data.items.map((f) => (
                <li key={f.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span>{f.studentName}{f.teacherName ? ` · GV ${f.teacherName}` : ""}</span>
                    <span className="text-xs">{"★".repeat(f.rating)}{f.teacherRating ? ` · GV ${f.teacherRating}/5` : ""}</span>
                  </div>
                  {f.comment && <p className="text-ink-600">{f.comment}</p>}
                  <div className="text-[11px] text-ink-400">{f.sessionNo ? `Buổi ${f.sessionNo} · ` : ""}{f.sessionDate?.split("-").reverse().join("/") ?? ""}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
