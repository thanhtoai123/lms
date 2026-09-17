import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { RosterEditor, ShiftTemplates, GeofenceEditor } from "./roster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phân ca" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ center?: string; week?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Phân ca" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const week = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today;
  const r = await caller.hr.roster({ centerId, weekStart: week });
  const shiftDays = (n: number) => { const d = new Date(`${r.weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const href = (w: string) => `/cham-cong/phan-ca?center=${centerId}&week=${w}`;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Phân ca"
        desc="Chọn ca cho từng ngày rồi bấm Lưu. Nhân viên thấy lịch ca và chấm công trong mục Của tôi. Không sửa được ngày thuộc kỳ công đã khoá."
        actions={<Link href={`/cham-cong?center=${centerId}`} className="btn-ghost">← Bảng công</Link>}
      />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong/phan-ca">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        <input type="date" name="week" defaultValue={r.weekStart} className="input w-auto" />
        <button className="btn-ghost">Xem</button>
        <Link className="btn-ghost" href={href(shiftDays(-7))}>‹ Tuần trước</Link>
        <Link className="btn-ghost" href={href(today)}>Tuần này</Link>
        <Link className="btn-ghost" href={href(shiftDays(7))}>Tuần sau ›</Link>
      </form>
      {r.lockedPeriod && <div className="rounded-xl bg-slate-100 p-3 text-sm">Tuần này có ngày thuộc kỳ công {r.lockedPeriod} đã khoá — không sửa ca.</div>}
      <RosterEditor
        key={`${centerId}${r.weekStart}`}
        centerId={centerId}
        weekStart={r.weekStart}
        dates={r.dates}
        rows={r.rows.map((x) => ({ id: x.id, code: x.code, fullName: x.fullName, title: x.title, status: x.status, days: x.days.map((d) => ({ date: d.date, shiftId: d.shift?.id ?? "", status: d.status, leave: d.requests.some((q) => q.kind === "leave" && q.status === "approved") })) }))}
        shifts={r.shifts.filter((s) => s.isActive).map((s) => ({ id: s.id, code: s.code, name: s.name, startTime: s.startTime, endTime: s.endTime }))}
        canEdit={r.canEdit && !r.lockedPeriod}
        today={today}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ShiftTemplates centerId={centerId} shifts={r.shifts} canConfigure={r.canConfigure} />
        {r.center && <GeofenceEditor centerId={centerId} lat={r.center.latitude} lng={r.center.longitude} radius={r.center.checkinRadiusM} canConfigure={r.canConfigure} />}
      </div>
    </div>
  );
}
