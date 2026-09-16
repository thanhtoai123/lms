import { getServerCaller } from "@/lib/trpc/server";
import { NewLeadForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập khách hàng" };

export default async function NewLeadPage() {
  const { caller } = await getServerCaller();
  const [ref, assignees] = await Promise.all([caller.academics.classes.referenceData(), caller.admissions.leads.assigneeOptions({})]);
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Nhập khách hàng (lead)</h1>
      <NewLeadForm centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))} assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))} />
    </div>
  );
}
