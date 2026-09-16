import { getServerCaller } from "@/lib/trpc/server";
import { NewClassForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mở lớp mới" };

export default async function NewClassPage() {
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Mở lớp mới</h1>
      <p className="text-sm text-ink-600">Nhập lịch cố định trong tuần — hệ thống tự sinh toàn bộ buổi học theo giáo trình, bỏ qua ngày nghỉ và chặn trùng phòng/giáo viên.</p>
      <NewClassForm ref_={ref} />
    </div>
  );
}
