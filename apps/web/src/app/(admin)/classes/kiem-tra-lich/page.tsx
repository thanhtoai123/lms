import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { fmtDate, Empty } from "@/components/ui";
import { ReanchorButton } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kiểm tra lịch buổi học" };

export default async function ScheduleCheckPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [ref, data] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.academics.classes.scheduleDriftAll({ centerId: sp.center || null }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kiểm tra lịch buổi học"
        desc="Đối chiếu dãy buổi đã sinh với ngày khai giảng + lịch học (đã trừ ngày nghỉ và ca của buổi đã huỷ). Chỉ liệt kê lớp lệch."
        actions={<Link href="/classes" className="btn-ghost">← Lớp học</Link>}
      />
      <form className="flex flex-wrap items-center gap-2">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Lọc</button>
        <span className="text-sm text-ink-600">Đã kiểm tra {data.checked} lớp đang tuyển sinh / đang chạy · <b>{data.items.length}</b> lớp lệch</span>
      </form>

      {data.items.length === 0 ? (
        <Empty>Mọi lớp đều khớp lịch.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Lớp</th><th className="p-3">Vấn đề</th><th className="p-3">Khai giảng</th><th className="p-3">Buổi 1 hiện tại</th><th className="p-3">Buổi 1 đúng lịch</th><th className="p-3">Buổi lệch</th><th className="p-3">Xử lý</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {data.items.map((c) => (
                <tr key={c.classId} className="align-top hover:bg-brand-50/40">
                  <td className="p-3">
                    <Link href={`/classes/${c.classId}`} className="font-medium text-brand-700">{c.name}</Link>
                    <div className="text-xs text-ink-400">{c.code} · {c.centerCode} · {c.regularCount} buổi</div>
                  </td>
                  <td className="p-3">
                    <div className="max-w-md text-xs">{c.headline}</div>
                    {c.issues.length > 1 && <div className="text-[11px] text-ink-400">+{c.issues.length - 1} điểm lệch khác</div>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">{c.startDate ? fmtDate(c.startDate) : "—"}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{c.firstDate ? fmtDate(c.firstDate) : "—"}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{c.expectedFirstDate ? fmtDate(c.expectedFirstDate) : "—"}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{c.mismatched}</td>
                  <td className="p-3">{c.canReanchor ? <ReanchorButton classId={c.classId} code={c.code} /> : <span className="text-xs text-ink-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
