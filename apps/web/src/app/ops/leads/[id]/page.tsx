import { getServerCaller } from "@/lib/trpc/server";
import { LeadDetail } from "./detail";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const [classes, assignees] = await Promise.all([caller.academics.classes.list({}), caller.admissions.leads.assigneeOptions({})]);
  return <LeadDetail id={id} classes={classes.filter((c) => c.status === "recruiting" || c.status === "running").map((c) => ({ id: c.id, code: c.code, name: c.name, centerCode: c.centerCode, enrolled: c.enrolled, capacity: c.capacity }))} assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))} />;
}
