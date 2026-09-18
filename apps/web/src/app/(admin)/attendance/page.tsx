import Link from "next/link";
import { hasPermission, CLASS_STATUS_VI, CLASS_STATUSES, type Actor, type ClassStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { AttendanceGrid } from "./grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm danh" };

type SP = { class?: string; center?: string; status?: string };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "attendance:read")) return <NoAccess title="Điểm danh" perm="attendance:read" />;
  const uuidOr = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const status = CLASS_STATUSES.includes(sp.status as ClassStatus) ? (sp.status as ClassStatus) : undefined;
  const [ref, overview] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.schedule.attendanceOverview({ centerId: uuidOr(sp.center), status }),
  ]);
  const classId = uuidOr(sp.class);
  const grid = classId ? await caller.schedule.attendanceGrid({ classId }).catch(() => null) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Điểm danh"
        desc="Tổng quan theo lớp: sĩ số, số buổi đã dạy và số buổi chưa chốt điểm danh. Bấm vào lớp để mở lưới điểm danh. Sửa buổi đã qua là sửa hồi tố: bắt buộc lý do, lưu nhật ký và báo giáo viên phụ trách buổi."
      />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Lớp theo dõi" value={overview.totals.classes} />
        <Kpi label="Học viên đang học" value={overview.totals.students} />
        <Kpi label="Buổi chưa chốt điểm danh" value={overview.totals.pending} tone={overview.totals.pending > 0 ? "warn" : undefined} />
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]" aria-label="Cơ sở">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input max-w-[200px]" aria-label="Trạng thái lớp">
          <option value="">Đang tuyển / đang chạy / đã kết thúc</option>
          {CLASS_STATUSES.map((s) => <option key={s} value={s}>{CLASS_STATUS_VI[s]}</option>)}
        </select>
        {classId && <input type="hidden" name="class" value={classId} />}
        <button className="btn-ghost">Lọc</button>
      </form>

      {overview.items.length === 0 ? <Empty>Không có lớp phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Lớp</th><th className="p-3">Cơ sở</th><th className="p-3 text-right">Sĩ số</th><th className="p-3 text-right">Buổi đã dạy</th><th className="p-3 text-right">Chưa chốt</th><th className="p-3">Buổi gần nhất</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {overview.items.map((c) => (
                <tr key={c.id} className={c.id === classId ? "bg-brand-50/60" : ""}>
                  <td className="p-3">
                    <Link href={`/attendance?class=${c.id}${sp.center ? `&center=${sp.center}` : ""}${status ? `&status=${status}` : ""}`} className="font-medium text-brand-600">{c.code}</Link>
                    <div className="text-xs text-ink-400">{c.name} · {c.courseCode} · {CLASS_STATUS_VI[c.status]}</div>
                  </td>
                  <td className="p-3 text-xs">{c.centerCode}</td>
                  <td className="p-3 text-right tabular-nums">{c.students}</td>
                  <td className="p-3 text-right tabular-nums">{c.taught}/{c.sessionsPast}</td>
                  <td className={`p-3 text-right tabular-nums ${c.pending > 0 ? "font-semibold text-amber-700" : "text-ink-400"}`}>
                    {c.pending}
                    {c.oldestPendingDate && <div className="text-[11px] font-normal">từ {c.oldestPendingDate.split("-").reverse().join("/")}</div>}
                  </td>
                  <td className="p-3 text-xs">{c.lastSessionDate ? c.lastSessionDate.split("-").reverse().join("/") : "—"}</td>
                  <td className="p-3 text-right">
                    <Link href={`/attendance?class=${c.id}`} className="btn-ghost !px-2 !py-1 text-xs">Lưới điểm danh</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {classId && (grid
        ? <section className="space-y-2"><h2 className="font-bold">Lưới điểm danh — {grid.class.code} · {grid.class.name}</h2><AttendanceGrid data={grid} /></section>
        : <Empty>Không mở được lưới điểm danh của lớp đã chọn.</Empty>)}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-700" : ""}`}>{value.toLocaleString("vi-VN")}</div>
    </div>
  );
}
