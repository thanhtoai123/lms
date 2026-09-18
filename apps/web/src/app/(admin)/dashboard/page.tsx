import type { ReactElement } from "react";
import Link from "next/link";
import { LEAD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { LeadChip, LEAD_CHIP, fmtDateTime } from "@/components/lead-ui";
import { MoreCharts } from "./more-charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const fmtN = (n: number) => n.toLocaleString("vi-VN");

export default async function Dashboard() {
  const { caller } = await getServerCaller();
  const [me, d] = await Promise.all([caller.auth.me(), caller.dashboard.overview()]);
  // Hiển thị tên như hệ cũ ("Xin chào, Admin"): bỏ phần ghi chú trong ngoặc
  const displayName = (me?.user.fullName ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  const dateVi = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long" });
  const L = d.leads;
  const growth = L && L.kpi.newLastMonth > 0 ? Math.round(((L.kpi.newThisMonth - L.kpi.newLastMonth) / L.kpi.newLastMonth) * 100) : null;
  // Tối đa 4 thẻ số liệu: chọn theo đúng quyền người dùng có, thừa thì bỏ
  const kpis = [
    L ? <Kpi key="new" label="Khách hàng mới (tháng)" value={fmtN(L.kpi.newThisMonth)} note={growth === null ? undefined : `${growth >= 0 ? "+" : ""}${growth}% so với tháng trước`} tone={growth !== null && growth < 0 ? "down" : "up"} /> : null,
    L ? <Kpi key="trial" label="Hẹn học thử hôm nay" value={fmtN(L.kpi.trialsToday)} /> : null,
    d.teachersToday !== null ? <Kpi key="gv" label="GV đứng lớp hôm nay" value={fmtN(d.teachersToday)} note={`${fmtN(d.sessionsToday ?? 0)} buổi`} /> : null,
    d.totalStudents !== null ? <Kpi key="hv" label="Tổng học viên" value={fmtN(d.totalStudents)} /> : null,
    L ? <Kpi key="conv" label="Tỉ lệ chuyển đổi (lead)" value={`${L.kpi.total ? ((L.kpi.enrolled / L.kpi.total) * 100).toFixed(1) : "0"}%`} /> : null,
  ].filter((x): x is ReactElement => x !== null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Xin chào, {displayName} 👋</h1>
          <p className="text-sm text-ink-400 first-letter:uppercase">{dateVi}</p>
        </div>
        {L && <MoreCharts series={L.series} byStatus={L.byStatus} statusLabel={LEAD_STATUS_VI} statusChip={LEAD_CHIP} />}
      </div>

      {d.totalTasks > 0 && (
        <Link
          href="/viec-hom-nay"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3.5 text-sm transition hover:shadow-sm ${d.totalOverdue > 0 ? "border-red-200 bg-red-50/60" : "border-border bg-card hover:border-primary"}`}
        >
          <span className="font-semibold text-foreground">Bạn có {fmtN(d.totalTasks)} việc cần xử lý hôm nay</span>
          {d.totalOverdue > 0 && <span className="chip bg-red-100 text-red-700">{fmtN(d.totalOverdue)} quá hạn</span>}
          <span className="ml-auto font-semibold text-primary">Mở Việc hôm nay →</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.slice(0, 4)}
      </section>

      {L && <FunnelChart data={L.funnel} />}

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

      {!L && d.totalTasks === 0 && (
        <div className="card p-6 text-sm text-ink-600">
          Tài khoản của bạn chưa có khối số liệu nào trên Dashboard. Dùng menu bên trái để vào các màn hình được phân quyền
          {" "}hoặc mở <Link href="/teacher" className="text-brand-600 underline">Ứng dụng giáo viên</Link>.
        </div>
      )}
    </div>
  );
}

/**
 * Phễu lead theo tuần (8 tuần gần nhất) — SVG thuần, không thư viện:
 * mỗi tuần một cặp cột (lead mới vs đã chuyển đổi) + đường tỉ lệ chuyển đổi.
 */
function FunnelChart({ data }: { data: { week: string; label: string; created: number; converted: number }[] }) {
  const W = 720;
  const H = 220;
  const pad = { top: 16, right: 12, bottom: 30, left: 34 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.created));
  const step = iw / Math.max(1, data.length);
  const barW = Math.min(20, step / 2.6);
  const y = (v: number) => pad.top + ih - (v / max) * ih;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const totalNew = data.reduce((a, b) => a + b.created, 0);
  const totalConv = data.reduce((a, b) => a + b.converted, 0);
  const rate = totalNew ? Math.round((totalConv / totalNew) * 100) : 0;

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Phễu lead theo tuần</h2>
        <div className="text-xs text-ink-600">
          8 tuần gần nhất · {fmtN(totalNew)} lead mới · {fmtN(totalConv)} đã chuyển đổi ({rate}%)
        </div>
      </div>
      <p className="mb-3 flex flex-wrap gap-3 text-xs text-ink-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-600/80" /> Lead mới</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600/80" /> Đã chuyển đổi</span>
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[520px]" role="img" aria-label={`Biểu đồ phễu lead 8 tuần: ${data.map((d) => `tuần ${d.label} ${d.created} lead mới, ${d.converted} chuyển đổi`).join("; ")}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-black/10" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-400 text-[10px]">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.left + i * step + step / 2;
            return (
              <g key={d.week}>
                <rect x={x0 - barW - 1} y={y(d.created)} width={barW} height={Math.max(1, pad.top + ih - y(d.created))} rx={2} className="fill-brand-600/80">
                  <title>{`Tuần ${d.label}: ${d.created} lead mới`}</title>
                </rect>
                <rect x={x0 + 1} y={y(d.converted)} width={barW} height={Math.max(1, pad.top + ih - y(d.converted))} rx={2} className="fill-green-600/80">
                  <title>{`Tuần ${d.label}: ${d.converted} đã chuyển đổi`}</title>
                </rect>
                <text x={x0} y={H - 10} textAnchor="middle" className="fill-ink-400 text-[10px]">{d.label}</text>
              </g>
            );
          })}
          <line x1={pad.left} x2={W - pad.right} y1={pad.top + ih} y2={pad.top + ih} stroke="currentColor" className="text-black/20" strokeWidth={1} />
        </svg>
      </div>
    </section>
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
