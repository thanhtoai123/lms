import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";

export default async function Home() {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  const roles = me.assignments.map((a) => a.role);
  // Chỉ giáo viên/trợ giảng thuần tuý vào app giáo viên; mọi vai trò quản trị vào /dashboard
  const teacherOnly = roles.every((r) => r === "TEACHER" || r === "ASSISTANT_TEACHER");
  redirect(teacherOnly ? "/teacher" : "/dashboard");
}
