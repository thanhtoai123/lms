import { REQUEST_KIND_VI, LEAVE_TYPE_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { DayChip, RequestChip, dmy, hm, units, wdOf } from "@/components/hr-ui";
import { PunchCard, CancelMine } from "./self";
import { RequestForm } from "@/components/request-form";
import { TimesheetTabs } from "../tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch ca & công của tôi" };

export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
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
  return (
    <div className="space-y-4">
      <PageHeader title="Lịch ca & công của tôi" desc={`${d.staff.fullName} · ${d.staff.code} · ${d.staff.title}${d.center ? ` · ${d.center.code}` : ""}`} />
      <TimesheetTabs active="cua-toi" />
      <PunchCard
        today={d.today}
        cell={d.todayCell ? { status: d.todayCell.status, shift: d.todayCell.shift, inMin: d.todayCell.inMin, outMin: d.todayCell.outMin, lateMin: d.todayCell.lateMin, openFlags: d.todayCell.openFlags } : null}
        punches={d.punches.map((p) => ({ kind: p.kind, at: p.at.toISOString(), distanceM: p.distanceM, source: p.source }))}
      />

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Lịch ca 2 tuần</h2>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {d.weeks.map((c) => (
            <div key={c.date} className={`rounded-lg border p-1.5 ${c.date === d.today ? "border-brand-400 bg-brand-50" : "border-black/5"}`}>
              <div className="text-ink-400">{wdOf(c.date)} {dmy(c.date).slice(0, 5)}</div>
              {c.shift ? <div className="font-medium">{c.shift.code} <span className="font-normal tabular-nums">{c.shift.clock}</span></div> : <div className="text-ink-300">Nghỉ</div>}
              {c.holidayName && <div className="text-violet-700">{c.holidayName}</div>}
              {c.requests.filter((r) => r.kind === "leave" && r.status !== "cancelled").map((r) => <div key={r.id} className="text-sky-700">Nghỉ phép {r.status === "pending" ? "(chờ)" : ""}</div>)}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Công tháng {d.period.split("-").reverse().join("/")}</h2>
          <form action="/cham-cong/lich-ca" className="flex gap-1"><input type="month" name="period" defaultValue={d.period} className="input w-auto !py-1" /><button className="btn-ghost !py-1">Xem</button></form>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Số ca</div><b>{s.scheduled}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Công</div><b>{units(s.workUnits)}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Phép / KL</div><b>{units(s.paidLeave)} / {units(s.unpaidLeave)}</b></div>
          <div className="rounded-xl bg-brand-50 p-2"><div className="text-xs text-ink-400">Tính lương</div><b className="text-brand-700">{units(s.payableUnits)}</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đi muộn</div><b>{s.lateCount} lần · {s.lateMin}′</b></div>
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Phép năm còn</div><b>{units(d.leave.remaining)}</b><span className="text-xs text-ink-400"> / {units(d.leave.entitled)}</span></div>
        </div>
        <table className="w-full text-sm">
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
      </section>

      <RequestForm />

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Đơn của tôi</h2>
        {d.requests.length === 0 ? <div className="text-sm text-ink-400">Chưa có đơn.</div> : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/5">
              {d.requests.map((r) => (
                <tr key={r.id}>
                  <td className="p-2">{REQUEST_KIND_VI[r.kind]}{r.leaveType ? ` · ${LEAVE_TYPE_VI[r.leaveType]}` : ""}</td>
                  <td className="p-2 text-xs">{dmy(r.dateFrom)}{r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}{r.portion && r.portion !== "full" ? (r.portion === "am" ? " (sáng)" : " (chiều)") : ""}{r.days ? ` · ${units(r.days)} ngày` : ""}{r.minutes ? ` · ${r.minutes}′` : ""}{r.destination ? ` · ${r.destination}` : ""}{r.punchIn ? ` · vào ${r.punchIn}` : ""}{r.punchOut ? ` · ra ${r.punchOut}` : ""}</td>
                  <td className="p-2 text-xs">{r.reason}{r.lateSubmission && <span className="ml-1 chip bg-amber-100 text-amber-800">Nộp muộn</span>}{r.effectPreview && <div className="text-ink-500">Thay đổi: {r.effectPreview}</div>}{r.decisionNote && <div className="text-amber-800">↳ {r.decisionNote}</div>}{r.applyError && <div className="text-red-700">Lần duyệt gần nhất không áp được: {r.applyError}</div>}</td>
                  <td className="p-2"><RequestChip status={r.status} /></td>
                  <td className="p-2">{r.status === "pending" && <CancelMine id={r.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
