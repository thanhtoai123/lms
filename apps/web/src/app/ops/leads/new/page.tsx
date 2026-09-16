import { getServerCaller } from "@/lib/trpc/server";
import { NewLeadForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold">Thêm lead</h1>
      <NewLeadForm centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />
    </div>
  );
}
