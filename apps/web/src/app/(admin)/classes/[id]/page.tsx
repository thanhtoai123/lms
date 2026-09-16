import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentChip } from "@/components/admin-ui";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtDate, fmtTime, WEEKDAY_VI } from "@/components/ui";
import { CLASS_STATUS_VI } from "@satarobo/core";
import { StatusPanel, InfoPanel, SchedulePanel, CheckPanel, AddSessionPanel, EventTimeline } from "./workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết lớp" };

export default async function ClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <StatusPanel classId={id} ws={ws} />
          <InfoPanel classId={id} ws={ws} />
          <SchedulePanel classId={id} ws={ws} />
          {check && <CheckPanel classId={id} check={check} canUpdate={ws.canUpdate} />}
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
              <div className="card max-h-[70vh] divide-y divide-black/5 overflow-y-auto">
                {[...c.sessions].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).map((s) => (
                  <Link key={s.id} href={`/teacher/sessions/${s.id}`} className={`flex items-center justify-between gap-3 p-3 hover:bg-brand-50/40 ${s.status === "cancelled" || s.status === "rescheduled" ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.label}{s.topic ? ` · ${s.topic}` : ""}
                        {s.kind !== "regular" && <span className="chip ml-1 bg-violet-100 text-violet-800">ngoài lộ trình</span>}
                      </div>
                      <div className="text-xs text-ink-400">{WEEKDAY_VI[new Date(s.date + "T00:00:00Z").getUTCDay() || 7]} {fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)}</div>
                    </div>
                    <StatusChip status={s.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>
          <EventTimeline ws={ws} />
        </div>
      </div>
    </div>
  );
}
