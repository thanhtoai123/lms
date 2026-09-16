import { getServerCaller } from "@/lib/trpc/server";
import { CareList } from "./list";

export const dynamic = "force-dynamic";

export default async function CarePage() {
  const { caller } = await getServerCaller();
  const items = await caller.engagement.careTasks({});
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chăm sóc học viên</h1>
        <p className="text-sm text-ink-600">Việc sinh tự động từ rủi ro (nghỉ 2 buổi liên tiếp, chuyên cần thấp, chờ học bù). Không trùng: một rủi ro / một học viên chỉ có một việc đang mở.</p>
      </div>
      <CareList initial={items} />
    </div>
  );
}
