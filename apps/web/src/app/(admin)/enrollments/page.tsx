import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Pager, StatTabs, EnrollmentChip, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký học" };

const ST = ["trial", "active", "paused", "completed", "withdrawn"] as const;
type St = (typeof ST)[number];

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; center?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = ST.includes(sp.status as St) ? (sp.status as St) : undefined;
  const { caller } = await getServerCaller();
  const [ref, d] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.students.enrollments({ q: sp.q || undefined, centerId: sp.center || undefined, status, page: Number(sp.page) || 1 }),
  ]);
  const c = d.counts;
  return (
    <div className="space-y-4">
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
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã HV / mã lớp…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]"><option value="">Mọi cơ sở</option>{ref.centers.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Không có đăng ký phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Tiến độ</th><th className="p-3">Ghi danh</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((e) => (
                <tr key={e.id}>
                  <td className="p-3"><Link href={`/students/${e.studentId}`} className="font-medium text-brand-600">{e.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{e.studentCode}</div></td>
                  <td className="p-3"><Link href={`/classes/${e.classId}`} className="hover:underline">{e.classCode}</Link><div className="text-xs text-ink-400">{e.courseCode} · {e.centerCode}</div></td>
                  <td className="p-3 min-w-[160px]">
                    <div className="text-xs">{e.consumed}/{e.packageSessions} · còn <b className={e.remaining <= 4 && e.status === "active" ? "text-red-700" : ""}>{e.remaining}</b></div>
                    <div className="mt-1 h-1.5 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (e.consumed / Math.max(1, e.packageSessions)) * 100)}%` }} /></div>
                  </td>
                  <td className="p-3 text-xs">{fmtDate(e.enrolledAt)}{e.endedAt ? <div className="text-ink-400">kết thúc {fmtDate(e.endedAt)}</div> : null}</td>
                  <td className="p-3"><EnrollmentChip status={e.status} />{e.status === "paused" && <div className="text-[11px] text-ink-400">{e.pauseUntil ? `đến ${fmtDate(e.pauseUntil)}` : "chưa hẹn ngày trở lại"}</div>}</td>
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
