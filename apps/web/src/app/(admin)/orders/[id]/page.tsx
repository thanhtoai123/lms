import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, ORDER_TYPE_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { OrderChip, PaymentChip, RefundChip, vnd, fmtD } from "@/components/finance-ui";
import { RecordPayment, DecidePayment, CancelOrder, NotesEditor, RevealCustomer } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết đơn" };

const EVENT_VI: Record<string, string> = {
  create: "Tạo đơn", status: "Đổi trạng thái", cancel: "Huỷ đơn", payment_recorded: "Ghi nhận thu", payment_confirmed: "Kế toán xác nhận", payment_adjusted: "Kế toán điều chỉnh",
  payment_rejected: "Kế toán từ chối", refund_requested: "Đề xuất hoàn", refund_approved: "Duyệt hoàn", refund_rejected: "Từ chối hoàn", refund_paid: "Đã chi hoàn",
};
const LEDGER_VI: Record<string, string> = { charge: "Ghi nợ", payment: "Thu tiền", refund: "Chi hoàn", cancel: "Huỷ nợ", adjustment: "Điều chỉnh" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Đơn hàng" perm="finance:read" />;
  const o = await caller.finance.order({ id }).catch(() => null);
  if (!o) notFound();
  const methods = o.perms.create || o.perms.confirm ? await caller.finance.methods({ centerId: o.centerId, activeOnly: true }) : [];
  const b = o.balance;
  const open = o.status !== "cancelled" && o.status !== "refunded";
  return (
    <div className="space-y-4">
      <Link href="/orders" className="text-sm text-ink-600">← Đơn hàng</Link>
      <PageHeader
        title={`Đơn ${o.code}`}
        desc={`${ORDER_TYPE_VI[o.type]} · ${o.center?.code ?? ""} · tạo ${fmtD(o.createdAt)} bởi ${o.creatorName ?? "?"}`}
        actions={<><OrderChip status={o.status} />{o.enrollment && o.status !== "cancelled" && <Link href={`/hoan-tien?enrollment=${o.enrollment.id}`} className="btn-ghost">Hoàn tiền</Link>}</>}
      />
      {o.status === "cancelled" && o.cancelReason && <div className="rounded-xl bg-slate-100 p-3 text-sm">Đã huỷ: {o.cancelReason}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-4"><div className="text-xs text-ink-400">Tổng phải đóng</div><div className="text-xl font-bold tabular-nums">{vnd(b.total)}</div>{o.discountAmount > 0 && <div className="text-xs text-ink-400">đã giảm {vnd(o.discountAmount)}</div>}</div>
        <div className="card p-4"><div className="text-xs text-ink-400">Đã thu (kế toán xác nhận)</div><div className="text-xl font-bold tabular-nums text-green-700">{vnd(b.confirmed)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Chờ kế toán xác nhận</div><div className="text-xl font-bold tabular-nums text-amber-700">{vnd(b.pending)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Còn thiếu</div><div className={`text-xl font-bold tabular-nums ${b.outstanding && open ? "text-red-700" : ""}`}>{vnd(open ? b.outstanding : 0)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Đã hoàn</div><div className="text-xl font-bold tabular-nums">{vnd(b.refunded)}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card overflow-x-auto p-4">
            <h2 className="mb-2 font-semibold">Sản phẩm</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Mô tả</th><th className="p-2">SL</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">Thành tiền</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {o.items.map((i) => <tr key={i.id}><td className="p-2">{i.description}{i.courseCode && <span className="chip ml-1 bg-black/5">{i.courseCode}{i.packageSessions ? ` · ${i.packageSessions} buổi` : ""}</span>}</td><td className="p-2">{i.quantity}</td><td className="p-2 text-right tabular-nums">{vnd(i.unitPrice)}</td><td className="p-2 text-right tabular-nums">{vnd(i.amount)}</td></tr>)}
                {o.discountAmount > 0 && <tr><td className="p-2 text-ink-600" colSpan={3}>Giảm giá {o.discountType === "percent" ? `${o.discountValue}%` : ""}</td><td className="p-2 text-right tabular-nums">−{vnd(o.discountAmount)}</td></tr>}
                <tr className="font-semibold"><td className="p-2" colSpan={3}>Tổng</td><td className="p-2 text-right tabular-nums">{vnd(o.total)}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto p-4">
            <h2 className="mb-2 font-semibold">Kế hoạch thanh toán</h2>
            {o.installments.length === 0 ? <p className="text-sm text-ink-400">Không có.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Đợt</th><th className="p-2">Hạn</th><th className="p-2 text-right">Số tiền</th><th className="p-2 text-right">Đã thu</th><th className="p-2">Tình trạng</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {o.installments.map((i) => (
                    <tr key={i.seq}>
                      <td className="p-2">{i.seq}</td><td className="p-2">{fmtD(i.dueDate)}</td><td className="p-2 text-right tabular-nums">{vnd(i.amount)}</td><td className="p-2 text-right tabular-nums">{vnd(i.paid)}</td>
                      <td className="p-2">{i.state === "paid" ? <span className="chip bg-green-100 text-green-800">Đã đủ</span> : i.overdueDays > 0 && open ? <span className="chip bg-red-100 text-red-700">Quá hạn {i.overdueDays} ngày</span> : i.state === "partial" ? <span className="chip bg-sky-100 text-sky-800">Thu một phần</span> : <span className="chip bg-black/5">Chưa đến hạn</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Khoản thu</h2>
            {open && o.perms.create && b.outstanding - b.pending > 0 && <RecordPayment orderId={o.id} suggested={o.nextDue ? Math.min(o.nextDue.remaining, b.outstanding - b.pending) : b.outstanding - b.pending} methods={methods.map((m) => ({ id: m.id, name: m.name }))} defaultMethodId={o.method?.id ?? ""} today={o.today} />}
            {o.payments.length === 0 ? <p className="text-sm text-ink-400">Chưa có khoản thu.</p> : (
              <ul className="divide-y divide-black/5 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <div><b className="tabular-nums">{vnd(p.amount)}</b>{p.amount !== p.recordedAmount && <span className="text-xs text-ink-400"> (ghi nhận {vnd(p.recordedAmount)})</span>} · {p.methodName ?? "—"} · ngày {fmtD(p.paidAt)} <PaymentChip status={p.status} />{p.source !== "manual" && <span className="chip ml-1 bg-black/5">{p.source}</span>}</div>
                      <div className="text-xs text-ink-400">Ghi nhận: {p.recorderName ?? "?"}{p.deciderName ? ` · Kế toán: ${p.deciderName}` : ""}{p.payerName ? ` · Người nộp: ${p.payerName}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
                      {p.decisionReason && <div className="text-xs text-amber-800">{p.decisionReason}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.receiptNo && <Link href={`/payments/${p.id}/phieu-thu`} className="font-mono text-xs text-brand-600 hover:underline">{p.receiptNo}</Link>}
                      {p.status === "recorded" && o.perms.confirm && <DecidePayment paymentId={p.id} amount={p.amount} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {o.refunds.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Hoàn tiền</h2>
              <ul className="divide-y divide-black/5 text-sm">
                {o.refunds.map((r) => <li key={r.id} className="flex justify-between gap-2 py-2"><span><b>{vnd(r.amount)}</b> <span className="text-xs text-ink-400">(đề xuất {vnd(r.proposedAmount)}, đã học {r.sessionsUsed}/{r.sessionsTotal})</span> — {r.reason}</span><RefundChip status={r.status} /></li>)}
              </ul>
            </section>
          )}

          <section className="card overflow-x-auto p-4">
            <h2 className="mb-2 font-semibold">Sổ kế toán</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Thời điểm</th><th className="p-2">Loại</th><th className="p-2 text-right">Phát sinh</th><th className="p-2">Diễn giải</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {o.ledger.map((l) => <tr key={l.id}><td className="p-2 text-xs">{new Date(l.createdAt).toLocaleString("vi-VN")}</td><td className="p-2">{LEDGER_VI[l.entryType] ?? l.entryType}</td><td className={`p-2 text-right tabular-nums ${l.amount < 0 ? "text-green-700" : ""}`}>{l.amount > 0 ? "+" : ""}{vnd(l.amount)}</td><td className="p-2 text-xs">{l.note}<div className="text-ink-400">{l.actorName ?? ""}</div></td></tr>)}
                <tr className="font-semibold"><td className="p-2" colSpan={2}>Số dư phải thu</td><td className="p-2 text-right tabular-nums">{vnd(o.ledger.reduce((s, l) => s + l.amount, 0))}</td><td /></tr>
              </tbody>
            </table>
          </section>
        </div>

        <div className="space-y-4">
          {o.qr && (
            <section className="card space-y-2 p-4 text-center">
              <h2 className="font-semibold">Chuyển khoản / QR</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.qr.url} alt="Mã QR chuyển khoản" className="mx-auto w-56 rounded-xl border border-black/10" />
              <div className="text-sm">{o.qr.bankName} · <span className="font-mono">{o.qr.accountNo}</span></div>
              <div className="text-xs text-ink-600">{o.qr.accountName}</div>
              <div className="rounded-lg bg-brand-50 p-2 font-mono text-sm font-semibold">{o.qr.memo}</div>
              <p className="text-[11px] text-ink-400">Nội dung chuyển khoản phải giữ nguyên mã đơn để đối khớp tự động.</p>
            </section>
          )}
          <section className="card space-y-1 p-4 text-sm">
            <h2 className="mb-1 font-semibold">Khách hàng</h2>
            <div><b>{o.customerName}</b></div>
            <div>{o.customerPhone}{o.customerEmail ? ` · ${o.customerEmail}` : ""}</div>
            {o.student && <div>Học viên: <Link href={`/students/${o.student.id}`} className="text-brand-600">{o.student.fullName}</Link></div>}
            {o.enrollment && <div>Lớp: <Link href={`/classes/${o.enrollment.classId}`} className="text-brand-600">{o.enrollment.classCode}</Link> · đã học {o.enrollment.consumed}/{o.enrollment.packageSessions} buổi</div>}
            {o.customerPrivate && <div className="text-xs text-ink-600">CCCD: {o.customerPrivate.idNumber ?? "—"} · {[o.customerPrivate.address, o.customerPrivate.ward, o.customerPrivate.province].filter(Boolean).join(", ")}</div>}
            {o.customerPrivate?.hasIdNumber && o.perms.confirm && <RevealCustomer orderId={o.id} />}
          </section>
          <section className="card p-4 text-sm">
            <h2 className="mb-1 font-semibold">Ghi chú</h2>
            <NotesEditor orderId={o.id} internalNote={o.internalNote} customerNote={o.customerNote} remindDays={o.remindDays} canEdit={o.perms.create && open} />
          </section>
          {open && o.perms.cancel && (
            <section className="card p-4">
              <h2 className="mb-1 font-semibold">Huỷ đơn</h2>
              {o.cancelBlock ? <p className="text-xs text-ink-600">{o.cancelBlock}</p> : <CancelOrder orderId={o.id} />}
            </section>
          )}
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Lịch sử</h2>
            <ol className="space-y-2 text-sm">
              {o.events.map((e) => <li key={e.id} className="border-l-2 border-brand-100 pl-2"><b>{EVENT_VI[e.event] ?? e.event}</b>{e.note ? <span className="text-ink-600"> — {e.note}</span> : null}<div className="text-xs text-ink-400">{e.actorName ?? "hệ thống"} · {new Date(e.createdAt).toLocaleString("vi-VN")}</div></li>)}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
