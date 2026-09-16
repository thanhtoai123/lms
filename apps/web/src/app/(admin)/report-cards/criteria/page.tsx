import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { CourseCriteria } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiêu chí học bạ" };

export default async function CriteriaPage() {
  const { caller, ctx } = await getServerCaller();
  const courses = await caller.learning.criteria();
  const canEdit = hasPermission(ctx.actor as Actor, "report_card:configure");
  return (
    <div className="space-y-4">
      <PageHeader title="Cấu hình tiêu chí năng lực" desc="Mỗi khoá một bộ tiêu chí chấm 1–5 cho học bạ. Tắt tiêu chí thay vì xoá để giữ lịch sử điểm." actions={<Link href="/report-cards" className="btn-ghost">← Học bạ năng lực</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {courses.map((c) => (
          <CourseCriteria key={c.id} canEdit={canEdit} course={{ id: c.id, code: c.code, name: c.name, nextCourseId: c.nextCourseId, milestones: c.milestones }} criteria={c.criteria.map((x) => ({ id: x.id, name: x.name, description: x.description, isActive: x.isActive }))} allCourses={courses.map((x) => ({ id: x.id, code: x.code, name: x.name }))} />
        ))}
      </div>
    </div>
  );
}
