import Link from "next/link";
import { WEEKDAY_SHORT_VI, weekLabel } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { SESSION_CHIP, SESSION_LABEL, fmtTime } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch tổng" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; center?: string; teacher?: string; room?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined;
  const { caller } = await getServerCaller();
  const [ref, w] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.schedule.week({ date, centerId: sp.center || undefined, teacherId: sp.teacher || undefined, roomId: sp.room || undefined }),
  ]);
  const q = (d: string) => {
    const u = new URLSearchParams();
    u.set("date", d);
    if (sp.center) u.set("center", sp.center);
    if (sp.teacher) u.set("teacher", sp.teacher);
    if (sp.room) u.set("room", sp.room);
    return `/lich?${u.toString()}`;
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch tổng"
        desc={`Tuần ${weekLabel(w.start)} · ${w.total} buổi${w.cancelled ? ` (${w.cancelled} huỷ/dời)` : ""}`}
        actions={<div className="flex gap-1"><Link href={q(w.prev)} className="btn-ghost">← Tuần trước</Link><Link href={q(w.today)} className="btn-ghost">Hôm nay</Link><Link href={q(w.next)} className="btn-ghost">Tuần sau →</Link></div>}
      />
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="date" value={w.start} />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[200px]"><option value="">Mọi cơ sở</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
        <select name="teacher" defaultValue={sp.teacher ?? ""} className="input max-w-[220px]"><option value="">Mọi giáo viên</option>{ref.teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
        <select name="room" defaultValue={sp.room ?? ""} className="input max-w-[200px]"><option value="">Mọi phòng</option>{ref.rooms.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {w.days.map((d, i) => (
            <div key={d.date} className={`rounded-2xl p-2 ${d.date === w.today ? "bg-brand-600/10 ring-1 ring-brand-600/30" : "bg-black/[0.03]"}`}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-sm font-bold">{WEEKDAY_SHORT_VI[i]}</span>
                <span className="text-xs text-ink-400">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
              </div>
              <div className="space-y-1.5">
                {d.sessions.map((s) => (
                  <Link key={s.id} href={`/teacher/sessions/${s.id}`} className={`block rounded-xl border bg-white p-2 text-xs shadow-sm hover:border-brand-600/50 ${s.isOverdue ? "border-red-300" : "border-black/5"} ${s.status === "cancelled" || s.status === "rescheduled" ? "opacity-50 line-through" : ""}`}>
                    <div className="font-semibold">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</div>
                    <div className="truncate">{s.classCode}</div>
                    <div className="truncate text-ink-400">{s.roomCode ?? "—"} · {s.teacherName ?? "chưa phân GV"}</div>
                    <div className="mt-1 flex items-center justify-between gap-1"><span className={`chip !px-1.5 !text-[10px] ${SESSION_CHIP[s.status]}`}>{SESSION_LABEL[s.status]}</span><span className="text-[10px] text-ink-400">B{s.sequenceNo} · {s.attended}/{s.enrolled}</span></div>
                  </Link>
                ))}
                {d.sessions.length === 0 && <div className="py-4 text-center text-[11px] text-ink-400">Không có buổi</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
