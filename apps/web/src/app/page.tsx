import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";

export default async function Home() {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  const roles = me.assignments.map((a) => a.role);
  if (roles.includes("TEACHER") || roles.includes("ASSISTANT_TEACHER")) redirect("/teacher");
  redirect("/ops");
}
