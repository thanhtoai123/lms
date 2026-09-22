import Link from "next/link";
import { notFound } from "next/navigation";
import { REPORT_CARD_STATUS_VI, type ReportCardStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { MilestoneCard } from "@/components/portfolio/milestone-card";
import { CenterFooter } from "@/components/portfolio/parts";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PrintButton } from "@/components/portfolio/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "In học bạ mốc", robots: { index: false } };

/** Trang in NỘI BỘ một học bạ mốc (A4). Quyền: report_card:read tại cơ sở (GV: lớp mình). */
export default async function MilestonePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const r = await caller.portfolio.milestone({ id }).catch((e: { message?: string; code?: string; data?: { code?: string } }) => ({
    error: e?.message ?? "Không mở được học bạ",
    missing: e?.data?.code === "NOT_FOUND" || e?.code === "NOT_FOUND",
  }));
  if ("error" in r) {
    if (r.missing) notFound();
    return <div className="card p-6 text-sm">{r.error}</div>;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PortfolioPrintStyle />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/report-cards/${r.enrollmentId}/${r.milestoneSeq}`} className="text-sm text-ink-600">← Học bạ {r.studentName}</Link>
        <div className="flex items-center gap-2">
          <span className="chip bg-muted text-foreground">{REPORT_CARD_STATUS_VI[r.status as ReportCardStatus] ?? r.status}</span>
          <PrintButton />
        </div>
      </div>
      {r.status !== "published" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200 print:hidden">Học bạ chưa gửi phụ huynh — bản in chỉ dùng nội bộ.</p>
      )}
      <div className="hs-doc">
        <MilestoneCard card={r} standalone />
        <div className="mt-3 overflow-hidden rounded-2xl border border-border print:rounded-none print:border-0"><CenterFooter center={r.center} /></div>
      </div>
    </div>
  );
}
