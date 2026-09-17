import Link from "next/link";
import { notFound } from "next/navigation";
import { DEPARTMENT_VI, EMPLOYMENT_TYPE_VI, POSITION_KIND_VI, REQUEST_KIND_VI, LEAVE_TYPE_VI, type Department } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { StaffChip, RequestChip, DayChip, dmy, hm, units, wdOf } from "@/components/hr-ui";
import { vnd } from "@/components/finance-ui";
import { StaffForm } from "../form";
import { StatusActions, PositionActions, RevealPrivate } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ nhân sự" };

export default async function StaffDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { caller } = await getServerCaller();
  const s = await caller.hr.staffDetail({ id }).catch(() => null);
  if (!s) notFound();
  if (sp.edit === "1" && s.perms.update && s.status !== "resigned") {
    const ref = await caller.academics.classes.referenceData();
    return (
      <div className="max-w-5xl space-y-4">
        <Link href={`/nhan-su/${s.id}`} className="text-sm text-ink-600">← {s.fullName}</Link>
        <PageHeader title={`Sửa hồ sơ ${s.code}`} />
        <StaffForm
          centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
          canSalary={s.perms.salary}
          current={{ account: s.account ? { id: s.account.id, email: s.account.email } : null, teacher: s.teacher }}
          initial={{
            id: s.id, fullName: s.fullName, email: s.email ?? "", phone: s.phone ?? "", centerId: s.centerId, department: s.department as Department, title: s.title,
            employmentType: s.employmentType, hiredAt: s.hiredAt ?? "", annualLeaveDays: s.annualLeaveDays, notes: s.notes ?? "", userId: s.userId ?? "", teacherId: s.teacherId ?? "", private: null,
          }}
        />
      </div>
    );
  }
  const m = s.month.summary;
  const refCenters = s.perms.update ? (await caller.academics.classes.referenceData()).centers.map((c) => ({ id: c.id, code: c.code })) : [];
  return (
    <div className="space-y-4">
      <Link href="/nhan-su" className="text-sm text-ink-600">← Nhân sự</Link>
      <PageHeader
        title={s.fullName}
        desc={`${s.code} · ${s.title} · ${DEPARTMENT_VI[s.department as Department] ?? s.department} · ${s.center?.code ?? ""}`}
        actions={<div className="flex flex-wrap items-center gap-2"><StaffChip status={s.status} />{s.perms.update && s.status !== "resigned" && <Link href={`/nhan-su/${s.id}?edit=1`} className="btn-ghost">Sửa hồ sơ</Link>}</div>}
      />
      {s.statusReason && <div className="text-sm text-ink-600">Lý do trạng thái: {s.statusReason}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Thông tin</h2>
          <div>Email: {s.email ?? "—"}</div>
          <div>SĐT: {s.phone ?? "—"}</div>
          <div>Loại HĐ: {EMPLOYMENT_TYPE_VI[s.employmentType]}</div>
          <div>Ngày vào: {dmy(s.hiredAt)}{s.leftAt ? ` · nghỉ ${dmy(s.leftAt)}` : ""}</div>
          <div>Tài khoản: {s.account ? `${s.account.email}${s.account.isActive ? "" : " (đã khoá)"}` : <span className="text-amber-700">chưa gắn — không tự chấm công được</span>}</div>
          {s.teacher && <div>Giáo viên: <Link className="text-brand-600" href={`/teachers/${s.teacher.id}`}>{s.teacher.code} {s.teacher.fullName}</Link></div>}
          {s.notes && <div className="text-ink-600">{s.notes}</div>}
          {s.perms.update && s.status !== "resigned" && <StatusActions id={s.id} status={s.status} />}
        </section>
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Giấy tờ & lương</h2>
          {!s.private ? <div className="text-ink-400">Chưa có thông tin.</div> : (
            <>
              <div>CCCD: <span className="font-mono">{s.private.idNumber ?? "—"}</span></div>
              <div>Tài khoản NH: <span className="font-mono">{s.private.bankAccount ?? "—"}</span> {s.private.bankName ?? ""}</div>
              {s.perms.salary ? (
                <>
                  <div>Ngày sinh: {dmy(s.private.birthDate)}</div>
                  <div>MST: {s.private.taxCode ?? "—"} · BHXH: {s.private.insuranceNo ?? "—"}</div>
                  <div>Lương cơ bản: <b>{s.private.baseSalary != null ? vnd(s.private.baseSalary) : "—"}</b> · Phụ cấp: {s.private.allowance != null ? vnd(s.private.allowance) : "—"}</div>
                  {s.private.address && <div>Địa chỉ: {s.private.address}</div>}
                  {s.private.hasIdNumber && <RevealPrivate id={s.id} />}
                </>
              ) : <div className="text-xs text-ink-400">Lương và giấy tờ đầy đủ chỉ Nhân sự / Kế toán xem.</div>}
            </>
          )}
        </section>
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Phép năm {s.leave.year}</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Được hưởng</div><b>{units(s.leave.entitled)}</b></div>
            <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Đã nghỉ</div><b>{units(s.leave.used)}</b></div>
            <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-xs text-ink-400">Chờ duyệt</div><b>{units(s.leave.pending)}</b></div>
            <div className="rounded-xl bg-brand-50 p-2"><div className="text-xs text-ink-400">Còn lại</div><b className="text-brand-700">{units(s.leave.remaining)}</b></div>
          </div>
        </section>
      </div>

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Vị trí công việc</h2></div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Chức danh</th><th className="p-2">Loại</th><th className="p-2">Cơ sở</th><th className="p-2">Hiệu lực</th><th className="p-2"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {s.positions.map((p) => (
              <tr key={p.id} className={p.active ? "" : "text-ink-400"}>
                <td className="p-2">{p.title}{p.note && <div className="text-xs">{p.note}</div>}</td>
                <td className="p-2 text-xs">{POSITION_KIND_VI[p.kind]}</td>
                <td className="p-2 text-xs">{p.centerCode}</td>
                <td className="p-2 text-xs">{dmy(p.effectiveFrom)} → {p.effectiveTo ? dmy(p.effectiveTo) : "nay"}{p.endReason && <div>{p.endReason}</div>}</td>
                <td className="p-2">{s.perms.update && (!p.effectiveTo || p.active) && s.status !== "resigned" && <PositionActions mode="end" positionId={p.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.perms.update && s.status !== "resigned" && <div className="mt-3"><PositionActions mode="add" staffId={s.id} centerId={s.centerId} department={s.department} centers={refCenters} /></div>}
      </section>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Công tháng {s.month.period.split("-").reverse().join("/")}</h2>
          <div className="text-xs text-ink-600">Công: <b>{units(m.workUnits)}</b> · Phép: {units(m.paidLeave)} · KL: {units(m.unpaidLeave)} · Lễ: {units(m.holiday)} · <b>Tính lương: {units(m.payableUnits)}</b> · Muộn {m.lateCount} lần ({m.lateMin}′) · Vắng {m.absentCount} · Thiếu chấm {m.missingCount} · OT {Math.round(m.otMin / 6) / 10}h</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {s.month.days.map((d) => (
            <div key={d.date} className="w-24 rounded-lg border border-black/5 p-1.5 text-[11px]">
              <div className="flex justify-between text-ink-400"><span>{wdOf(d.date)} {d.date.slice(8)}</span><span>{d.shift?.code ?? ""}</span></div>
              {d.shift || d.status !== "off" ? <DayChip status={d.status} /> : <span className="text-ink-300">—</span>}
              {(d.inMin != null || d.outMin != null) && <div className="tabular-nums">{hm(d.inMin)}–{hm(d.outMin)}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Đơn từ gần đây</h2>
        {s.requests.length === 0 ? <div className="text-sm text-ink-400">Chưa có đơn.</div> : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/5">
              {s.requests.map((r) => (
                <tr key={r.id}>
                  <td className="p-2">{REQUEST_KIND_VI[r.kind]}{r.leaveType ? ` · ${LEAVE_TYPE_VI[r.leaveType]}` : ""}</td>
                  <td className="p-2 text-xs">{dmy(r.dateFrom)}{r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}{r.days ? ` · ${units(r.days)} ngày` : ""}{r.minutes ? ` · ${r.minutes} phút` : ""}</td>
                  <td className="p-2 text-xs">{r.reason}</td>
                  <td className="p-2"><RequestChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
