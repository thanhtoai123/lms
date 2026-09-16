import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { CourseEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khoá học" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string; active?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "course:read")) return <NoAccess title="Khoá học" perm="course:read" />;
  const canEdit = hasPermission(ctx.actor as Actor, "course:update");
  const rows = await caller.catalog.courses({ q: sp.q || undefined, active: sp.active === "1" ? true : sp.active === "0" ? false : undefined });
  const options = rows.map((r) => ({ id: r.id, code: r.code }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Khoá học"
        desc="Khoá dạy (chương trình): mã, độ tuổi, số buổi chuẩn, thời lượng, học phí niêm yết, khoá tiếp theo trong lộ trình. Lớp mới lấy số buổi chuẩn từ đây."
        actions={<><Link href="/course-prerequisites" className="btn-ghost">Khoá tiên quyết</Link><Link href="/curriculums" className="btn-ghost">Giáo trình</Link></>}
      />
      {canEdit && <CourseEditor options={options} />}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Mã / tên khoá…" className="input max-w-xs" />
        <select name="active" defaultValue={sp.active ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          <option value="1">Đang mở</option>
          <option value="0">Ngưng</option>
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {rows.length === 0 ? <Empty>Chưa có khoá học.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Khoá</th><th className="p-3">Lớp (độ tuổi)</th><th className="p-3">Số buổi</th><th className="p-3">Học phí niêm yết</th><th className="p-3">Giáo trình đang dùng</th><th className="p-3">Tiên quyết / tiếp theo</th><th className="p-3">Lớp mở · GV</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {rows.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "text-ink-400"}>
                  <td className="p-3"><div className="font-mono text-xs font-semibold">{c.code}</div><div className="font-medium">{c.name}</div>{c.level && <div className="text-xs text-ink-400">{c.level}</div>}{!c.isActive && <span className="chip bg-slate-100 text-slate-600">Ngưng</span>}</td>
                  <td className="p-3 text-xs">{c.gradeFrom || c.gradeTo ? `Lớp ${c.gradeFrom ?? "?"}–${c.gradeTo ?? "?"}` : "—"}</td>
                  <td className="p-3 tabular-nums">{c.totalSessions} × {c.sessionMinutes}′</td>
                  <td className="p-3 tabular-nums">{c.listPrice.toLocaleString("vi-VN")}đ</td>
                  <td className="p-3 text-xs">{c.activeCurriculum ? <Link href={`/curriculums?course=${c.id}`} className="hover:underline">{c.activeCurriculum}</Link> : <span className="text-amber-700">chưa có</span>}<div className="text-ink-400">{c.curricula} phiên bản</div></td>
                  <td className="p-3 text-xs">{c.prerequisites.length ? <>Cần: {c.prerequisites.join(", ")}</> : "—"}{c.nextCourseCode && <div className="text-ink-400">→ {c.nextCourseCode}</div>}</td>
                  <td className="p-3 tabular-nums text-xs"><Link href={`/classes?q=${c.code}`} className="hover:underline">{c.classes} lớp</Link> · <Link href={`/teachers?course=${c.id}`} className="hover:underline">{c.teachers} GV</Link></td>
                  <td className="p-3">{canEdit && <CourseEditor options={options} course={{ id: c.id, code: c.code, name: c.name, gradeFrom: c.gradeFrom, gradeTo: c.gradeTo, totalSessions: c.totalSessions, sessionMinutes: c.sessionMinutes, listPrice: c.listPrice, nextCourseId: c.nextCourseId, description: c.description, level: c.level, isActive: c.isActive }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
