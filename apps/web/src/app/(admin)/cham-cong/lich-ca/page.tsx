import { REQUEST_KIND_VI, REQUEST_KINDS, LEAVE_TYPE_VI, centersWith, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { DayChip, dmy, hm, units, wdOf } from "@/components/hr-ui";
import { PunchCard } from "./self";
import { MyRequests, type MyRequestRow } from "./my-requests";
import { RequestForm } from "@/components/request-form";
import { TimesheetTabs } from "../tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch ca & công của tôi" };

/** "2026-10" ± n tháng */
function shiftMonth(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  // Chip quản lý chấm công chỉ cho người có quyền xem bảng công; giáo viên / nhân viên chỉ thấy phần "của tôi"
  const qlCong = !!ctx.actor && (() => { const c = centersWith(ctx.actor as Actor, "timesheet:read"); return c === null || c.length > 0; })();
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period : undefined;
  const d = await caller.hr.me({ period });
  if (!d.staff) {
    return (
      <div className="space-y-4">
        <PageHeader title="Lịch ca & công của tôi" />
        <Empty>Tài khoản của bạn chưa gắn hồ sơ nhân sự — liên hệ bộ phận nhân sự để được phân ca và chấm công.</Empty>
      </div>
    );
  }
  const s = d.summary;
  const worked = d.month.filter((c) => c.shift && ["present", "late", "early", "late_early", "override"].includes(c.status)).length;
  const attention = d.month.filter((c) => c.lateMin > 0 || c.earlyMin > 0 || ["absent", "missing_in", "missing_out"].includes(c.status)).length;
  const rows: MyRequestRow[] = d.requests.map((r) => ({
    id: r.id, kind: r.kind, kindLabel: `${REQUEST_KIND_VI[r.kind]}${r.leaveType ? ` · ${LEAVE_TYPE_VI[r.leaveType]}` : ""}`, status: r.status,
    when: `${dmy(r.dateFrom)}${r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}${r.portion && r.portion !== "full" ? (r.portion === "am" ? " (sáng)" : " (chiều)") : ""}${r.days ? ` · ${units(r.days)} ngày` : ""}${r.minutes ? ` · ${r.minutes}′` : ""}${r.destination ? ` · ${r.destination}` : ""}${r.punchIn ? ` · vào ${r.punchIn}` : ""}${r.punchOut ? ` · ra ${r.punchOut}` : ""}`,
    reason: r.reason ?? "", late: !!r.lateSubmission, effect: r.effectPreview ?? null, note: r.decisionNote ?? null, applyError: r.applyError ?? null,
  }));
  return (
    <div className="space-y-4">
      <PageHeader title="Lịch ca & công của tôi" desc={`${d.staff.fullName} · ${d.staff.code} · ${d.staff.title}${d.center ? ` · ${d.center.code}` : ""}`} />
      {qlCong && <TimesheetTabs active="cua-toi" />}
      <PunchCard
        today={d.today}
        cell={d.todayCell ? { status: d.todayCell.status, shift: d.todayCell.shift, inMin: d.todayCell.inMin, outMin: d.todayCell.outMin, lateMin: d.todayCell.lateMin, openFlags: d.todayCell.openFlags } : null}
        punches={d.punches.map((p) => ({ kind: p.kind, at: p.at.toISOString(), distanceM: p.distanceM, source: p.source }))}
      />

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Lịch ca 2 tuần</h2>
        {/* Điện thoại: mỗi ngày một dòng (không phải cuộn ngang, không bị cắt cột); từ sm: lưới 7 cột theo tuần */}
        <div className="-mx-1 px-1 pb-1 sm:overflow-x-auto">
        <div className="grid grid-cols-1 gap-1 text-xs sm:min-w-[560px] sm:grid-cols-7">
          {d.weeks.map((c) => (
            <div key={c.date} className={`flex items-center justify-between gap-3 rounded-lg border p-1.5 sm:block ${c.date === d.today ? "border-brand-400 bg-brand-50" : "border-black/5"}`}>
              <div className="text-ink-400">{wdOf(c.date)} {dmy(c.date).slice(0, 5)}{c.date === d.today && <span className="ml-1 font-semibold text-brand-700 sm:hidden">· hôm nay</span>}</div>
              <div className="text-right sm:text-left">
                {c.shift ? <div className="font-medium">{c.shift.code} <span className="font-normal tabular-nums">{c.shift.clock}</span></div> : <div className="text-ink-300">Nghỉ</div>}
                {c.holidayName && <div className="text-violet-700">{c.holidayName}</div>}
                {c.requests.filter((r) => r.kind === "leave" && r.status !== "cancelled").map((r) => <div key={r.id} className="text-sky-700">Nghỉ phép {r.status === "pending" ? "(chờ)" : ""}</div>)}
              </div>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Công tháng {d.period.split("-").reverse().join("/")}{d.period === d.today.slice(0, 7) && <span className="ml-2 chip bg-amber-100 text-amber-800">Tạm tính tới {dmy(d.today).slice(0, 5)}</span>}</h2>
          <div className="flex items-center gap-1">
            <a href={`/cham-cong/lich-ca?period=${shiftMonth(d.period, -1)}`} className="btn-ghost !min-h-10 !py-1" aria-label="Tháng trước">‹</a>
            <a href="/cham-cong/lich-ca" className="btn-ghost !min-h-10 !py-1">Tháng này</a>
            <a href={`/cham-cong/lich-ca?period=${shiftMonth(d.period, 1)}`} className="btn-ghost !min-h-10 !py-1" aria-label="Tháng sau">›</a>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Số ca</div><b>{s.scheduled}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Công</div><b>{units(s.workUnits)}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Phép / KL</div><b>{units(s.paidLeave)} / {units(s.unpaidLeave)}</b></div>
          <div className="rounded-xl bg-brand-50 p-2"><div className="text-xs text-ink-400">Tính lương</div><b className="text-brand-700">{units(s.payableUnits)}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Ngày đã đi làm</div><b>{worked}</b><span className="text-xs text-ink-400"> / {s.scheduled}</span></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đi muộn</div><b>{s.lateCount ? `${s.lateCount} lần · ${s.lateMin}′` : "—"}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Về sớm</div><b>{s.earlyCount ? `${s.earlyCount} lần · ${s.earlyMin}′` : "—"}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Phép năm còn</div><b>{units(d.leave.remaining)}</b><span className="text-xs text-ink-400"> / {units(d.leave.entitled)}</span></div>
        </div>
        <details className="group" open={attention > 0}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-semibold text-ink-600">Chi tiết từng ngày{attention > 0 && <span className="chip bg-amber-100 text-amber-800">{attention} ngày cần xử lý</span>}</summary>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <tbody className="divide-y divide-black/5">
            {d.month.filter((c) => c.shift || c.status !== "off").map((c) => (
              <tr key={c.date}>
                <td className="p-1.5 text-xs">{wdOf(c.date)} {dmy(c.date)}</td>
                <td className="p-1.5 text-xs">{c.shift ? `${c.shift.code} ${c.shift.clock}` : "—"}</td>
                <td className="p-1.5 text-xs tabular-nums">{hm(c.inMin)} – {hm(c.outMin)}</td>
                <td className="p-1.5"><DayChip status={c.status} />{c.lateMin > 0 && <span className="ml-1 text-xs text-amber-700">muộn {c.lateMin}′</span>}{c.earlyMin > 0 && <span className="ml-1 text-xs text-amber-700">sớm {c.earlyMin}′</span>}</td>
                <td className="p-1.5 text-right text-xs tabular-nums">{units(c.units + c.paidLeave + c.holidayUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </details>
      </section>

      <RequestForm />

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Đơn của tôi</h2>
        <MyRequests rows={rows} kinds={REQUEST_KINDS.map((k) => ({ key: k, label: REQUEST_KIND_VI[k] }))} />
      </section>
    </div>
  );
}
