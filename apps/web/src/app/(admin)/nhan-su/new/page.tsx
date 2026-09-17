import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { StaffForm } from "../form";
import { emptyPrivate } from "../defaults";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm nhân sự" };

export default async function NewStaffPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "staff:create")) return <NoAccess title="Thêm nhân sự" perm="staff:create" />;
  const ref = await caller.academics.classes.referenceData();
  const canSalary = hasPermission(ctx.actor as Actor, "staff:salary");
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/nhan-su" className="text-sm text-ink-600">← Nhân sự</Link>
      <PageHeader title="Thêm nhân sự" desc="Mã NV tự cấp. Hồ sơ mới ở trạng thái Thử việc và có sẵn vị trí chính theo chức danh." />
      <StaffForm
        centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        canSalary={canSalary}
        initial={{ fullName: "", email: "", phone: "", centerId: ref.centers[0]?.id ?? "", department: "sales", title: "", employmentType: "full_time", hiredAt: today, annualLeaveDays: 12, notes: "", userId: "", teacherId: "", private: canSalary ? emptyPrivate : null }}
      />
    </div>
  );
}
