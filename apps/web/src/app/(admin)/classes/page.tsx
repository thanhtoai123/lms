import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { fmtDate, Empty } from "@/components/ui";
import { CLASS_STATUSES, CLASS_STATUS_VI as STATUS_VI, type ClassStatus } from "@satarobo/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp học" };

const STATUS_CHIP: Record<ClassStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  recruiting: "bg-sky-100 text-sky-800",
  running: "bg-green-100 text-green-800",
  finished: "bg-violet-100 text-violet-800",
  cancelled: "bg-red-100 text-red-700",
};

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; center?: string }> }) {
  const sp = await searchParams;
  const status = CLASS_STATUSES.includes(sp.status as ClassStatus) ? (sp.status as ClassStatus) : undefined;
  const { caller } = await getServerCaller();
  const [rows, ref, approvals] = await Promise.all([
    caller.academics.classes.list({ q: sp.q || undefined, status, centerId: sp.center || undefined }),
    caller.academics.classes.referenceData(),
    caller.academics.classes.pendingApprovals(),
  ]);
  const pending = approvals.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Lớp học</h1>
        <div className="flex gap-2">
          {pending > 0 && <Link href="/classes?status=pending_approval" className="btn-ghost">Chờ duyệt <span className="chip ml-1 bg-amber-100 text-amber-800">{pending}</span></Link>}
          <Link href="/classes/kiem-tra-lich" className="btn-ghost">Kiểm tra lịch buổi</Link>
          <Link href="/classes/new" className="btn-primary">+ Mở lớp mới</Link>
        </div>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tìm mã / tên lớp…" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          {CLASS_STATUSES.map((s) => <option key={s} value={s}>{STATUS_VI[s]}</option>)}
        </select>
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost" type="submit">Lọc</button>
      </form>

      {rows.length === 0 ? (
        <Empty>Chưa có lớp nào.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Lớp</th><th className="p-3">Khoá</th><th className="p-3">Cơ sở / Phòng</th><th className="p-3">Lịch</th><th className="p-3">GV chính</th><th className="p-3">Sĩ số</th><th className="p-3">Tiến độ</th><th className="p-3">Khai giảng</th><th className="p-3">Trạng thái</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-brand-50/40">
                  <td className="p-3"><Link href={`/classes/${c.id}`} className="font-medium text-brand-700">{c.name}</Link><div className="text-xs text-ink-400">{c.code}</div></td>
                  <td className="p-3">{c.courseCode}</td>
                  <td className="p-3">{c.centerCode}{c.roomCode ? ` / ${c.roomCode}` : ""}</td>
                  <td className="p-3 whitespace-nowrap">{c.schedule ?? "—"}</td>
                  <td className="p-3">{c.leadTeacherName ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{c.enrolled}/{c.capacity}{c.enrolled < c.minCapacity && (c.status === "recruiting" || c.status === "running") && <div className="text-[11px] text-amber-700">dưới tối thiểu {c.minCapacity}</div>}</td>
                  <td className="p-3 whitespace-nowrap">{c.sessionsTotal === 0 && (c.status === "draft" || c.status === "pending_approval") ? <span className="text-xs text-ink-400">chưa sinh ({c.plannedSessions ?? "?"} buổi)</span> : <>{c.sessionsDone}/{c.sessionsTotal}</>}{c.sessionsOverdue > 0 && <span className="chip ml-2 bg-red-100 text-red-700">{c.sessionsOverdue} quá hạn</span>}</td>
                  <td className="p-3 whitespace-nowrap">{c.startDate ? fmtDate(c.startDate) : "—"}</td>
                  <td className="p-3"><span className={`chip ${STATUS_CHIP[c.status]}`}>{STATUS_VI[c.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
