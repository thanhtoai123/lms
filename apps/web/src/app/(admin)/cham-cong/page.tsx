import Link from "next/link";
import { hasPermission, PERIOD_STATUS_CHIP, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { units } from "@/components/hr-ui";
import { CsvButton } from "@/components/csv-button";
import { TimesheetGrid, PeriodActions } from "./grid";
import { TimesheetTabs } from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chấm công" };

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "flag", label: "Chỉ có cờ" },
  { key: "no_punch", label: "Chưa quét" },
  { key: "override", label: "Đã ghi đè" },
] as const;

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ center?: string; period?: string; q?: string; loc?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Chấm công" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period! : now;
  const filter = (FILTERS.find((f) => f.key === sp.loc)?.key ?? "all") as "all" | "flag" | "no_punch" | "override";
  const t = await caller.hr.timesheet({ centerId, period, q: sp.q || undefined, filter });
  const [y, m] = period.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const q = (p: string) => `/cham-cong?center=${centerId}&period=${p}`;
  const kpi: { label: string; value: string | number; warn?: boolean; sub?: string }[] = [
    { label: "Người có ca", value: t.rows.length },
    { label: "Ngày có ca", value: t.kpi.scheduled },
    { label: "Ngày đã quét", value: t.kpi.punched },
    { label: "Cờ cần rà", value: t.kpi.openFlags, warn: t.kpi.openFlags > 0, sub: `${t.kpi.flagPeople} người` },
    { label: "Không quét lượt nào", value: t.kpi.noPunch, warn: t.kpi.noPunch > 0 },
    { label: "Đã ghi đè", value: t.kpi.overrides },
    { label: "Công tính lương", value: units(t.kpi.payableUnits) },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Chấm công"
        desc="Công đếm theo ca đã xếp trên lưới phân ca; lượt quét chỉ sinh cờ để quản lý rà — không tự trừ công. Ghi đè công cần lý do. Chốt kỳ cảnh báo cờ chưa rà và cần hết đơn chờ duyệt."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/cham-cong/man-hinh?center=${centerId}`} className="btn-ghost">Màn hình QR</Link>
            <Link href={`/cham-cong/phan-ca?center=${centerId}&period=${period}`} className="btn-ghost">Lưới phân ca</Link>
            <Link href="/don-tu?status=pending" className="btn-ghost">Đơn từ{t.pendingRequests ? ` (${t.pendingRequests})` : ""}</Link>
            <CsvButton
              filename={`bang-cong-${period}`}
              headers={["Mã", "Họ tên", "Chức danh", "Ngày có ca", "Công", "Phép", "Không lương", "Lễ", "Tính lương", "Giờ làm", "Giờ KH", "Muộn (lần)", "Muộn (phút)", "Sớm (lần)", "Vắng", "Không quét", "Cờ chưa rà", "OT (giờ)"]}
              rows={t.rows.map((r) => [r.code, r.fullName, r.title, r.summary.scheduled, r.summary.workUnits, r.summary.paidLeave, r.summary.unpaidLeave, r.summary.holiday, r.summary.payableUnits, Math.round(r.summary.workedMin / 6) / 10, Math.round(r.summary.plannedMin / 6) / 10, r.summary.lateCount, r.summary.lateMin, r.summary.earlyCount, r.summary.absentCount, r.summary.noPunchCount, r.openFlagCount, Math.round(r.summary.otMin / 6) / 10])}
              label="Xuất bảng công"
            />
          </div>
        }
      />
      <TimesheetTabs centerId={centerId} period={period} active="bang-cong" />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        <input type="month" name="period" defaultValue={period} className="input w-auto" />
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã NV" className="input w-44" />
        <select name="loc" defaultValue={filter} className="input w-auto">{FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        <button className="btn-ghost">Xem</button>
        <Link href={q(prev)} className="btn-ghost">‹ Tháng trước</Link>
        <Link href={q(next)} className="btn-ghost">Tháng sau ›</Link>
      </form>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {kpi.map((k) => (
          <div key={k.label} className={`card p-3 ${k.warn ? "ring-1 ring-amber-300" : ""}`}>
            <div className="text-xs text-ink-500">{k.label}</div>
            <div className={`text-xl font-semibold ${k.warn ? "text-amber-700" : ""}`}>{k.value}</div>
            {k.sub && <div className="text-xs text-ink-400">{k.sub}</div>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`chip ${PERIOD_STATUS_CHIP[t.status]}`}>{t.statusLabel}</span>
        <span className="text-sm">Công chuẩn: <b>{units(t.standardUnits)}</b> · {t.rows.length} nhân sự</span>
        {t.unlockReason && t.status === "reopened" && <span className="text-xs text-ink-600">Đã mở lại: {t.unlockReason}</span>}
        <Link href={`/cham-cong/ky-cong?center=${centerId}&period=${period}`} className="text-xs text-brand-700">Kỳ công &amp; chốt →</Link>
        <PeriodActions centerId={centerId} period={period} status={t.status} blockers={t.lockCheck.blockers} warnings={t.lockCheck.warnings} canLock={t.perms.lock} canUnlock={t.perms.unlock} standardUnits={t.standardUnits} />
      </div>
      {t.rows.length === 0 ? <Empty>Không có nhân sự khớp bộ lọc.</Empty> : <TimesheetGrid dates={t.dates} rows={t.rows} canUpdate={t.perms.update && t.editable} />}
      <p className="text-xs text-ink-400">Ký hiệu: ✓ đủ công · M muộn · S về sớm · V vắng · Vl vắng có lý do · P nghỉ phép · ? thiếu lượt vào/ra · L ngày lễ · ✎ đã ghi đè · chấm đỏ = cờ chưa rà · chấm vàng = có đơn chờ duyệt.</p>
    </div>
  );
}
