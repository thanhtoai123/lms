import Link from "next/link";
import { hasPermission, TEACHER_GRADES, TEACHER_GRADE_VI, TEACHER_STATUSES, TEACHER_STATUS_VI, CONTRACT_TYPE_VI, type Actor, type TeacherGrade, type TeacherStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { LOAD_CHIP, TSTATUS_CHIP } from "./chips";
import { RememberFilters } from "@/components/remember-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giáo viên" };

type SP = { q?: string; center?: string; grade?: string; status?: string; course?: string };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "teacher:read")) return <NoAccess title="Giáo viên" perm="teacher:read" />;
  const canCreate = hasPermission(ctx.actor as Actor, "teacher:create");
  const grade = TEACHER_GRADES.includes(sp.grade as TeacherGrade) ? (sp.grade as TeacherGrade) : undefined;
  const status = TEACHER_STATUSES.includes(sp.status as TeacherStatus) ? (sp.status as TeacherStatus) : undefined;
  const [ref, courses, rows] = await Promise.all([
    caller.academics.classes.referenceData(),
    // Bộ lọc "khoá dạy" chỉ là tiện ích: nhân sự (HR) có teacher:read nhưng không có course:read
    // → bỏ bộ lọc thay vì làm hỏng cả trang (trước đây lỗi 500).
    hasPermission(ctx.actor as Actor, "course:read") ? caller.catalog.courseOptions() : Promise.resolve([]),
    caller.catalog.teachers({ q: sp.q || undefined, centerId: sp.center || undefined, grade, status, courseId: sp.course || undefined }),
  ]);
  return (
    <div className="space-y-4">
      <RememberFilters storageKey="teachers" ignore={["page"]} />
      <PageHeader
        title="Giáo viên"
        desc="Hồ sơ giáo viên: ngạch, loại hợp đồng, khoá được dạy, lớp phụ trách, tải dạy tuần này so với định mức, số buổi đã dạy trong tháng và điểm dự giờ."
        actions={canCreate ? <Link href="/teachers/new" className="btn-primary">+ Thêm giáo viên</Link> : null}
      />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã / email…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[200px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="grade" defaultValue={grade ?? ""} className="input max-w-[160px]">
          <option value="">Mọi ngạch</option>
          {TEACHER_GRADES.map((g) => <option key={g} value={g}>{TEACHER_GRADE_VI[g]}</option>)}
        </select>
        {courses.length > 0 && (
          <select name="course" defaultValue={sp.course ?? ""} className="input max-w-[160px]">
            <option value="">Mọi khoá</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        )}
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/teachers" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...TEACHER_STATUSES.map((s) => ({ key: s, label: TEACHER_STATUS_VI[s] }))]} />
      {rows.length === 0 ? <Empty>Không có giáo viên phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Giáo viên</th><th className="p-3">Cơ sở</th><th className="p-3">Ngạch / HĐ</th><th className="p-3">Khoá dạy</th><th className="p-3">Lớp</th><th className="p-3">Tải tuần này</th><th className="p-3">Đã dạy tháng</th><th className="p-3">Dự giờ</th><th className="p-3">Trạng thái</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/teachers/${t.id}`} className="font-medium text-brand-600">{t.fullName}</Link><div className="text-xs text-ink-400">{t.code} {t.title ? `· ${t.title}` : ""}{t.hasAccount ? "" : " · chưa có tài khoản"}</div></td>
                  <td className="p-3">{t.centerCode ?? "Hội sở"}</td>
                  <td className="p-3 text-xs">{t.grade ? TEACHER_GRADE_VI[t.grade as TeacherGrade] ?? t.grade : "—"}<div className="text-ink-400">{CONTRACT_TYPE_VI[t.contractType]}</div></td>
                  <td className="p-3 text-xs">{t.courseCodes ?? <span className="text-ink-400">chưa khai báo</span>}</td>
                  <td className="p-3 tabular-nums">{t.classes}</td>
                  <td className="p-3"><span className={`chip tabular-nums ${LOAD_CHIP[t.loadLevel]}`}>{t.weekLoad}/{t.maxLoadPerWeek}</span></td>
                  <td className="p-3 tabular-nums">{t.taughtMonth}</td>
                  <td className="p-3 tabular-nums">{t.avgScore != null ? `${t.avgScore} ★` : "—"}</td>
                  <td className="p-3"><span className={`chip ${TSTATUS_CHIP[t.workStatus] ?? "bg-black/5"}`}>{TEACHER_STATUS_VI[t.workStatus as TeacherStatus] ?? t.workStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
