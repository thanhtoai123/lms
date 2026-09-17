import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { units } from "@/components/hr-ui";
import { CsvButton } from "@/components/csv-button";
import { TimesheetGrid, PeriodActions } from "./grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chấm công" };

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ center?: string; period?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Chấm công" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period! : now;
  const t = await caller.hr.timesheet({ centerId, period, q: sp.q || undefined });
  const [y, m] = period.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const q = (p: string) => `/cham-cong?center=${centerId}&period=${p}`;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Chấm công"
        desc="Bảng công theo kỳ (tháng): tính từ ca được phân, lượt chấm GPS và đơn đã duyệt. Đi muộn quá 5 phút bị tính muộn; thiếu quá nửa ca → nửa công. Chỉnh công cần lý do. Khoá kỳ khi không còn đơn chờ duyệt."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/cham-cong/phan-ca?center=${centerId}`} className="btn-ghost">Phân ca</Link>
            <Link href="/don-tu?status=pending" className="btn-ghost">Đơn từ{t.pendingRequests ? ` (${t.pendingRequests})` : ""}</Link>
            <CsvButton filename={`bang-cong-${period}`} headers={["Mã", "Họ tên", "Chức danh", "Số ca", "Công", "Phép", "Không lương", "Lễ", "Tính lương", "Muộn (lần)", "Muộn (phút)", "Về sớm (lần)", "Vắng", "Thiếu chấm", "OT (giờ)"]} rows={t.rows.map((r) => [r.code, r.fullName, r.title, r.summary.scheduled, r.summary.workUnits, r.summary.paidLeave, r.summary.unpaidLeave, r.summary.holiday, r.summary.payableUnits, r.summary.lateCount, r.summary.lateMin, r.summary.earlyCount, r.summary.absentCount, r.summary.missingCount, Math.round(r.summary.otMin / 6) / 10])} label="Xuất bảng công" />
          </div>
        }
      />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        <input type="month" name="period" defaultValue={period} className="input w-auto" />
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã NV" className="input w-44" />
        <button className="btn-ghost">Xem</button>
        <Link href={q(prev)} className="btn-ghost">‹ Tháng trước</Link>
        <Link href={q(next)} className="btn-ghost">Tháng sau ›</Link>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`chip ${t.status === "locked" ? "bg-slate-800 text-white" : "bg-green-100 text-green-800"}`}>{t.status === "locked" ? "Đã khoá kỳ" : "Kỳ đang mở"}</span>
        <span className="text-sm">Tổng công tính lương: <b>{units(t.rows.reduce((s, r) => s + r.summary.payableUnits, 0))}</b> · {t.rows.length} nhân sự</span>
        {t.unlockReason && t.status === "open" && <span className="text-xs text-ink-600">Đã mở lại: {t.unlockReason}</span>}
        <PeriodActions centerId={centerId} period={period} status={t.status} blockers={t.lockCheck.blockers} warnings={t.lockCheck.warnings} canLock={t.perms.lock} canUnlock={t.perms.unlock} />
      </div>
      {t.rows.length === 0 ? <Empty>Không có nhân sự.</Empty> : <TimesheetGrid dates={t.dates} rows={t.rows} canUpdate={t.perms.update && t.status === "open"} />}
      <p className="text-xs text-ink-400">Ký hiệu: ✓ đủ công · M muộn · S về sớm · V vắng · P nghỉ phép · ½P nghỉ nửa ngày · ? thiếu giờ vào/ra · L ngày lễ · ✎ đã chỉnh · • có đơn chờ duyệt.</p>
    </div>
  );
}
