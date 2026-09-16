import { getServerCaller } from "@/lib/trpc/server";
import { StudentForm } from "@/components/student-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm học viên" };

export default async function NewStudentPage() {
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Thêm học viên</h1>
      <StudentForm centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />
    </div>
  );
}
