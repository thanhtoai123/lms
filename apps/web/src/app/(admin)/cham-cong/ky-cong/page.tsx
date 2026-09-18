import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { units } from "@/components/hr-ui";
import { CsvButton } from "@/components/csv-button";
import { TimesheetTabs } from "../tabs";
import { PeriodBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kỳ công & chốt" };

export default async function PeriodPage({ searchParams }: { searchParams: Promise<{ center?: string; period?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Kỳ công & chốt" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period! : now;
  const d = await caller.hr.periodBoard({ centerId, period });
  const [y, m] = period.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const href = (p: string) => `/cham-cong/ky-cong?center=${centerId}&period=${p}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Kỳ công tháng ${m}/${y} — ${d.center?.code ?? ""}`}
        desc="Công = tổng công ngày (đã tính ghi đè). Rà hết việc còn dang dở rồi Tính lại trước khi chốt. Chốt xong, số công của kỳ này không đổi được từ màn nào nữa — chỉ nhân sự Hội sở mở lại được."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/cham-cong?center=${centerId}&period=${period}`} className="btn-ghost">Bảng công ngày</Link>
            <Link href={`/cham-cong/phan-ca?center=${centerId}&period=${period}`} className="btn-ghost">Lưới phân ca</Link>
            <CsvButton
              filename={`ky-cong-${period}-ban-tam`}
              label="Xuất CSV (bản tạm)"
              headers={["Mã NV", "Họ tên", "Chức danh", "Công", "Công làm", "Phép có lương", "Phép không lương", "Lễ", "Ngày có ca", "Giờ làm", "Giờ KH", "Muộn (lần)", "Muộn (phút)", "Sớm (lần)", "Không quét", "Cờ chưa rà", "Ngày ghi đè", "Chưa tính được"]}
              rows={d.rows.map((r) => [r.code, r.fullName, r.title, r.units, r.workUnits, r.paidLeave, r.unpaidLeave, r.holiday, r.scheduled, Math.round(r.workedMin / 6) / 10, Math.round(r.plannedMin / 6) / 10, r.lateCount, r.lateMin, r.earlyCount, r.noPunch, r.openFlags, r.overrideDays.length, r.pendingDays.length])}
            />
            <Link href={href(prev)} className="btn-ghost">‹ Tháng trước</Link>
            <Link href={href(next)} className="btn-ghost">Tháng sau ›</Link>
          </div>
        }
      />
      <TimesheetTabs centerId={centerId} period={period} active="ky-cong" />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong/ky-cong">
        {ref.centers.length > 1 ? (
          <label className="text-xs text-ink-600">Cơ sở<select name="center" defaultValue={centerId} className="input mt-1 w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
        ) : <input type="hidden" name="center" value={centerId} />}
        <label className="text-xs text-ink-600">Tháng<input type="month" name="period" defaultValue={period} className="input mt-1 w-auto" /></label>
        <button className="btn-ghost">Xem</button>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Tổng công cả kỳ" value={units(d.kpi.totalUnits)} strong />
        <Kpi label="Số người" value={d.kpi.people} />
        <Kpi label="Số ngày có cờ" value={d.kpi.flagDays} warn={d.kpi.flagDays > 0} />
        <Kpi label="Số ngày chưa tính được" value={d.kpi.pendingDays} warn={d.kpi.pendingDays > 0} sub="Ngày có ca mà chưa kết luận được công" />
        <Kpi label="Công chuẩn" value={units(d.standardUnits)} sub={`mặc định ${d.standardDefault}`} />
      </div>

      <PeriodBoard centerId={centerId} period={period} data={d} />

      {d.rows.length === 0 ? <Empty>Kỳ này chưa có nhân sự nào có công.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="p-3">Nhân sự</th><th className="p-3 text-right">Công</th><th className="p-3 text-right">Ngày có ca</th>
                <th className="p-3 text-right">Giờ làm / KH</th><th className="p-3 text-right">Muộn</th><th className="p-3 text-right">Sớm</th>
                <th className="p-3 text-right">Không lượt</th><th className="p-3">Ngày có cờ</th><th className="p-3">Ngày bị ghi đè</th><th className="p-3 text-right">Chưa tính được</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3"><Link href={`/nhan-su/${r.id}`} className="font-medium text-brand-700">{r.fullName}</Link><div className="text-xs text-ink-400">{r.code}{r.exempt ? " · miễn công" : ""}</div></td>
                  <td className="p-3 text-right tabular-nums font-semibold">{units(r.units)}</td>
                  <td className="p-3 text-right tabular-nums">{r.scheduled}</td>
                  <td className="p-3 text-right tabular-nums text-xs">{Math.round(r.workedMin / 6) / 10}h / {Math.round(r.plannedMin / 6) / 10}h</td>
                  <td className="p-3 text-right tabular-nums text-xs">{r.lateCount ? `${r.lateCount} · ${r.lateMin}′` : "—"}</td>
                  <td className="p-3 text-right tabular-nums text-xs">{r.earlyCount || "—"}</td>
                  <td className="p-3 text-right tabular-nums text-xs">{r.noPunch || "—"}</td>
                  <td className="p-3 text-xs">
                    {r.flagDays.length === 0 ? <span className="text-ink-400">—</span> : (
                      <Link href={`/cham-cong?center=${centerId}&period=${period}&loc=flag&q=${encodeURIComponent(r.code)}`} className="chip bg-amber-100 text-amber-800">{r.flagDays.length} ngày có cờ</Link>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {r.overrideDays.length === 0 ? <span className="text-ink-400">—</span> : (
                      <Link href={`/cham-cong?center=${centerId}&period=${period}&loc=override&q=${encodeURIComponent(r.code)}`} className="chip bg-indigo-100 text-indigo-800">{r.overrideDays.length} ngày bị ghi đè</Link>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs">{r.pendingDays.length || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-400">Bản CSV ở đây là <b>bản tạm</b>: số còn đổi cho tới khi kỳ được chốt.</p>
    </div>
  );
}

function Kpi({ label, value, sub, warn, strong }: { label: string; value: string | number; sub?: string; warn?: boolean; strong?: boolean }) {
  return (
    <div className={`card p-3 ${warn ? "ring-1 ring-amber-300" : ""}`}>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`text-xl font-semibold ${warn ? "text-amber-700" : strong ? "text-brand-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-ink-400">{sub}</div>}
    </div>
  );
}
