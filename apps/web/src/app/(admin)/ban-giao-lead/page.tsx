import { getServerCaller } from "@/lib/trpc/server";
import { HandoverForm } from "./form";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  const { caller } = await getServerCaller();
  const [assignees, ref] = await Promise.all([caller.admissions.leads.assigneeOptions({}), caller.academics.classes.referenceData()]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bàn giao lead</h1>
        <p className="text-sm text-ink-600">Chuyển toàn bộ lead đang mở của một sale sang sale khác (nghỉ việc, đổi ca, chiến dịch). Chỉ lead chưa đóng; ghi lý do vào timeline và sổ bàn giao.</p>
      </div>
      <HandoverForm assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))} centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} />
    </div>
  );
}
