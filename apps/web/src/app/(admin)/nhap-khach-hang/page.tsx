import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { NewLeadForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập khách hàng" };

export default async function NewLeadPage() {
  const { caller } = await getServerCaller();
  const [ref, assignees] = await Promise.all([caller.academics.classes.referenceData(), caller.admissions.leads.assigneeOptions({})]);
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">Nhập khách hàng</h1>
        <Link href="/leads/import" className="text-sm text-brand-600 hover:underline">Nhập nhiều khách từ file →</Link>
      </div>
      <NewLeadForm
        centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        courses={ref.courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        assignees={[...new Map(assignees.map((a) => [a.id, { id: a.id, fullName: a.fullName }] as const)).values()]}
      />
    </div>
  );
}
