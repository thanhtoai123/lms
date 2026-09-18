import Link from "next/link";
import { hasPermission, PAYMENT_STATUSES, PAYMENT_STATUS_VI, type Actor, type PaymentStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { PaymentChip, vnd, fmtD } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { ColumnChooser, type ColumnDef } from "@/components/column-chooser";
import { DecidePayment, EditPendingPayment, AdjustConfirmedPayment } from "../orders/[id]/actions";
import { BackfillBatch } from "./backfill";

/** Cột của bảng thanh toán — nút "Cột hiển thị" nhớ lựa chọn theo máy */
const PAYMENT_COLUMNS: ColumnDef[] = [
  { key: "order", label: "Đơn / phiếu thu", locked: true },
  { key: "student", label: "Học viên / PH" },
  { key: "source", label: "Nguồn / sale" },
  { key: "amount", label: "Số tiền" },
  { key: "method", label: "Hình thức · ngày" },
  { key: "people", label: "Người thu / kế toán" },
  { key: "adjust", label: "Số lần điều chỉnh" },
  { key: "status", label: "Trạng thái" },
  { key: "actions", label: "Thao tác", locked: true },
];

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanh toán" };

type SP = { status?: string; center?: string; from?: string; to?: string; q?: string; page?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Thanh toán" perm="finance:read" />;
  const status = PAYMENT_STATUSES.includes(sp.status as PaymentStatus) ? (sp.status as PaymentStatus) : undefined;
  const canConfirm = hasPermission(ctx.actor as Actor, "finance:confirm");
  const [ref, d, backfill] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.finance.payments({ status, centerId: sp.center || undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.q || undefined, page: Number(sp.page) || 1 }),
    canConfirm ? caller.finance.backfillPreview({}).catch(() => null) : Promise.resolve(null),
  ]);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageHeader title="Thanh toán" desc="Luồng hai vai: tư vấn / lễ tân ghi nhận khoản thu → kế toán xác nhận, từ chối hoặc điều chỉnh (người ghi nhận không tự xác nhận). Chỉ khoản đã xác nhận mới có phiếu thu và được trừ công nợ."
        actions={hasPermission(ctx.actor as Actor, "finance:create") ? <><Link href="/cong-no" className="btn-ghost">Công nợ</Link><Link href="/orders?status=pending_payment" className="btn-primary" title="Chọn đơn cần thu rồi bấm Ghi nhận khoản">+ Ghi nhận khoản</Link></> : undefined}
      />
      {backfill && backfill.totals.pending > 0 && <BackfillBatch data={backfill} />}
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Mã đơn / phiếu thu / tên…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[160px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <label className="text-xs text-ink-600">Ngày thu từ<input type="date" name="from" defaultValue={sp.from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">đến<input type="date" name="to" defaultValue={sp.to} className="input mt-1 !py-1.5" /></label>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/payments" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...PAYMENT_STATUSES.map((s) => ({ key: s, label: PAYMENT_STATUS_VI[s], count: d.counts?.[s] }))]} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600">
        <span>{d.total} khoản · đã xác nhận <b className="text-green-700">{vnd(d.sums.confirmed)}</b> · chờ xác nhận <b className="text-amber-700">{vnd(d.sums.recorded)}</b></span>
        <span className="flex flex-wrap items-center gap-2">
        <ColumnChooser tableKey="payments" columns={PAYMENT_COLUMNS} />
        <CsvButton filename="thanh-toan" headers={["Phiếu thu", "Mã đơn", "Khách", "Học viên", "Lớp", "Nguồn HV", "Sale phụ trách", "Số tiền", "Hình thức", "Ngày thu", "Trạng thái", "Số lần điều chỉnh", "Người thu", "Kế toán", "Cơ sở"]}
          rows={d.items.map((p) => [p.receiptNo, p.orderCode, p.customerName, p.studentName, p.classCode, p.leadSource, p.saleName, p.amount, p.methodName, p.paidAt, PAYMENT_STATUS_VI[p.status], p.adjustCount, p.recorderName, p.deciderName, p.centerCode])} />
        </span>
      </div>
      {d.items.length === 0 ? <Empty>Không có khoản thu phù hợp.</Empty> : (
        <div className="card overflow-x-auto" data-table="payments">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3" data-col="order">Đơn / phiếu thu</th><th className="p-3" data-col="student">Học viên / PH</th><th className="p-3" data-col="source">Nguồn / sale</th><th className="p-3 text-right" data-col="amount">Số tiền</th><th className="p-3" data-col="method">Hình thức · ngày</th><th className="p-3" data-col="people">Người thu / kế toán</th><th className="p-3 text-right" data-col="adjust" title="Số lần kế toán điều chỉnh khoản đã xác nhận">Số lần điều chỉnh</th><th className="p-3" data-col="status">Trạng thái</th><th className="p-3" data-col="actions"></th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((p) => (
                <tr key={p.id}>
                  <td className="p-3" data-col="order"><Link href={`/orders/${p.orderId}`} className="font-mono text-xs font-semibold text-brand-600">{p.orderCode}</Link><div>{p.receiptNo ? <Link href={`/payments/${p.id}/phieu-thu`} className="font-mono text-xs hover:underline">{p.receiptNo}</Link> : <span className="text-xs text-ink-400">chưa có phiếu</span>}</div><div className="text-xs text-ink-400">{p.centerCode}</div></td>
                  <td className="p-3" data-col="student">{p.studentName ?? "—"}{p.classCode ? <span className="text-xs text-ink-400"> · {p.classCode}</span> : null}<div className="text-xs text-ink-600">PH {p.customerName}{p.idNumber ? ` · CCCD ${p.idNumber}` : ""}</div></td>
                  <td className="p-3 text-xs" data-col="source">{p.leadSource ?? <span className="text-ink-400">—</span>}<div className="text-ink-600">{p.saleName ?? ""}</div></td>
                  <td className="p-3 text-right font-semibold tabular-nums" data-col="amount">{vnd(p.amount)}{p.amount !== p.recordedAmount && <div className="text-[11px] font-normal text-ink-400">ghi nhận {vnd(p.recordedAmount)}</div>}</td>
                  <td className="p-3 text-xs" data-col="method">{p.methodName ?? "—"}<div>{fmtD(p.paidAt)}</div></td>
                  <td className="p-3 text-xs" data-col="people">{p.recorderName ?? "?"}<div className="text-ink-400">{p.deciderName ?? ""}</div>{p.decisionReason && <div className="text-amber-800">{p.decisionReason}</div>}</td>
                  <td className="p-3 text-right tabular-nums" data-col="adjust">{p.adjustCount > 0 ? <b className="text-amber-800">{p.adjustCount}</b> : <span className="text-ink-400">0</span>}</td>
                  <td className="p-3" data-col="status"><PaymentChip status={p.status} />{p.needsTarget && p.status === "recorded" && <div className="mt-1 text-[11px] text-amber-800" title="Chốt lead thành học viên (màn Chuyển đổi) là nút xác nhận sẽ hiện ra">chưa gắn ghi danh</div>}{p.evidenceUrl && <div><a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline">Chứng từ</a></div>}</td>
                  <td className="p-3" data-col="actions">
                    <div className="space-y-1">
                      {p.canEdit && <EditPendingPayment paymentId={p.id} amount={p.amount} paidAt={p.paidAt} version={p.version} today={today} evidenceUrl={p.evidenceUrl} />}
                      {p.canAdjust && <AdjustConfirmedPayment paymentId={p.id} amount={p.amount} version={p.version} />}
                      {p.canDecide ? <DecidePayment paymentId={p.id} amount={p.amount} /> : p.status === "recorded" && !p.canEdit ? <span className="text-xs text-ink-400">chờ kế toán khác</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/payments" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
