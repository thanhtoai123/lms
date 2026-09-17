import Link from "next/link";
import { AUDIT_STATUS_VI, type AuditStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { vnd } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { Kpi } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { CountSheet, AuditActions } from "./sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phiếu kiểm kê" };
const CHIP: Record<AuditStatus, string> = { draft: "bg-blue-100 text-blue-700", submitted: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", cancelled: "bg-slate-100 text-slate-500" };

export default async function AuditDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const a = await caller.inventory.audit({ id });
  const s = a.summary;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Kiểm kê ${a.code}`}
        desc={`${a.centerCode} — ${a.centerName}. Lập ${dtVN(a.createdAt)} bởi ${a.createdByName ?? "—"}${a.submittedAt ? ` · nộp ${dtVN(a.submittedAt)} (${a.submittedByName ?? ""})` : ""}${a.approvedAt ? ` · chốt ${dtVN(a.approvedAt)} (${a.approvedByName ?? ""})` : ""}`}
        actions={<div className="flex items-center gap-2"><span className={`chip ${CHIP[a.status as AuditStatus]}`}>{AUDIT_STATUS_VI[a.status as AuditStatus]}</span><Link href="/inventory/audit" className="btn-ghost">← Danh sách</Link></div>}
      />
      {a.note && <p className="rounded-lg bg-black/5 p-3 text-sm">{a.note}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Đã đếm" value={`${s.counted}/${s.total}`} />
        <Kpi label="Dòng chênh lệch" value={s.diffLines} tone={s.diffLines ? "warn" : "good"} />
        <Kpi label="Thừa" value={`+${s.over}`} />
        <Kpi label="Thiếu" value={`-${s.short}`} tone={s.short ? "bad" : "default"} />
        <Kpi label="Giá trị chênh lệch" value={vnd(s.value)} tone={s.value < 0 ? "bad" : "default"} />
      </div>
      <div className="flex justify-end">
        <CsvButton filename={`kiem-ke_${a.code}`} headers={["Mã", "Tên", "ĐVT", "Tồn sổ", "Đếm thực tế", "Chênh lệch", "Ghi chú"]} rows={a.lines.map((l) => [l.sku, l.name, l.unit, l.systemQty, l.countedQty ?? "", l.variance ?? "", l.note ?? ""])} />
      </div>
      <CountSheet id={a.id} editable={a.canCount} lines={a.lines.map((l) => ({ itemId: l.itemId, sku: l.sku, name: l.name, unit: l.unit, systemQty: l.systemQty, currentQty: l.currentQty, countedQty: l.countedQty, note: l.note, movedSince: l.movedSince && a.status !== "approved" }))} />
      <AuditActions id={a.id} status={a.status as AuditStatus} canCount={a.canCount} canApprove={a.canApprove} canManage={a.canManage} />
    </div>
  );
}
