import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Pager, StatTabs, EnrollmentChip, fmtDate } from "@/components/admin-ui";
import { ColumnChooser, type ColumnDef } from "@/components/column-chooser";
import { Empty } from "@/components/ui";
import { RememberFilters } from "@/components/remember-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký học" };

const ST = ["trial", "active", "paused", "completed", "withdrawn"] as const;
type St = (typeof ST)[number];

/** Cột của bảng đăng ký học — nút "Cột hiển thị" nhớ lựa chọn theo máy */
const ENROLLMENT_COLUMNS: ColumnDef[] = [
  { key: "student", label: "Học viên", locked: true },
  { key: "class", label: "Lớp" },
  { key: "progress", label: "Tiến độ" },
  { key: "enrolled", label: "Ghi danh" },
  { key: "status", label: "Trạng thái" },
  { key: "actions", label: "Chi tiết", locked: true },
];

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; center?: string; class?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = ST.includes(sp.status as St) ? (sp.status as St) : undefined;
  const { caller } = await getServerCaller();
  const uuidOr = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const [ref, d, classList] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.students.enrollments({ q: sp.q || undefined, centerId: uuidOr(sp.center), classId: uuidOr(sp.class), status, page: Number(sp.page) || 1 }),
    caller.academics.classes.list({ centerId: uuidOr(sp.center) }),
  ]);
  const classOpts = classList.filter((x) => x.status === "running" || x.status === "recruiting" || x.id === sp.class);
  const c = d.counts;
  return (
    <div className="space-y-4">
      <RememberFilters storageKey="enrollments" ignore={["page"]} />
      <PageHeader title="Đăng ký học" desc="Mỗi dòng là một gói học của học viên trong một lớp. Thao tác bảo lưu / nghỉ / đổi số buổi ở hồ sơ học viên." actions={<Link href="/enrollments/new" className="btn-primary">+ Ghi danh</Link>} />
      <StatTabs
        basePath="/enrollments"
        params={sp}
        active={status}
        tabs={[
          { key: "", label: "Tất cả", count: c ? c.trial + c.active + c.paused + c.completed + c.withdrawn : undefined },
          { key: "active", label: "Đang học", count: c?.active },
          { key: "trial", label: "Học thử", count: c?.trial },
          { key: "paused", label: "Bảo lưu", count: c?.paused },
          { key: "completed", label: "Hoàn thành", count: c?.completed },
          { key: "withdrawn", label: "Đã nghỉ", count: c?.withdrawn },
        ]}
      />
      <form className="flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã HV / mã lớp…" className="input max-w-xs" aria-label="Tìm" />
        <select name="class" defaultValue={sp.class ?? ""} className="input max-w-[240px]" aria-label="Lớp"><option value="">Mọi lớp đang chạy</option>{classOpts.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select>
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]" aria-label="Cơ sở"><option value="">Mọi cơ sở</option>{ref.centers.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
        <span className="ml-auto"><ColumnChooser tableKey="enrollments" columns={ENROLLMENT_COLUMNS} /></span>
      </form>
      {d.items.length === 0 ? <Empty>Không có đăng ký phù hợp.</Empty> : (
        <div className="card overflow-x-auto" data-table="enrollments">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3" data-col="student">Học viên</th><th className="p-3" data-col="class">Lớp</th><th className="p-3" data-col="progress">Tiến độ</th><th className="p-3" data-col="enrolled">Ghi danh</th><th className="p-3" data-col="status">Trạng thái</th><th className="p-3" data-col="actions"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((e) => (
                <tr key={e.id}>
                  <td className="p-3" data-col="student"><Link href={`/students/${e.studentId}`} className="font-medium text-brand-600">{e.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{e.studentCode}</div></td>
                  <td className="p-3" data-col="class"><Link href={`/classes/${e.classId}`} className="hover:underline">{e.classCode}</Link><div className="text-xs text-ink-400">{e.courseCode} · {e.centerCode}</div></td>
                  <td className="p-3 min-w-[160px]" data-col="progress">
                    <div className="text-xs">{e.consumed}/{e.packageSessions} · còn <b className={e.remaining <= 4 && e.status === "active" ? "text-red-700" : ""}>{e.remaining}</b></div>
                    <div className="mt-1 h-1.5 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (e.consumed / Math.max(1, e.packageSessions)) * 100)}%` }} /></div>
                  </td>
                  <td className="p-3 text-xs" data-col="enrolled">{fmtDate(e.enrolledAt)}{e.endedAt ? <div className="text-ink-400">kết thúc {fmtDate(e.endedAt)}</div> : null}</td>
                  <td className="p-3" data-col="status"><EnrollmentChip status={e.status} />{e.status === "paused" && <div className="text-[11px] text-ink-400">{e.pauseUntil ? `đến ${fmtDate(e.pauseUntil)}` : "chưa hẹn ngày trở lại"}</div>}</td>
                  <td className="p-3 text-right" data-col="actions"><Link href={`/enrollments/${e.id}`} className="text-xs text-brand-600 underline">Chi tiết</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/enrollments" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
