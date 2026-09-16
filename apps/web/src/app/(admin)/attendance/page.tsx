import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { AttendanceGrid } from "./grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm danh" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const opts = await caller.schedule.classOptions();
  const active = opts.filter((c) => c.status === "running" || c.status === "recruiting" || c.status === "finished");
  const classId = sp.class && opts.some((c) => c.id === sp.class) ? sp.class : active.find((c) => c.status === "running")?.id;
  const grid = classId ? await caller.schedule.attendanceGrid({ classId }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Điểm danh" desc="Bảng điểm danh theo lớp. Bấm vào ô để ghi/sửa. Sửa buổi đã qua là sửa hồi tố: bắt buộc lý do, lưu nhật ký và báo giáo viên phụ trách buổi." />
      <form className="flex gap-2">
        <select name="class" defaultValue={classId ?? ""} className="input max-w-md">
          {active.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      {!grid ? <Empty>Chưa có lớp nào đang chạy.</Empty> : <AttendanceGrid data={grid} />}
    </div>
  );
}
