import Link from "next/link";
import { notFound } from "next/navigation";
import { SESSION_EVAL_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { SessionSheet } from "@/components/portfolio/session-sheet";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PrintButton } from "@/components/portfolio/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "In phiếu nhận xét buổi học", robots: { index: false } };

/**
 * Trang in NỘI BỘ một phiếu nhận xét buổi học (khổ A5). Quyền kiểm ở service (`academics.evaluations.sheet`):
 * người dạy buổi đó hoặc người xem được hồ sơ học viên tại cơ sở.
 * Phiếu đã phát hành là bất biến → in lại lúc nào cũng giống hệt lúc phát hành.
 */
export default async function SessionSheetPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const r = await caller.academics.evaluations.sheet({ id }).catch((e: { message?: string; code?: string; data?: { code?: string } }) => ({
    error: e?.message ?? "Không mở được phiếu nhận xét",
    missing: e?.data?.code === "NOT_FOUND" || e?.code === "NOT_FOUND",
  }));
  if ("error" in r) {
    if (r.missing) notFound();
    return <div className="card p-6 text-sm">{r.error}</div>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PortfolioPrintStyle size="A5" />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex gap-3 text-sm">
          <Link href={`/students/${r.studentId}`} className="text-ink-600">← Hồ sơ học viên</Link>
          <Link href={`/teacher/sessions/${r.sessionId}#phieu-nhan-xet`} className="text-ink-600">Buổi học</Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip bg-muted text-foreground">{SESSION_EVAL_STATUS_VI[r.status]}{r.revision > 1 ? ` · đã sửa ${r.revision - 1} lần` : ""}</span>
          <PrintButton />
        </div>
      </div>
      {r.status !== "published" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200 print:hidden">
          Phiếu còn là bản nháp — sẽ được phát hành khi giáo viên hoàn tất buổi học. Bản in có dấu &quot;Bản nháp&quot;.
        </p>
      )}
      <SessionSheet sheet={r} />
    </div>
  );
}
