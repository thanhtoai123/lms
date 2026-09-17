import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtTime, fmtDate, Empty, WEEKDAY_VI } from "@/components/ui";
import { weekdayOf } from "@satarobo/core";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<Awaited<ReturnType<typeof getServerCaller>>["caller"]["teacher"]["today"]>>["todays"][number];

function SessionCard({ s, highlight }: { s: Row; highlight?: boolean }) {
  return (
    <Link href={`/teacher/sessions/${s.id}`} className={`card block p-4 ${highlight ? "border-brand-500/40 ring-2 ring-brand-100" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-ink-400">{WEEKDAY_VI[weekdayOf(s.date)]} {fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)} · {s.roomCode ?? "—"}</div>
          <div className="font-semibold truncate">{s.className}</div>
          <div className="text-sm text-ink-600 truncate">{s.label}{s.topic ? ` · ${s.topic}` : ""}</div>
        </div>
        <StatusChip status={s.status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-600">
        <span>{s.attended}/{s.enrolled} đã điểm danh</span>
        {s.isOverdue && <span className="chip bg-red-100 text-red-700">Quá hạn</span>}
        {s.nextStep && !s.isOverdue && <span className="text-brand-600 font-semibold">{s.nextStep === "submit_attendance" ? "Điểm danh →" : s.nextStep === "submit_notes" ? "Nhận xét →" : "Hoàn tất →"}</span>}
      </div>
    </Link>
  );
}

export default async function TeacherToday() {
  const { caller } = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.teacher.today>>;
  try {
    data = await caller.teacher.today();
  } catch (e) {
    return <Empty>{(e as Error).message}. Tài khoản này chưa gắn hồ sơ giáo viên — hãy đăng nhập bằng tài khoản GV hoặc sang <Link className="underline" href="/dashboard">Trang quản trị</Link>.</Empty>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-bold">Chào {data.teacher.fullName} 👋</h1>
        <p className="text-sm text-ink-600">{WEEKDAY_VI[weekdayOf(data.today)]}, {fmtDate(data.today)}</p>
        <Link href="/huong-dan" className="text-xs text-brand-600">Hướng dẫn sử dụng & bài kiểm tra →</Link>
      </section>

      {data.overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-red-700 flex items-center gap-2">
            Cần chốt ngay <span className="chip bg-red-100 text-red-700">{data.overdue.length}</span>
          </h2>
          {data.overdue.map((s) => <SessionCard key={s.id} s={s} highlight />)}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Hôm nay</h2>
        {data.todays.length === 0 ? <Empty>Hôm nay bạn không có buổi dạy.</Empty> : data.todays.map((s) => <SessionCard key={s.id} s={s} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink-600">7 ngày tới</h2>
        {data.upcoming.length === 0 ? <Empty>Chưa có lịch.</Empty> : data.upcoming.map((s) => <SessionCard key={s.id} s={s} />)}
      </section>
    </div>
  );
}
