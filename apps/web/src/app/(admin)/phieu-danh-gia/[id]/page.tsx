import Link from "next/link";
import { notFound } from "next/navigation";
import { TRIAL_REPORT_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { TrialReportSheet, TrialReportPrintStyle } from "@/components/trial-report/sheet";
import { PrintButton } from "./print";

export const dynamic = "force-dynamic";
export const metadata = { title: "In phiếu đánh giá học thử", robots: { index: false } };

/**
 * Trang in NỘI BỘ cho nhân sự — in được cả bản nháp chưa phát hành.
 * Quyền kiểm ở service (`trialReports.get`): người xem được phiếu mới in được.
 * Dùng CHUNG component hiển thị với trang phụ huynh.
 */
export default async function TrialReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const r = await caller.admissions.trialReports.get({ id }).catch((e: { message?: string; code?: string; data?: { code?: string } }) => ({
    error: e?.message ?? "Không mở được phiếu đánh giá",
    missing: e?.data?.code === "NOT_FOUND" || e?.code === "NOT_FOUND",
  }));
  if ("error" in r) {
    if (r.missing) notFound();
    return <div className="card p-6 text-sm">{r.error} <Link href="/lop-trial" className="underline">Quay lại</Link></div>;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TrialReportPrintStyle />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/leads/${r.leadId}`} className="text-sm text-ink-600">← Lead của {r.childName}</Link>
        <div className="flex items-center gap-2">
          <span className="chip bg-muted text-foreground">{TRIAL_REPORT_STATUS_VI[r.status]}</span>
          <PrintButton />
        </div>
      </div>
      {r.status !== "published" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200 print:hidden">
          Đây là {r.status === "draft" ? "bản nháp chưa phát hành" : "phiếu đã thu hồi"} — bản in có dấu &quot;{r.status === "draft" ? "Bản nháp" : "Đã thu hồi"}&quot; ở đầu phiếu.
        </p>
      )}
      <TrialReportSheet report={r.view} preview={r.status !== "published"} />
    </div>
  );
}
