import { getServerCaller } from "@/lib/trpc/server";
import { EnrollForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ghi danh" };

export default async function NewEnrollmentPage({ searchParams }: { searchParams: Promise<{ studentId?: string; classId?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [classes, student] = await Promise.all([
    caller.academics.classes.list({}),
    sp.studentId ? caller.students.get({ id: sp.studentId }).catch(() => null) : Promise.resolve(null),
  ]);
  const open = classes.filter((c) => c.status === "recruiting" || c.status === "running" || c.status === "draft");
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Ghi danh vào lớp</h1>
      <EnrollForm
        classes={open.map((c) => ({ id: c.id, code: c.code, name: c.name, centerCode: c.centerCode, courseCode: c.courseCode, enrolled: c.enrolled, capacity: c.capacity, sessionsTotal: c.sessionsTotal, sessionsDone: c.sessionsDone, schedule: c.schedule }))}
        initialStudent={student ? { id: student.id, fullName: student.fullName, code: student.code, grade: student.grade } : null}
        initialClassId={sp.classId}
      />
    </div>
  );
}
