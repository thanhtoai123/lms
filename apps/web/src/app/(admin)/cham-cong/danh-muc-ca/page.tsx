import { hasPermission, authorizeGlobal, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { TimesheetTabs } from "../tabs";
import { ShiftCatalogue } from "./catalogue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mã ca" };

export default async function ShiftCataloguePage({ searchParams }: { searchParams: Promise<{ center?: string; tab?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Mã ca" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const shifts = await caller.hr.shifts({ centerId, includeInactive: true });
  // mã dùng chung (Hội sở): chỉ người có quyền cấu hình ở Hội sở mới tạo / sửa được
  const canShared = authorizeGlobal(ctx.actor as Actor, "timesheet:configure");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mã ca"
        desc="Một mã làm việc = một công/ngày (X, P = 0 công). Ca gãy khai nhiều đoạn giờ; nghỉ giữa giờ có tính công thì đặt “Nghỉ giữa giờ vẫn tính công”. Đổi giờ/số công chỉ áp cho ô xếp SAU khi lưu — lịch đã xếp giữ nguyên. Mã dùng chung (Hội sở) chỉ Hội sở tạo / sửa, cơ sở chỉ xem."
      />
      <TimesheetTabs centerId={centerId} active="danh-muc-ca" />
      <ShiftCatalogue centerId={centerId} centers={ref.centers} shifts={shifts} canShared={canShared} tab={sp.tab === "off" ? "off" : sp.tab === "on" ? "on" : "all"} />
    </div>
  );
}
