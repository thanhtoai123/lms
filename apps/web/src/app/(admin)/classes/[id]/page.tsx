import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtDate, fmtTime, WEEKDAY_VI } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết lớp" };

export default async function ClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const c = await caller.academics.classes.get({ id });
  const done = c.sessions.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/classes" className="text-sm text-ink-600">← Lớp học</Link>
        <h1 className="text-2xl font-bold mt-1">{c.name}</h1>
        <div className="text-sm text-ink-600">{c.code} · {c.course.name} · {c.center.name}{c.homeRoom ? ` · ${c.homeRoom.name}` : ""} · GV: {c.leadTeacher?.fullName ?? "—"}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {c.schedules.filter((s) => !s.effectiveTo).map((s) => (
            <span key={s.id} className="chip bg-brand-50 text-brand-700">{WEEKDAY_VI[s.weekday]} {fmtTime(s.startTime)}–{fmtTime(s.endTime)}</span>
          ))}
          <span className="chip bg-black/5">{done}/{c.sessions.length} buổi</span>
          <span className="chip bg-black/5">{c.roster.filter((r) => r.status === "active" || r.status === "trial").length}/{c.capacity} HV</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2 className="font-bold">Học viên & rủi ro</h2>
          <div className="card divide-y divide-black/5">
            {c.roster.map((r) => (
              <div key={r.enrollmentId} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.fullName} <span className="text-xs text-ink-400">{r.code}</span></div>
                  <div className="text-xs text-ink-600">Chuyên cần {Math.round(r.attendance.rate * 100)}% · {r.attendance.attended}/{r.attendance.total} buổi · gói {r.packageSessions}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`chip ${r.status === "active" ? "bg-green-100 text-green-800" : r.status === "trial" ? "bg-amber-100 text-amber-800" : "bg-black/5"}`}>{r.status}</span>
                  {r.risks.map((k) => <span key={k.code} className="chip bg-red-100 text-red-700" title={k.detail}>{k.code === "CONSECUTIVE_ABSENCE" ? "Nghỉ liên tiếp" : k.code === "LOW_ATTENDANCE" ? "Chuyên cần thấp" : "Chờ học bù"}</span>)}
                </div>
              </div>
            ))}
            {c.roster.length === 0 && <div className="p-4 text-sm text-ink-400">Chưa có học viên.</div>}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">Buổi học</h2>
          <div className="card divide-y divide-black/5 max-h-[70vh] overflow-y-auto">
            {c.sessions.map((s) => (
              <Link key={s.id} href={`/teacher/sessions/${s.id}`} className="p-3 flex items-center justify-between gap-3 hover:bg-brand-50/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">Buổi {s.sequenceNo}{s.topic ? ` · ${s.topic}` : ""}</div>
                  <div className="text-xs text-ink-400">{WEEKDAY_VI[new Date(s.date + "T00:00:00Z").getUTCDay() || 7]} {fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)}</div>
                </div>
                <StatusChip status={s.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
