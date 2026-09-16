import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { AddPrereq, RemovePrereq } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khoá tiên quyết" };

export default async function PrereqPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "course:read")) return <NoAccess title="Khoá tiên quyết" perm="course:read" />;
  const canEdit = hasPermission(ctx.actor as Actor, "course:update");
  const [rows, courses] = await Promise.all([caller.catalog.prerequisites(), caller.catalog.courseOptions()]);
  return (
    <div className="space-y-4">
      <Link href="/courses" className="text-sm text-ink-600">← Khoá học</Link>
      <PageHeader title="Khoá tiên quyết" desc="Học viên phải hoàn thành khoá yêu cầu (có chứng nhận hoặc đăng ký 'Hoàn thành') mới ghi danh / chuyển lớp / chốt vào khoá sau. Quản lý cơ sở có thể miễn kèm lý do (xếp lớp theo năng lực) — được ghi nhật ký." />
      {canEdit && <AddPrereq courses={courses} />}
      {rows.length === 0 ? <Empty>Chưa có điều kiện tiên quyết nào.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Khoá</th><th className="p-3">Phải hoàn thành trước</th><th className="p-3">Ghi chú</th><th className="p-3">Người tạo</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3"><span className="font-mono text-xs font-semibold">{r.courseCode}</span> <span className="text-ink-600">{r.courseName}</span></td>
                  <td className="p-3"><span className="font-mono text-xs font-semibold">{r.requiredCode}</span> <span className="text-ink-600">{r.requiredName}</span></td>
                  <td className="p-3 text-xs">{r.note ?? ""}</td>
                  <td className="p-3 text-xs text-ink-400">{r.createdByName ?? "—"}</td>
                  <td className="p-3 text-right">{canEdit && <RemovePrereq id={r.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
