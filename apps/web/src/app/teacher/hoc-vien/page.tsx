import { getServerCaller } from "@/lib/trpc/server";
import { Empty } from "@/components/ui";
import { ClassTabs } from "@/components/teacher/class-tabs";
import { StudentList } from "@/components/teacher/student-list";

export const dynamic = "force-dynamic";

/**
 * HỌC VIÊN CỦA TÔI — mọi học viên các lớp mình phụ trách trong một danh sách: tìm tên / mã, lọc lớp,
 * học thử, cần quan tâm; mỗi dòng có chuyên cần và điểm trung bình. Chạm một em mở hồ sơ (quyền xem theo lớp mình).
 */
export default async function MyStudentsPage() {
  const { caller } = await getServerCaller();
  const d = await caller.teacher.myStudents().catch(() => null);
  return (
    <div className="space-y-4">
      <ClassTabs active="hoc-vien" />
      <div>
        <h1 className="page-title">Học viên của tôi</h1>
        <p className="text-[14px] text-ink-600">Học viên các lớp bạn phụ trách — chạm một em để xem hồ sơ, chuyên cần và học bạ.</p>
      </div>
      {!d || d.students.length === 0 ? <Empty>Chưa có học viên nào trong các lớp bạn phụ trách.</Empty> : <StudentList classes={d.classes} rows={d.students} />}
    </div>
  );
}
