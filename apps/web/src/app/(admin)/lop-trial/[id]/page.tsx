import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess } from "@/components/admin-ui";
import { TrialClassDetail } from "./detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết lớp trải nghiệm" };

export default async function TrialClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pdg?: string }> }) {
  const { id } = await params;
  const { pdg } = await searchParams;
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "trials:view")) return <NoAccess title="Chi tiết lớp trải nghiệm" perm="trials:view" />;
  return <TrialClassDetail id={id} openReport={pdg} />;
}
