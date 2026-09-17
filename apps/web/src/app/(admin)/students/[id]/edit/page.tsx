import { getServerCaller } from "@/lib/trpc/server";
import { StudentForm } from "@/components/student-form";
import { GUARDIAN_RELATIONS, type GuardianRelation } from "@satarobo/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sửa học viên" };

const asRelation = (r: string): GuardianRelation => ((GUARDIAN_RELATIONS as readonly string[]).includes(r) ? (r as GuardianRelation) : "parent");

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const [ref, s] = await Promise.all([caller.academics.classes.referenceData(), caller.students.get({ id })]);
  const centers = ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  if (s.preferredCenter && !centers.some((c) => c.id === s.preferredCenter!.id)) centers.push(s.preferredCenter);
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Sửa: {s.fullName}</h1>
      <StudentForm
        studentId={s.id}
        centers={centers}
        initial={{
          fullName: s.fullName, nickname: s.nickname ?? "", code: s.code ?? "", dateOfBirth: s.dateOfBirth ?? "", gender: (s.gender ?? "") as "" | "male" | "female" | "other",
          phone: s.phone ?? "", email: s.email ?? "",
          grade: s.grade ? String(s.grade) : "", school: s.school ?? "", interests: s.interests ?? "",
          homeCenterId: s.homeCenterId ?? ref.centers[0]?.id ?? "", preferredCenterId: s.preferredCenterId ?? "", firstEnrolledOn: s.firstEnrolledOn ?? "", notes: s.notes ?? "",
          bloodType: s.bloodType ?? "", allergies: s.allergies ?? [], healthNotes: s.healthNotes ?? "",
          address: { address: s.address?.address ?? "", ward: s.address?.ward ?? "", district: s.address?.district ?? "", city: s.address?.city ?? "" },
        }}
        guardiansInitial={s.guardians.map((g) => ({
          parentId: g.parentId, fullName: g.fullName, phone: g.phone, email: g.email ?? "", relation: asRelation(g.relation),
          mediaConsent: g.mediaConsent, nationalId: "", nationalIdMasked: g.nationalIdMasked,
        }))}
      />
    </div>
  );
}
