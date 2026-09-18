import Link from "next/link";
import { notFound } from "next/navigation";
import { TRANSFER_REQUEST_VI, type OrderStatus, type PaymentStatus, type TransferRequestStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { EnrollmentChip, PageHeader, fmtDate } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd, OrderChip, PaymentChip } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { EnrollmentActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết đăng ký học" };

export default async function EnrollmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const d = await caller.students.enrollment({ id }).catch((e: { code?: string; data?: { code?: string } }) => {
    if (e?.code === "NOT_FOUND" || e?.data?.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!d) notFound();
  const e = d.enrollment;
  const pct = Math.min(100, Math.round((e.consumed / Math.max(1, e.packageSessions)) * 100));

  return (
    <div className="space-y-4">
      <Link href="/enrollments" className="text-sm text-ink-600">← Đăng ký học</Link>
      <PageHeader
        title={`${e.studentName} · ${e.classCode}`}
        desc="Một gói học của học viên trong một lớp: dòng thời gian, đổi trạng thái có lý do, đơn hàng và khoản thu liên quan."
        actions={<div className="flex flex-wrap gap-2">
          <Link href={`/students/${e.studentId}`} className="btn-ghost">Hồ sơ học viên</Link>
          <Link href={`/classes/${e.classId}`} className="btn-ghost">Trang lớp</Link>
          <Link href={`/chuyen-lop?studentId=${e.studentId}`} className="btn-ghost">Chuyển lớp</Link>
        </div>}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold"><Link href={`/classes/${e.classId}`} className="text-brand-600">{e.className}</Link></div>
              <div className="text-xs text-ink-400">{e.classCode} · {e.courseCode} · {e.centerCode} · mã HV {e.studentCode ?? "—"}</div>
              <div className="text-xs text-ink-600">Ghi danh {fmtDate(e.enrolledAt)}{e.endedAt ? ` · kết thúc ${fmtDate(e.endedAt)}` : ""}{e.endReason ? ` — ${e.endReason}` : ""}</div>
              {e.status === "paused" && <div className="text-xs text-amber-700">Bảo lưu {fmtDate(e.pausedAt)} → {e.pauseUntil ? fmtDate(e.pauseUntil) : "chưa hẹn ngày trở lại"}</div>}
            </div>
            <EnrollmentChip status={e.status} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span>Đã học {e.consumed}/{e.packageSessions} buổi (vào lớp từ buổi {e.startSequenceNo})</span><span className={e.remaining <= 4 && e.status === "active" ? "font-semibold text-red-700" : ""}>Còn {e.remaining}</span></div>
            <div className="h-2 rounded-full bg-black/5"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
          </div>
          <EnrollmentActions
            enrollmentId={e.id}
            status={e.status}
            packageSessions={e.packageSessions}
            consumed={e.consumed}
            canUpdate={d.perms.canUpdate}
          />
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <h2 className="font-semibold">Học phí của ghi danh</h2>
          {d.perms.canFinance ? (
            <>
              <div className="flex justify-between"><span className="text-ink-600">Phải đóng</span><b className="tabular-nums">{vnd(d.money.fee)}</b></div>
              <div className="flex justify-between"><span className="text-ink-600">Đã xác nhận</span><b className="tabular-nums text-green-700">{vnd(d.money.confirmed)}</b></div>
              {d.money.recorded > 0 && <div className="flex justify-between"><span className="text-ink-600">Chờ kế toán</span><b className="tabular-nums text-amber-700">{vnd(d.money.recorded)}</b></div>}
              <div className="flex justify-between border-t border-black/5 pt-1"><span className="text-ink-600">Còn thiếu</span><b className="tabular-nums">{vnd(d.money.outstanding)}</b></div>
              {d.orders.length === 0 && <Link href={`/orders/new?enrollmentId=${e.id}`} className="btn-primary mt-2 !py-1 text-xs">+ Lập đơn học phí</Link>}
            </>
          ) : <p className="text-xs text-ink-400">Bạn không có quyền xem tài chính của cơ sở này.</p>}
        </div>
      </section>

      {d.perms.canFinance && (
        <section className="space-y-2">
          <h2 className="font-bold">Đơn hàng & khoản thu</h2>
          {d.orders.length === 0 ? <Empty>Ghi danh chưa gắn đơn hàng nào.</Empty> : (
            <div className="card divide-y divide-black/5">
              {d.orders.map((o) => (
                <div key={o.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/orders/${o.id}`} className="font-mono font-semibold text-brand-600">{o.code}</Link>
                    <span className="flex items-center gap-2"><OrderChip status={o.status as OrderStatus} /><b className="tabular-nums">{vnd(o.total)}</b></span>
                  </div>
                  {o.lines.map((l) => <div key={l.id} className="text-xs text-ink-600">{l.description}{l.packageSessions ? ` · ${l.packageSessions} buổi` : ""} — {vnd(l.net)}</div>)}
                </div>
              ))}
            </div>
          )}
          {d.payments.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Phiếu thu</th><th className="p-3">Đơn</th><th className="p-3 text-right">Số tiền</th><th className="p-3">Ngày thu</th><th className="p-3">Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3 font-mono text-xs">{p.receiptNo ?? "—"}</td>
                      <td className="p-3"><Link href={`/orders/${p.orderId}`} className="font-mono text-xs text-brand-600">{p.orderCode}</Link></td>
                      <td className="p-3 text-right tabular-nums">{vnd(p.amount)}</td>
                      <td className="p-3 text-xs">{p.paidAt?.split("-").reverse().join("/")}</td>
                      <td className="p-3"><PaymentChip status={p.status as PaymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-bold">Dòng thời gian</h2>
          {d.timeline.length === 0 ? <Empty>Chưa có sự kiện nào.</Empty> : (
            <ol className="card divide-y divide-black/5">
              {d.timeline.map((t) => (
                <li key={t.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{t.label}</b>
                    <span className="text-xs text-ink-400">{dtVN(t.createdAt)}</span>
                  </div>
                  <div className="text-xs text-ink-600">
                    {t.fromStatus || t.toStatus ? <span>{t.fromStatus ?? "—"} → {t.toStatus ?? "—"} · </span> : null}
                    {t.actorName ?? "Hệ thống"}
                  </div>
                  {t.reason && <div className="text-xs text-ink-600">Lý do: {t.reason}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-bold">Bảo lưu</h2>
            {d.pauses.length === 0 ? <Empty>Chưa có đợt bảo lưu.</Empty> : (
              <ul className="card divide-y divide-black/5 text-sm">
                {d.pauses.map((p) => (
                  <li key={p.id} className="p-3">
                    <div>{fmtDate(p.fromDate)} → {p.expectedReturn ? fmtDate(p.expectedReturn) : "chưa hẹn ngày trở lại"}{p.endedAt ? ` · đã kết thúc ${dtVN(p.endedAt)}` : " · đang bảo lưu"}</div>
                    <div className="text-xs text-ink-600">{p.reason}{p.endNote ? ` — ${p.endNote}` : ""}{p.byName ? ` · ${p.byName}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="font-bold">Yêu cầu chuyển lớp</h2>
            {d.transfers.length === 0 ? <Empty>Chưa có yêu cầu chuyển lớp.</Empty> : (
              <ul className="card divide-y divide-black/5 text-sm">
                {d.transfers.map((t) => (
                  <li key={t.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span>→ {t.toClassCode ?? "chưa chọn lớp"}</span>
                      <span className="chip bg-black/5">{TRANSFER_REQUEST_VI[t.status as TransferRequestStatus] ?? t.status}</span>
                    </div>
                    <div className="text-xs text-ink-600">{t.reason}{t.decisionNote ? ` — ${t.decisionNote}` : ""}</div>
                    <div className="text-xs text-ink-400">{dtVN(t.createdAt)}{t.byName ? ` · ${t.byName}` : ""}{t.newEnrollmentId ? " · " : ""}{t.newEnrollmentId && <Link href={`/enrollments/${t.newEnrollmentId}`} className="text-brand-600 underline">ghi danh mới</Link>}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
