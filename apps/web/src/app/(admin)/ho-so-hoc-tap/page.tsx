import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { RememberFilters } from "@/components/remember-filters";
import { ComplianceBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý hồ sơ học tập" };

type SP = { center?: string; course?: string; class?: string; teacher?: string; from?: string; to?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * QUẢN LÝ HỒ SƠ HỌC TẬP theo chuẩn thông tin (docs/HO-SO-HOC-TAP.md): một màn hình, không tab.
 * 4 thẻ số → bảng theo GV / theo lớp (chip) → danh sách vi phạm cụ thể, "Nhắc GV" một chạm / hàng loạt.
 * Số liệu tổng hợp bằng SQL ở service `portfolio.standard.board` (phạm vi cơ sở theo quyền report_card:read).
 */
export default async function PortfolioCompliancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report_card:read")) return <NoAccess title="Quản lý hồ sơ học tập" perm="report_card:read" />;
  const id = (v?: string) => (v && UUID.test(v) ? v : null);
  const day = (v?: string) => (v && ISO.test(v) ? v : null);
  const filter = { centerId: id(sp.center), courseId: id(sp.course), classId: id(sp.class), teacherId: id(sp.teacher), from: day(sp.from), to: day(sp.to) };
  const [board, opts] = await Promise.all([
    caller.portfolio.standard.board(filter).catch((e: { message?: string }) => ({ error: e?.message ?? "Không tải được số liệu" })),
    caller.portfolio.standard.options().catch(() => null),
  ]);
  const hasFilter = Object.values(filter).some(Boolean);

  return (
    <div className="space-y-4">
      <RememberFilters storageKey="ho-so-hoc-tap" />
      <PageHeader
        title="Quản lý hồ sơ học tập"
        desc="Theo dõi hồ sơ theo CHUẨN THÔNG TIN bằng tỷ lệ đạt chuẩn — không cần đọc từng phiếu: phiếu đủ trường bắt buộc, hoàn thiện đúng hạn, học bạ mốc đúng lịch, đủ bằng chứng. Dòng dưới 90% tô cảnh báo; một chạm để nhắc giáo viên."
        actions={<Link href="/cau-hinh-van-hanh?tab=ho-so-hoc-tap" className="btn-ghost">Cấu hình chuẩn</Link>}
      />

      <form className="flex flex-wrap items-end gap-2" aria-label="Lọc">
        <select name="center" defaultValue={filter.centerId ?? ""} className="input max-w-[200px]" aria-label="Cơ sở">
          <option value="">Mọi cơ sở</option>
          {opts?.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="course" defaultValue={filter.courseId ?? ""} className="input max-w-[200px]" aria-label="Khoá học">
          <option value="">Mọi khoá</option>
          {opts?.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="class" defaultValue={filter.classId ?? ""} className="input max-w-[200px]" aria-label="Lớp">
          <option value="">Mọi lớp</option>
          {opts?.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <select name="teacher" defaultValue={filter.teacherId ?? ""} className="input max-w-[200px]" aria-label="Giáo viên">
          <option value="">Mọi giáo viên</option>
          {opts?.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="text-xs text-ink-600">Từ ngày<input type="date" name="from" defaultValue={"error" in board ? filter.from ?? "" : board.filter.from} className="input mt-1" /></label>
        <label className="text-xs text-ink-600">Đến ngày<input type="date" name="to" defaultValue={"error" in board ? filter.to ?? "" : board.filter.to} className="input mt-1" /></label>
        <button className="btn-ghost">Lọc</button>
        {hasFilter && <Link href="/ho-so-hoc-tap" className="text-xs text-ink-600 underline">Xoá lọc</Link>}
      </form>

      {"error" in board ? <div className="card p-4 text-sm text-red-700">{board.error}</div> : <ComplianceBoard data={board} />}
    </div>
  );
}
