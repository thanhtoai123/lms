import Link from "next/link";
import { hasPermission, CURRICULUM_STATUSES, CURRICULUM_STATUS_VI, TH_LEVEL_COLOR, courseLabel, thCourseSpecs, thProgram, type Actor, type CurriculumStatus, type ThSchoolLevel } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { NewCurriculum } from "./editor";
import { CUR_CHIP } from "./chips";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chương trình học" };

/** Thứ tự khoá chuẩn (chuyên ngành → chương trình → năm học → luyện thi) để gom nhóm bảng */
const SPECS = thCourseSpecs();
const SPEC_BY_CODE = new Map(SPECS.map((x, i) => [x.code, { ...x, order: i }] as const));

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
        <select name="course" defaultValue={sp.course ?? ""} className="input max-w-[420px]">
          <option value="">Mọi khoá</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{courseLabel(c.code, c.name)}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          {CURRICULUM_STATUSES.map((s) => <option key={s} value={s}>{CURRICULUM_STATUS_VI[s]}</option>)}
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {rows.length === 0 ? <Empty>Chưa có giáo trình.</Empty> : (() => {
        // Gom theo chương trình: "Lập trình Robotics AI · Tiểu học 8–10 tuổi" → Năm 1, Năm 2, Luyện thi…
        const groups = new Map<string, { title: string; level: ThSchoolLevel | null; order: number; rows: typeof rows }>();
        for (const c of rows) {
          const sp = SPEC_BY_CODE.get(c.courseCode);
          const key = sp?.programCode ?? "_khac";
          const g = groups.get(key) ?? { title: sp?.programTitle ?? "Khoá khác (ngoài danh mục chuẩn)", level: sp ? thProgram(sp.programCode)?.level ?? null : null, order: sp?.order ?? 1e6, rows: [] };
          g.order = Math.min(g.order, sp?.order ?? 1e6);
          g.rows.push(c);
          groups.set(key, g);
        }
        const list = [...groups.values()].sort((a, b) => a.order - b.order);
        for (const g of list) g.rows.sort((a, b) => (SPEC_BY_CODE.get(a.courseCode)?.order ?? 1e6) - (SPEC_BY_CODE.get(b.courseCode)?.order ?? 1e6) || a.courseCode.localeCompare(b.courseCode) || b.version - a.version);
        return (
          <div className="space-y-4">
            {list.map((g) => (
              <section key={g.title} className="card overflow-hidden">
                <h2 className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-slate-50 px-3 py-2 text-sm font-semibold">
                  {g.level && <span className="h-2.5 w-2.5 rounded-full" style={{ background: TH_LEVEL_COLOR[g.level].fg }} aria-hidden />}
                  {g.title}
                  <span className="text-xs font-normal text-ink-400">{g.rows.length} giáo trình</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Khoá học · giáo trình</th><th className="p-3">Mã khoá</th><th className="p-3">Số bài / buổi</th><th className="p-3">Lớp đang dùng</th><th className="p-3">Trạng thái</th></tr></thead>
                    <tbody className="divide-y divide-black/5">
                      {g.rows.map((c) => (
                        <tr key={c.id} className="hover:bg-black/[0.02]">
                          <td className="p-3">
                            <Link href={`/curriculums/${c.id}`} className="font-semibold text-brand-600 hover:underline">{c.courseName}</Link>
                            <div className="text-xs text-ink-600">{c.name} · v{c.version}</div>
                            {c.description && <div className="line-clamp-2 text-xs text-ink-400">{c.description}</div>}
                          </td>
                          <td className="p-3"><span className="font-mono text-xs">{c.courseCode}</span></td>
                          <td className="p-3 tabular-nums">{c.lessons}/{c.courseSessions}</td>
                          <td className="p-3 tabular-nums">{c.classes}</td>
                          <td className="p-3"><span className={`chip ${CUR_CHIP[c.status] ?? "bg-black/5"}`}>{CURRICULUM_STATUS_VI[c.status as CurriculumStatus] ?? c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
