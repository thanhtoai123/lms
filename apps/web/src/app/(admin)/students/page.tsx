import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, Pager, StudentStatusChip, STUDENT_STATUS_VI, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học viên" };

const STATUSES = ["prospect", "trial", "active", "paused", "alumni", "withdrawn"] as const;
type St = (typeof STATUSES)[number];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; center?: string; status?: string; grade?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as St) ? (sp.status as St) : undefined;
  const g = Number(sp.grade);
  const grade = Number.isInteger(g) && g >= 1 && g <= 12 ? g : undefined;
  const { caller } = await getServerCaller();
  const [ref, data] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.students.list({ q: sp.q || undefined, centerId: sp.center || undefined, status, grade, page: Number(sp.page) || 1 }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Học viên"
        desc="Hồ sơ học viên theo cơ sở. Tìm theo tên, mã học viên hoặc SĐT phụ huynh."
        actions={<><Link href="/enrollments/new" className="btn-ghost">Ghi danh</Link><Link href="/students/new" className="btn-primary">+ Thêm học viên</Link></>}
      />
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tên / mã HV / tên hoặc SĐT phụ huynh…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STUDENT_STATUS_VI[s]}</option>)}
        </select>
        <select name="grade" defaultValue={grade ? String(grade) : ""} className="input max-w-[140px]">
          <option value="">Mọi khối lớp</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Lớp {n}</option>)}
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>Không có học viên phù hợp.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Học viên</th><th className="p-3">Lớp / trường</th><th className="p-3">Ngày sinh</th><th className="p-3">Phụ huynh</th><th className="p-3">Cơ sở</th><th className="p-3">Lớp đang học</th><th className="p-3">Trạng thái</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {data.items.map((s) => (
                <tr key={s.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/students/${s.id}`} className="font-medium text-brand-600">{s.fullName}</Link><div className="font-mono text-[11px] text-ink-400">{s.code}</div></td>
                  <td className="p-3">{s.grade ? `Lớp ${s.grade}` : "—"}<div className="text-xs text-ink-400">{s.school ?? ""}</div></td>
                  <td className="p-3 text-xs">{fmtDate(s.dateOfBirth)}</td>
                  <td className="p-3">{s.parentName ?? "—"}<div className="font-mono text-[11px] text-ink-400">{s.parentPhone ?? ""}</div></td>
                  <td className="p-3">{s.centerCode ?? "—"}</td>
                  <td className="p-3 text-xs">{s.classes ?? <span className="text-ink-400">—</span>}</td>
                  <td className="p-3"><StudentStatusChip status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/students" params={sp} page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
