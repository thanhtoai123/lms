import Link from "next/link";
import { hasPermission, AUDIT_STATUSES, AUDIT_STATUS_VI, type Actor, type AuditStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { NewAudit } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kiểm kê kho" };
const AUDIT_CHIP: Record<AuditStatus, string> = { draft: "bg-blue-100 text-blue-700", submitted: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", cancelled: "bg-slate-100 text-slate-500" };

export default async function AuditListPage({ searchParams }: { searchParams: Promise<{ status?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "inventory:read")) return <NoAccess title="Kiểm kê kho" perm="inventory:read" />;
  const status = AUDIT_STATUSES.includes(sp.status as AuditStatus) ? (sp.status as AuditStatus) : undefined;
  const d = await caller.inventory.audits({ status, centerId: sp.center || undefined });
  const creatable = d.centers.filter((c) => c.canCreate);
  return (
    <div className="space-y-4">
      <PageHeader title="Kiểm kê kho" desc="Chụp số tồn sổ sách → đếm thực tế → nộp → quản lý (khác người nộp) duyệt → hệ thống tự lập phiếu điều chỉnh chênh lệch. Chênh lệch lớn bắt buộc ghi nguyên nhân." actions={creatable.length ? <NewAudit centers={creatable.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))} /> : null} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/inventory/audit" className={`chip ${!status ? "bg-brand-600 text-white" : "bg-black/5"}`}>Tất cả</Link>
        {AUDIT_STATUSES.map((s) => <Link key={s} href={`/inventory/audit?status=${s}`} className={`chip ${status === s ? "bg-brand-600 text-white" : "bg-black/5"}`}>{AUDIT_STATUS_VI[s]}</Link>)}
      </div>
      {d.items.length === 0 ? <Empty>Chưa có phiếu kiểm kê.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Phiếu</th><th className="p-3">Cơ sở</th><th className="p-3">Tiến độ đếm</th><th className="p-3">Dòng chênh lệch</th><th className="p-3">Trạng thái</th><th className="p-3">Người lập</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((a) => (
                <tr key={a.id}>
                  <td className="p-3"><Link href={`/inventory/audit/${a.id}`} className="font-mono font-medium text-brand-600">{a.code}</Link><div className="text-xs text-ink-400">{dtVN(a.createdAt)}</div></td>
                  <td className="p-3">{a.centerCode}</td>
                  <td className="p-3 tabular-nums">{a.counted}/{a.lines}</td>
                  <td className={`p-3 tabular-nums ${a.diff ? "font-semibold text-amber-700" : "text-ink-400"}`}>{a.diff}</td>
                  <td className="p-3"><span className={`chip ${AUDIT_CHIP[a.status as AuditStatus]}`}>{AUDIT_STATUS_VI[a.status as AuditStatus]}</span></td>
                  <td className="p-3 text-xs">{a.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
