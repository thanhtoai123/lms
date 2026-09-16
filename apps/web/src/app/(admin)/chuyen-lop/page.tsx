import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { TransferWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lớp / cơ sở" };

export default async function TransferPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [classes, student] = await Promise.all([
    caller.academics.classes.list({}),
    sp.studentId ? caller.students.get({ id: sp.studentId }).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Chuyển lớp / cơ sở" desc="Đóng đăng ký ở lớp hiện tại và mở đăng ký mới ở lớp đích, mang theo số buổi còn lại. Lý do được ghi vào lịch sử và nhật ký." />
      <TransferWizard
        classes={classes.filter((c) => c.status === "recruiting" || c.status === "running").map((c) => ({ id: c.id, code: c.code, name: c.name, centerCode: c.centerCode, courseCode: c.courseCode, enrolled: c.enrolled, capacity: c.capacity, sessionsDone: c.sessionsDone, schedule: c.schedule }))}
        initialStudent={student ? { id: student.id, fullName: student.fullName, code: student.code, grade: student.grade } : null}
      />
    </div>
  );
}
