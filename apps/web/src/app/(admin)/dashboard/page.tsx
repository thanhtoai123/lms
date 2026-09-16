import Link from "next/link";
import { LEAD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { LeadChip, LEAD_CHIP, fmtDateTime } from "@/components/lead-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const fmtN = (n: number) => n.toLocaleString("vi-VN");

export default async function Dashboard() {
  const { caller } = await getServerCaller();
  const [me, d] = await Promise.all([caller.auth.me(), caller.dashboard.overview()]);
  const firstName = me?.user.fullName.split(/\s+/).slice(-1)[0] ?? "";
  const dateVi = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long" });
  const L = d.leads;
  const growth = L && L.kpi.newLastMonth > 0 ? Math.round(((L.kpi.newThisMonth - L.kpi.newLastMonth) / L.kpi.newLastMonth) * 100) : null;
  const maxDay = L ? Math.max(1, ...L.series.map((s) => s.n)) : 1;
  const statusTotal = L ? L.byStatus.reduce((a, b) => a + b.n, 0) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Xin chào, {firstName} 👋</h1>
        <p className="text-sm text-ink-400 first-letter:uppercase">{dateVi}</p>
      </div>

      {d.queues.length > 0 && (
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-600">Cần xử lý</h2>
            <div className="flex gap-2">
              {d.totalOverdue > 0 && <span className="chip bg-red-100 text-red-700">{fmtN(d.totalOverdue)} quá hạn</span>}
              <span className="chip bg-brand-600 text-white">{fmtN(d.totalTasks)} việc</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {d.queues.map((q) => (
              <Link key={q.key} href={q.href} className={`rounded-xl border p-3.5 transition hover:shadow-sm ${q.overdue > 0 ? "border-red-200 bg-red-50/60" : "border-black/5 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{q.title}</div>
                    <div className="truncate text-xs text-ink-400">{q.preview.length ? q.preview.join(" · ") : q.count === 0 ? "Không có việc" : "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold">{fmtN(q.count)}</div>
                    {q.overdue > 0 && <div className="text-[11px] text-red-700">⚠ {fmtN(q.overdue)} quá hạn</div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {L && <Kpi label="Khách hàng mới (tháng)" value={fmtN(L.kpi.newThisMonth)} note={growth === null ? undefined : `${growth >= 0 ? "+" : ""}${growth}% so với tháng trước`} tone={growth !== null && growth < 0 ? "down" : "up"} />}
        {L && <Kpi label="Hẹn học thử hôm nay" value={fmtN(L.kpi.trialsToday)} />}
        {d.teachersToday !== null && <Kpi label="GV đứng lớp hôm nay" value={fmtN(d.teachersToday)} note={`${fmtN(d.sessionsToday ?? 0)} buổi`} />}
        {L && <Kpi label="Tổng leads" value={fmtN(L.kpi.total)} />}
        {d.totalStudents !== null && <Kpi label="Tổng học viên" value={fmtN(d.totalStudents)} />}
        {L && <Kpi label="Tỉ lệ chuyển đổi (lead)" value={`${L.kpi.total ? ((L.kpi.enrolled / L.kpi.total) * 100).toFixed(1) : "0"}%`} />}
      </section>

      {L && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="font-bold">Leads 14 ngày qua</h2>
            <p className="mb-4 text-xs text-ink-400">Số lead mới mỗi ngày</p>
            <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Biểu đồ lead 14 ngày">
              {L.series.map((s) => (
                <div key={s.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="text-[10px] text-ink-400">{s.n || ""}</div>
                  <div className="w-full rounded-t bg-brand-600/80" style={{ height: `${(s.n / maxDay) * 80}%`, minHeight: s.n ? 4 : 1 }} title={`${s.day}: ${s.n}`} />
                  <div className="text-[9px] text-ink-400">{s.day.slice(8)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-bold">Phân bố theo trạng thái</h2>
            <p className="mb-4 text-xs text-ink-400">Tất cả leads</p>
            <div className="space-y-2">
              {[...L.byStatus].sort((a, b) => b.n - a.n).map((s) => (
                <div key={s.status} className="flex items-center gap-3 text-sm">
                  <span className={`chip w-32 justify-center ${LEAD_CHIP[s.status]}`}>{LEAD_STATUS_VI[s.status]}</span>
                  <div className="h-2 flex-1 rounded-full bg-black/5"><div className="h-2 rounded-full bg-brand-600/70" style={{ width: `${statusTotal ? (s.n / statusTotal) * 100 : 0}%` }} /></div>
                  <span className="w-10 text-right font-mono text-xs">{s.n}</span>
                </div>
              ))}
              {L.byStatus.length === 0 && <p className="text-sm text-ink-400">Chưa có lead.</p>}
            </div>
          </div>
        </section>
      )}

      {L && (
        <section className="card overflow-x-auto">
          <div className="flex items-center justify-between p-5 pb-2">
            <h2 className="font-bold">Leads mới nhất</h2>
            <Link href="/leads" className="text-sm text-brand-600">Xem tất cả →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="px-5 py-2">Phụ huynh</th><th className="px-5 py-2">Phone</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">Thời gian</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {L.latest.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2.5"><Link href={`/leads/${l.id}`} className="font-medium text-brand-600">{l.parentName}</Link></td>
                  <td className="px-5 py-2.5 font-mono text-xs">{l.phone}</td>
                  <td className="px-5 py-2.5"><LeadChip status={l.status} /></td>
                  <td className="px-5 py-2.5 text-xs text-ink-600">{fmtDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!L && d.queues.length === 0 && (
        <div className="card p-6 text-sm text-ink-600">
          Tài khoản của bạn chưa có khối số liệu nào trên Dashboard. Dùng menu bên trái để vào các màn hình được phân quyền
          {" "}hoặc mở <Link href="/teacher" className="text-brand-600 underline">Ứng dụng giáo viên</Link>.
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "up" | "down" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {note && <div className={`text-[11px] ${tone === "down" ? "text-red-700" : tone === "up" ? "text-green-700" : "text-ink-400"}`}>{note}</div>}
    </div>
  );
}
