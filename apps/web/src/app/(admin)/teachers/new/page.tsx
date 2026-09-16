import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { TeacherForm } from "../form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm giáo viên" };

export default async function NewTeacherPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "teacher:create")) return <NoAccess title="Thêm giáo viên" perm="teacher:create" />;
  const [ref, courses, accounts] = await Promise.all([caller.academics.classes.referenceData(), caller.catalog.courseOptions(), caller.catalog.linkableAccounts({})]);
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/teachers" className="text-sm text-ink-600">← Giáo viên</Link>
      <PageHeader title="Thêm giáo viên" desc="Mã GV tự cấp (GV001…). Gắn tài khoản đăng nhập có vai trò Giáo viên để GV dùng app chốt buổi." />
      <TeacherForm
        initial={{ fullName: "", email: "", phone: "", title: "Giáo viên", centerId: ref.centers[0]?.id ?? "", grade: "junior", contractType: "part_time", maxLoadPerWeek: 20, hiredAt: "", notes: "", userId: "", courseIds: [] }}
        centers={ref.centers}
        courses={courses}
        accounts={accounts}
      />
    </div>
  );
}
