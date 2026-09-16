import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { RiskBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cảnh báo rủi ro HV" };

export default async function RiskPage() {
  const { caller } = await getServerCaller();
  const d = await caller.schedule.risks({});
  return (
    <div className="space-y-4">
      <PageHeader title="Cảnh báo rủi ro học viên" desc="Sinh tự động từ điểm danh: nghỉ 2 buổi liên tiếp, chuyên cần dưới 80%, quá 2 buổi chưa học bù. Mỗi rủi ro chỉ có một việc đang mở cho mỗi học viên." />
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-ink-400">Nghỉ liên tiếp</div><div className="text-2xl font-bold text-red-700">{d.byCode.CONSECUTIVE_ABSENCE}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Chuyên cần thấp</div><div className="text-2xl font-bold text-amber-700">{d.byCode.LOW_ATTENDANCE}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Chờ học bù</div><div className="text-2xl font-bold text-violet-700">{d.byCode.PENDING_MAKEUP}</div></div>
      </div>
      <RiskBoard items={d.items} />
    </div>
  );
}
