import { getServerCaller } from "@/lib/trpc/server";
import { PageDesc } from "@/components/admin-ui";
import { CareList } from "./list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chăm sóc học viên" };

export default async function CarePage() {
  const { caller } = await getServerCaller();
  const items = await caller.engagement.careTasks({});
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Chăm sóc học viên</h1>
        <PageDesc lead="Việc chăm sóc sinh tự động từ rủi ro của học viên.">Nguồn: nghỉ 2 buổi liên tiếp, chuyên cần thấp, chờ học bù. Không trùng: một rủi ro / một học viên chỉ có một việc đang mở.</PageDesc>
      </div>
      <CareList initial={items} />
    </div>
  );
}
