import Link from "next/link";
import { hasPermission, CURRICULUM_STATUSES, CURRICULUM_STATUS_VI, type Actor, type CurriculumStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { NewCurriculum } from "./editor";
import { CUR_CHIP } from "./chips";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chương trình học" };

export default async function CurriculaPage({ searchParams }: { searchParams: Promise<{ course?: string; status?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "curriculum:read")) return <NoAccess title="Chương trình học" perm="curriculum:read" />;
  const canCreate = hasPermission(ctx.actor as Actor, "curriculum:create");
  const status = CURRICULUM_STATUSES.includes(sp.status as CurriculumStatus) ? (sp.status as CurriculumStatus) : undefined;
  const [courses, rows] = await Promise.all([caller.catalog.courseOptions(), caller.catalog.curricula({ courseId: sp.course || undefined, status })]);
  return (
    <div className="space-y-4">
      <PageHeader title="Chương trình học" desc="Giáo trình theo khoá, có phiên bản. Mỗi khoá có một giáo trình “Đang sử dụng” — lớp mới gắn giáo trình này và mỗi buổi nhận bài học tương ứng. Muốn sửa giáo trình đang dùng: nhân bản thành bản nháp, sửa, rồi đưa vào sử dụng." />
      {canCreate && <NewCurriculum courses={courses} />}
      <form className="flex flex-wrap gap-2">
        <select name="course" defaultValue={sp.course ?? ""} className="input max-w-[240px]">
          <option value="">Mọi khoá</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          {CURRICULUM_STATUSES.map((s) => <option key={s} value={s}>{CURRICULUM_STATUS_VI[s]}</option>)}
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {rows.length === 0 ? <Empty>Chưa có giáo trình.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Giáo trình</th><th className="p-3">Khoá</th><th className="p-3">Phiên bản</th><th className="p-3">Số bài / buổi</th><th className="p-3">Lớp đang dùng</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/curriculums/${c.id}`} className="font-medium text-brand-600">{c.name}</Link>{c.description && <div className="text-xs text-ink-400">{c.description}</div>}</td>
                  <td className="p-3"><span className="font-mono text-xs">{c.courseCode}</span></td>
                  <td className="p-3">v{c.version}</td>
                  <td className="p-3 tabular-nums">{c.lessons}/{c.courseSessions}</td>
                  <td className="p-3 tabular-nums">{c.classes}</td>
                  <td className="p-3"><span className={`chip ${CUR_CHIP[c.status] ?? "bg-black/5"}`}>{CURRICULUM_STATUS_VI[c.status as CurriculumStatus] ?? c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
