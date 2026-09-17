import Link from "next/link";
import { hasPermission, STAFF_STATUSES, STAFF_STATUS_VI, DEPARTMENTS, DEPARTMENT_VI, EMPLOYMENT_TYPE_VI, POSITION_KIND_VI, type Actor, type StaffStatus, type Department } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { StaffChip, dmy } from "@/components/hr-ui";
import { CsvButton } from "@/components/csv-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhân sự" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; dept?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "staff:read")) return <NoAccess title="Nhân sự" perm="staff:read" />;
  const status = STAFF_STATUSES.includes(sp.status as StaffStatus) ? (sp.status as StaffStatus) : undefined;
  const dept = DEPARTMENTS.includes(sp.dept as Department) ? (sp.dept as Department) : undefined;
  const [d, ref] = await Promise.all([caller.hr.staff({ status, q: sp.q || undefined, department: dept, centerId: sp.center || undefined }), caller.academics.classes.referenceData()]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhân sự"
        desc="Hồ sơ nhân viên (kể cả giáo viên), vị trí đang giữ, tài khoản đăng nhập. Lương, CCCD, tài khoản ngân hàng chỉ Nhân sự / Kế toán / Quản trị xem."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/nhan-su/vi-tri" className="btn-ghost">Vị trí công việc</Link>
            <CsvButton filename="nhan-su" headers={["Mã", "Họ tên", "Cơ sở", "Bộ phận", "Chức danh", "Loại HĐ", "Trạng thái", "Ngày vào", "Email", "SĐT"]} rows={d.items.map((s) => [s.code, s.fullName, s.centerCode, DEPARTMENT_VI[s.department as Department] ?? s.department, s.title, EMPLOYMENT_TYPE_VI[s.employmentType], STAFF_STATUS_VI[s.status], s.hiredAt, s.email, s.phone])} />
            {d.canCreate && <Link href="/nhan-su/new" className="btn-primary">+ Thêm nhân sự</Link>}
          </div>
        }
      />
      <form className="flex flex-wrap items-end gap-2" action="/nhan-su">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Tên, mã, email, SĐT…" className="input w-56" />
        <select name="dept" defaultValue={dept ?? ""} className="input w-auto"><option value="">Mọi bộ phận</option>{DEPARTMENTS.map((x) => <option key={x} value={x}>{DEPARTMENT_VI[x]}</option>)}</select>
        {ref.centers.length > 1 && <select name="center" defaultValue={sp.center ?? ""} className="input w-auto"><option value="">Mọi cơ sở</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>}
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/nhan-su" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Đang làm" }, ...STAFF_STATUSES.map((s) => ({ key: s, label: STAFF_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Không có nhân sự.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Nhân sự</th><th className="p-3">Bộ phận / chức danh</th><th className="p-3">Vị trí hiện tại</th><th className="p-3">Tài khoản</th><th className="p-3">Ngày vào</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((s) => (
                <tr key={s.id}>
                  <td className="p-3"><Link href={`/nhan-su/${s.id}`} className="font-medium text-brand-700">{s.fullName}</Link><div className="text-xs text-ink-400">{s.code} · {s.centerCode}</div></td>
                  <td className="p-3 text-xs">{DEPARTMENT_VI[s.department as Department] ?? s.department}<div>{s.title} · {EMPLOYMENT_TYPE_VI[s.employmentType]}</div></td>
                  <td className="p-3 text-xs">{s.positions.length === 0 ? <span className="text-amber-700">Chưa có vị trí</span> : s.positions.map((p) => <div key={p.id}>{p.title} <span className="text-ink-400">({POSITION_KIND_VI[p.kind]} · {p.centerCode}{p.effectiveTo ? ` đến ${dmy(p.effectiveTo)}` : ""})</span></div>)}</td>
                  <td className="p-3 text-xs">{s.accountEmail ?? <span className="text-ink-400">Chưa gắn</span>}{s.teacherCode && <div>GV {s.teacherCode}</div>}</td>
                  <td className="p-3 text-xs">{dmy(s.hiredAt)}{s.leftAt && <div>Nghỉ {dmy(s.leftAt)}</div>}</td>
                  <td className="p-3"><StaffChip status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
