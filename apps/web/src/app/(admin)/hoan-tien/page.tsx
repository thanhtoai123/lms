import Link from "next/link";
import { hasPermission, REFUND_STATUSES, REFUND_STATUS_VI, type Actor, type RefundStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { RefundChip, vnd, fmtD } from "@/components/finance-ui";
import { RefundRequest, RefundActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoàn tiền" };

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ status?: string; center?: string; enrollment?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Hoàn tiền" perm="finance:read" />;
  const canRequest = hasPermission(ctx.actor as Actor, "finance:create");
  const status = REFUND_STATUSES.includes(sp.status as RefundStatus) ? (sp.status as RefundStatus) : undefined;
  const [d, methods] = await Promise.all([
    caller.finance.refunds({ status, centerId: sp.center || undefined }),
    hasPermission(ctx.actor as Actor, "finance:confirm") ? caller.finance.methods({ activeOnly: true }) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Hoàn tiền" desc="Đề xuất hoàn tính theo buổi: đã thu − (buổi đã học × đơn giá buổi) − đã hoàn. Tư vấn / quản lý đề xuất → quản lý cơ sở duyệt (người đề xuất không tự duyệt) → kế toán chi và ghi sổ." />
      {canRequest && <RefundRequest initialEnrollmentId={sp.enrollment} />}
      <StatTabs basePath="/hoan-tien" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...REFUND_STATUSES.map((s) => ({ key: s, label: REFUND_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Không có yêu cầu hoàn tiền.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên / lớp</th><th className="p-3">Đơn</th><th className="p-3">Buổi đã học</th><th className="p-3 text-right">Đã thu</th><th className="p-3 text-right">Đề xuất / hoàn</th><th className="p-3">Lý do</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((r) => (
                <tr key={r.id}>
                  <td className="p-3">{r.studentName ?? r.customerName}<div className="text-xs text-ink-400">{r.classCode ?? ""} · {r.centerCode}</div></td>
                  <td className="p-3"><Link href={`/orders/${r.orderId}`} className="font-mono text-xs text-brand-600">{r.orderCode}</Link><div className="text-xs text-ink-400">{vnd(r.orderTotal)}</div></td>
                  <td className="p-3 tabular-nums">{r.sessionsUsed}/{r.sessionsTotal}</td>
                  <td className="p-3 text-right tabular-nums">{vnd(r.paid)}</td>
                  <td className="p-3 text-right tabular-nums"><div className="text-xs text-ink-400">{vnd(r.proposedAmount)}</div><b>{vnd(r.amount)}</b></td>
                  <td className="p-3 text-xs">{r.reason}<div className="text-ink-400">{r.requesterName ?? "?"} · {fmtD(r.createdAt)}</div>{r.decisionNote && <div className="text-amber-800">{r.deciderName}: {r.decisionNote}</div>}{r.payoutRef && <div>Mã chi: {r.payoutRef}</div>}</td>
                  <td className="p-3"><RefundChip status={r.status} /></td>
                  <td className="p-3"><RefundActions id={r.id} canApprove={r.canApprove} canPay={r.canPay} methods={methods.filter((m) => !m.centerId || m.centerId === r.centerId).map((m) => ({ id: m.id, name: m.name, kind: m.kind }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
