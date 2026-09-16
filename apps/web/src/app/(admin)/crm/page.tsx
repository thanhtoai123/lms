import Link from "next/link";
import { LEAD_STATUSES, LEAD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { LEAD_CHIP } from "@/components/lead-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM Dashboard" };

/** Thứ tự phễu "đã từng tới bước" (xấp xỉ theo trạng thái hiện tại) */
const FUNNEL = ["new", "contacted", "trial_scheduled", "trial_done", "enrolled"] as const;
const REACHED: Record<(typeof FUNNEL)[number], readonly string[]> = {
  new: LEAD_STATUSES,
  contacted: ["contacted", "nurturing", "consulting", "trial_scheduled", "trial_in_progress", "trial_done", "deciding", "enrolled"],
  trial_scheduled: ["trial_scheduled", "trial_in_progress", "trial_done", "deciding", "enrolled"],
  trial_done: ["trial_done", "deciding", "enrolled"],
  enrolled: ["enrolled"],
};

export default async function CrmDashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { caller } = await getServerCaller();
  const s = await caller.admissions.leads.summary({ days });
  const count = (st: readonly string[]) => s.byStatus.filter((b) => st.includes(b.status)).reduce((a, b) => a + b.n, 0);
  const funnel = FUNNEL.map((f) => ({ key: f, n: count(REACHED[f]) }));
  const top = Math.max(1, funnel[0]!.n);
  const maxSource = Math.max(1, ...s.bySource.map((x) => x.n));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CRM Dashboard</h1>
          <p className="text-sm text-ink-400">{days} ngày qua · {s.total} lead · {s.enrolled} đã đăng ký · tỉ lệ chốt {s.conversionRate}% · {s.overdueOpen} lead mở đang quá SLA</p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex gap-1">
            {[7, 30, 90, 365].map((d) => (
              <button key={d} name="days" value={d} className={`chip cursor-pointer px-3 py-1 ${d === days ? "bg-brand-600 text-white" : "bg-black/5"}`}>{d === 365 ? "1 năm" : `${d} ngày`}</button>
            ))}
          </form>
          <Link href="/leads?view=kanban" className="btn-primary">Xem Kanban</Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-bold">Phễu chuyển đổi</h2>
          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <div key={f.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{LEAD_STATUS_VI[f.key]}</span>
                  <span className="font-mono text-xs">{f.n}{i > 0 && funnel[i - 1]!.n > 0 ? ` · ${Math.round((f.n / funnel[i - 1]!.n) * 100)}%` : ""}</span>
                </div>
                <div className="h-3 rounded-full bg-black/5"><div className="h-3 rounded-full bg-brand-600" style={{ width: `${(f.n / top) * 100}%`, opacity: 1 - i * 0.12 }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-bold">Lead theo nguồn</h2>
          <div className="space-y-2">
            {s.bySource.map((x) => (
              <div key={x.source ?? "none"} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate">{x.source ?? "(không rõ)"}</span>
                <div className="h-2 flex-1 rounded-full bg-black/5"><div className="h-2 rounded-full bg-brand-600/70" style={{ width: `${(x.n / maxSource) * 100}%` }} /></div>
                <span className="w-20 text-right font-mono text-xs">{x.n} · {x.enrolled} chốt</span>
              </div>
            ))}
            {s.bySource.length === 0 && <p className="text-sm text-ink-400">Chưa có dữ liệu.</p>}
          </div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="p-5 pb-2 font-bold">Hiệu suất đội sale</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="px-5 py-2">Nhân viên</th><th className="px-5 py-2">Lead được giao</th><th className="px-5 py-2">Đang mở</th><th className="px-5 py-2">Đã chốt</th><th className="px-5 py-2">Tỉ lệ chốt</th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {s.bySale.map((r) => (
              <tr key={r.userId ?? "none"}>
                <td className="px-5 py-2.5 font-medium">{r.name ?? <span className="text-ink-400">Chưa phân công</span>}</td>
                <td className="px-5 py-2.5 font-mono">{r.n}</td>
                <td className="px-5 py-2.5 font-mono">{r.open}</td>
                <td className="px-5 py-2.5 font-mono">{r.enrolled}</td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-black/5"><div className="h-2 rounded-full bg-green-600" style={{ width: `${r.rate}%` }} /></div><span className="text-xs">{r.rate}%</span></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">Chi tiết theo trạng thái</h2>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((st) => (
            <Link key={st} href={`/leads?status=${st}`} className={`chip px-3 py-1.5 ${LEAD_CHIP[st]}`}>
              {LEAD_STATUS_VI[st]} · {s.byStatus.find((b) => b.status === st)?.n ?? 0}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
