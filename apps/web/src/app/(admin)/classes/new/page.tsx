import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NewClassForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mở lớp mới" };

export default async function NewClassPage() {
  const { caller, ctx } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const canApprove = !!ctx.actor && hasPermission(ctx.actor as Actor, "class:approve");
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Mở lớp mới</h1>
      <p className="text-sm text-ink-600">Nhập kế hoạch lịch trong tuần. Lớp đi theo luồng <b>Nháp → Chờ duyệt → Tuyển sinh</b>: khi được duyệt, hệ thống tự sinh toàn bộ buổi theo giáo trình, bỏ ngày nghỉ và chặn trùng phòng / giáo viên.</p>
      <NewClassForm ref_={ref} canApprove={canApprove} />
    </div>
  );
}
