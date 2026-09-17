import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { TransferWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lớp / cơ sở" };

export default async function TransferPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [ref, student] = await Promise.all([
    caller.academics.classes.referenceData(),
    sp.studentId ? caller.students.get({ id: sp.studentId }).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title="Chuyển lớp / cơ sở"
        desc="Lớp đích phải cùng khoá và không vượt tiến độ học viên; hết chỗ thì vào danh sách chờ. Yêu cầu được quản lý duyệt, khi duyệt sẽ đóng ghi danh cũ và mở ghi danh mới mang theo số buổi còn lại."
      />
      <TransferWizard
        centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        initialStudent={student ? { id: student.id, fullName: student.fullName, code: student.code, grade: student.grade } : null}
      />
    </div>
  );
}
