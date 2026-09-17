import { getServerCaller } from "@/lib/trpc/server";
import { LeadDetail } from "./detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const [assignees, ref] = await Promise.all([caller.admissions.leads.assigneeOptions({}), caller.academics.classes.referenceData()]);
  return (
    <LeadDetail
      id={id}
      assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName, centerId: a.centerId }))}
      centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
    />
  );
}
