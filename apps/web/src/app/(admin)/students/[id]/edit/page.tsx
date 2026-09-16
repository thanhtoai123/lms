import { getServerCaller } from "@/lib/trpc/server";
import { StudentForm } from "@/components/student-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sửa học viên" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const [ref, s] = await Promise.all([caller.academics.classes.referenceData(), caller.students.get({ id })]);
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Sửa: {s.fullName}</h1>
      <StudentForm
        studentId={s.id}
        centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        initial={{
          fullName: s.fullName, nickname: s.nickname ?? "", dateOfBirth: s.dateOfBirth ?? "", gender: (s.gender ?? "") as "" | "male" | "female" | "other",
          grade: s.grade ? String(s.grade) : "", school: s.school ?? "", homeCenterId: s.homeCenterId ?? ref.centers[0]?.id ?? "", status: s.status,
          healthNotes: s.healthNotes ?? "", interests: s.interests ?? "", notes: s.notes ?? "",
        }}
      />
    </div>
  );
}
