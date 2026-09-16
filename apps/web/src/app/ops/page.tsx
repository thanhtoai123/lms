import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtDate, fmtTime, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OpsHome() {
  const { caller } = await getServerCaller();
  const [queue, classes] = await Promise.all([caller.academics.sessions.overdueQueue({ limit: 30 }), caller.academics.classes.list({})]);
  const running = classes.filter((c) => c.status === "running");
  const enrolled = classes.reduce((a, c) => a + c.enrolled, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Việc cần xử lý</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Buổi quá hạn chưa chốt" value={queue.total} tone={queue.total ? "danger" : "ok"} />
        <Stat label="Lớp đang chạy" value={running.length} />
        <Stat label="Học viên đang học" value={enrolled} />
        <Stat label="Lớp tuyển sinh" value={classes.filter((c) => c.status === "recruiting").length} />
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">Buổi học chưa hoàn tất (đã qua ngày)</h2>
        {queue.items.length === 0 ? (
          <Empty>Không có buổi nào quá hạn. 🎉</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-3">Ngày</th><th className="p-3">Lớp</th><th className="p-3">GV</th><th className="p-3">Điểm danh</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {queue.items.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 whitespace-nowrap">{fmtDate(s.date)} {fmtTime(s.startTime)}</td>
                    <td className="p-3"><div className="font-medium">{s.className}</div><div className="text-xs text-ink-400">{s.classCode} · buổi {s.sequenceNo}</div></td>
                    <td className="p-3">{s.teacherName ?? "—"}</td>
                    <td className="p-3">{s.attended}/{s.enrolled}</td>
                    <td className="p-3"><StatusChip status={s.status} /></td>
                    <td className="p-3"><Link className="text-brand-600 font-semibold" href={`/teacher/sessions/${s.id}`}>Xử lý →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "danger" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-2xl font-bold ${tone === "danger" ? "text-red-700" : tone === "ok" ? "text-green-700" : ""}`}>{value}</div>
    </div>
  );
}
