import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { fmtDate, Empty } from "@/components/ui";
import { CLASS_STATUSES, type ClassStatus } from "@satarobo/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp học" };

const STATUS_VI: Record<ClassStatus, string> = { draft: "Nháp", recruiting: "Tuyển sinh", running: "Đang chạy", finished: "Kết thúc", cancelled: "Huỷ" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const status = CLASS_STATUSES.includes(sp.status as ClassStatus) ? (sp.status as ClassStatus) : undefined;
  const { caller } = await getServerCaller();
  const rows = await caller.academics.classes.list({ q: sp.q || undefined, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Lớp học</h1>
        <Link href="/classes/new" className="btn-primary">+ Mở lớp mới</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tìm mã / tên lớp…" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[180px]">
          <option value="">Mọi trạng thái</option>
          {CLASS_STATUSES.map((s) => <option key={s} value={s}>{STATUS_VI[s]}</option>)}
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
                  <td className="p-3">{c.enrolled}/{c.capacity}</td>
                  <td className="p-3 whitespace-nowrap">{c.sessionsDone}/{c.sessionsTotal}{c.sessionsOverdue > 0 && <span className="chip ml-2 bg-red-100 text-red-700">{c.sessionsOverdue} quá hạn</span>}</td>
                  <td className="p-3 whitespace-nowrap">{c.startDate ? fmtDate(c.startDate) : "—"}</td>
                  <td className="p-3"><span className="chip bg-black/5">{STATUS_VI[c.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
