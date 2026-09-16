import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sắp hết khoá" };

export default async function NearingEndPage({ searchParams }: { searchParams: Promise<{ n?: string; center?: string }> }) {
  const sp = await searchParams;
  const n = sp.n !== undefined && sp.n !== "" ? Math.max(0, Math.min(48, Number(sp.n))) : undefined;
  const { caller } = await getServerCaller();
  const [ref, d] = await Promise.all([caller.academics.classes.referenceData(), caller.students.nearingEnd({ threshold: n, centerId: sp.center || undefined })]);
  return (
    <div className="space-y-4">
      <PageHeader title="Sắp hết khoá" desc={`Học viên đang học còn ≤ ${d.threshold} buổi — gọi tư vấn tái tục trước khi hết khoá.`} />
      <form className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Còn ≤</label>
        <input type="number" name="n" min={0} max={48} defaultValue={d.threshold} className="input !w-20" />
        <span className="text-sm">buổi</span>
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]"><option value="">Mọi cơ sở</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Không có học viên nào sắp hết khoá.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Đã học / gói</th><th className="p-3">Còn</th><th className="p-3">Phụ huynh</th><th className="p-3">Tái tục</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((e) => (
                <tr key={e.id} className={e.remaining === 0 ? "bg-red-50/50" : ""}>
                  <td className="p-3"><Link href={`/students/${e.studentId}`} className="font-medium text-brand-600">{e.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{e.studentCode}</div></td>
                  <td className="p-3">{e.classCode}<div className="text-xs text-ink-400">{e.courseCode} · {e.centerCode}</div></td>
                  <td className="p-3 font-mono text-xs">{e.consumed}/{e.packageSessions}</td>
                  <td className={`p-3 font-bold ${e.remaining <= 1 ? "text-red-700" : "text-amber-700"}`}>{e.remaining}</td>
                  <td className="p-3">{e.parentName ?? "—"}<div className="font-mono text-[11px] text-ink-400">{e.parentPhone ?? ""}</div></td>
                  <td className="p-3">{e.renewed ? <span className="chip bg-green-100 text-green-800">Đã có ghi danh mới</span> : <span className="chip bg-amber-100 text-amber-800">Chưa</span>}</td>
                  <td className="p-3"><Link href={`/enrollments/new?studentId=${e.studentId}`} className="btn-ghost !py-1 text-xs">Tái tục</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
