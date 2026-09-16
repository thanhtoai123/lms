import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtDate, fmtTime, Empty } from "@/components/ui";
import { addDays, toISODate } from "@satarobo/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buổi học" };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; open?: string }> }) {
  const sp = await searchParams;
  const today = toISODate(new Date(Date.now() + 7 * 3600 * 1000));
  const from = sp.from ?? addDays(today, -7);
  const to = sp.to ?? addDays(today, 7);
  const { caller } = await getServerCaller();
  const rows = await caller.academics.sessions.list({ from, to, onlyOpen: sp.open === "1" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Buổi học</h1>
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label">Từ</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">Đến</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="open" value="1" defaultChecked={sp.open === "1"} /> Chỉ chưa hoàn tất</label>
        <button className="btn-ghost" type="submit">Lọc</button>
      </form>
      {rows.length === 0 ? (
        <Empty>Không có buổi học trong khoảng này.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">Lớp / chủ đề</th><th className="p-3">Phòng</th><th className="p-3">GV</th><th className="p-3">Điểm danh</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((s) => (
                <tr key={s.id} className={s.isOverdue ? "bg-red-50/60" : ""}>
                  <td className="p-3 whitespace-nowrap">{fmtDate(s.date)} {fmtTime(s.startTime)}–{fmtTime(s.endTime)}</td>
                  <td className="p-3"><Link href={`/teacher/sessions/${s.id}`} className="font-medium text-brand-700">{s.className}</Link><div className="text-xs text-ink-400">{s.classCode} · buổi {s.sequenceNo}{s.topic ? ` · ${s.topic}` : ""}</div></td>
                  <td className="p-3">{s.centerCode}{s.roomCode ? `/${s.roomCode}` : ""}</td>
                  <td className="p-3">{s.teacherName ?? "—"}</td>
                  <td className="p-3">{s.attended}/{s.enrolled}</td>
                  <td className="p-3"><StatusChip status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
