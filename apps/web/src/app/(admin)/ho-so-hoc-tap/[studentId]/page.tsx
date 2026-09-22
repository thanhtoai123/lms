import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { PortfolioDocument } from "@/components/portfolio/portfolio-document";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PortfolioToolbar } from "./toolbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ học tập", robots: { index: false } };

type SP = { enrollmentId?: string; from?: string; to?: string; in?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hồ sơ học tập của một học viên (nhân sự): xem, lọc theo khoá / khoảng ngày, In / Lưu PDF, chia sẻ link.
 * Quyền kiểm ở service `portfolio.get` (student:read tại cơ sở; GV: học viên lớp mình).
 */
export default async function StudentPortfolioPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<SP> }) {
  const { studentId } = await params;
  const sp = await searchParams;
  if (!UUID.test(studentId)) notFound();
  const enrollmentId = sp.enrollmentId && UUID.test(sp.enrollmentId) ? sp.enrollmentId : null;
  const from = sp.from && ISO.test(sp.from) ? sp.from : null;
  const to = sp.to && ISO.test(sp.to) ? sp.to : null;
  const { caller } = await getServerCaller();
  const r = await caller.portfolio.get({ studentId, enrollmentId, from: enrollmentId ? null : from, to: enrollmentId ? null : to }).catch((e: { message?: string; code?: string; data?: { code?: string } }) => ({
    error: e?.message ?? "Không mở được hồ sơ học tập",
    missing: e?.data?.code === "NOT_FOUND" || e?.code === "NOT_FOUND",
  }));
  if ("error" in r) {
    if (r.missing) notFound();
    return <div className="card p-6 text-sm">{r.error} <Link href={`/students/${studentId}`} className="underline">Quay lại</Link></div>;
  }
  const opts = await caller.portfolio.options({ studentId }).catch(() => null);
  const enrollments: { id: string; label: string }[] = opts?.enrollments ?? r.enrollments;
  return (
    <div className="space-y-4">
      <PortfolioPrintStyle />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={`/students/${studentId}`} className="text-sm text-ink-600">← Hồ sơ học viên</Link>
          <h1 className="text-xl font-bold">Hồ sơ học tập · {r.view.student.fullName}</h1>
          <p className="text-xs text-muted-foreground">Phiếu nhận xét từng buổi, học bạ mốc, chứng chỉ và sản phẩm xuyên suốt các khoá. In ra PDF khổ A4 (2 phiếu buổi / trang).</p>
        </div>
        <PortfolioToolbar
          studentId={studentId}
          studentName={r.view.student.fullName}
          enrollments={enrollments.map((e) => ({ id: e.id, label: e.label }))}
          canShare={r.perms.share}
          canExport={r.perms.export}
          autoPrint={sp.in === "1"}
        />
      </div>
      <form className="flex flex-wrap items-end gap-2 print:hidden" aria-label="Lọc hồ sơ">
        <label className="text-xs">Khoá học
          <select name="enrollmentId" defaultValue={enrollmentId ?? ""} className="input mt-1 max-w-[280px]">
            <option value="">Toàn bộ lộ trình</option>
            {enrollments.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="text-xs">Từ ngày<input type="date" name="from" defaultValue={from ?? ""} className="input mt-1" /></label>
        <label className="text-xs">Đến ngày<input type="date" name="to" defaultValue={to ?? ""} className="input mt-1" /></label>
        <button className="btn-ghost">Xem</button>
      </form>
      <PortfolioDocument view={r.view} />
    </div>
  );
}
