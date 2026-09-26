import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { ORDER_STATUS_VI, type OrderStatus } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, vndPh, dtPh } from "@/components/ph-ui";

export const dynamic = "force-dynamic";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ don?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const d = await ParentPortal.portalFinance(getDb(), p.id);
  // Đơn đã huỷ không tính vào số phải đóng
  const conNo = d.orders.filter((o) => o.remaining > 0 && o.status !== "cancelled");
  const conPhaiDong = conNo.reduce((s, o) => s + o.remaining, 0);
  const soDonNo = conNo.length;
  return (
    <>
      <PhMain className="space-y-4">
        {d.orders.length === 0 && <div className="card p-4">Chưa có đơn học phí.</div>}
        {conPhaiDong > 0 && (
          <section aria-label="Tổng còn phải đóng" className="card flex items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
            <div>
              <div className="text-[14px] text-amber-900">Còn phải đóng · {soDonNo} đơn</div>
              <div className="text-[22px] font-extrabold text-amber-900">{vndPh(conPhaiDong)}</div>
            </div>
            <p className="max-w-[18rem] text-[13px] text-amber-900/80">Chuyển khoản theo mã QR trong từng đơn và giữ nguyên nội dung để trung tâm xác nhận tự động.</p>
          </section>
        )}
        {/* Máy tính bảng trở lên: xếp đơn thành lưới thay vì một cột dài */}
        <div className="grid gap-4 md:grid-cols-2">
        {d.orders.map((o) => (
          <section key={o.id} id={`don-${o.id}`} className={`card scroll-mt-20 space-y-2 p-4 ${sp.don === o.id ? "ring-2 ring-primary/30" : ""}`}>
            <div className="flex justify-between"><b>{o.code}</b><span className="text-[13px] font-semibold">{ORDER_STATUS_VI[o.status as OrderStatus]}</span></div>
            <div className="text-[14px] text-ink-600">{o.student ?? ""} · tổng {vndPh(o.total)} · đã đóng {vndPh(o.paid)}</div>
            {o.remaining > 0 && o.status !== "cancelled" && <div className="font-semibold text-amber-700">Còn lại: {vndPh(o.remaining)}</div>}
            {o.transfer && o.status !== "cancelled" && (
              <details open={sp.don === o.id || undefined}>
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">Chuyển khoản (QR)</summary>
                <div className="mt-2 space-y-1 text-[14px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.transfer.qr} alt="Mã QR chuyển khoản" className="mx-auto w-56" />
                  <div>{o.transfer.bank} · STK <b>{o.transfer.accountNo}</b> · {o.transfer.accountName}</div>
                  <div>Nội dung: <b className="font-mono">{o.transfer.memo}</b> (giữ nguyên để trung tâm xác nhận tự động)</div>
                </div>
              </details>
            )}
            {o.payments.length > 0 && <ul className="text-[14px] text-ink-600">{o.payments.map((x, i) => <li key={i}>{x.paidAt.split("-").reverse().join("/")} · {vndPh(x.amount)} · {x.status === "confirmed" ? `phiếu thu ${x.receiptNo ?? ""}` : "chờ xác nhận"}</li>)}</ul>}
          </section>
        ))}
        </div>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Hoá đơn điện tử</h2>
          {d.invoices.length === 0 ? <p className="text-ink-400">Chưa có hoá đơn.</p> : <ul className="divide-y divide-black/5">{d.invoices.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.orderCode} · số {i.number} · {vndPh(i.total)}<div className="text-[13px] text-ink-600">{dtPh(i.issuedAt)}</div></span>{i.lookupCode && <a href={`/tra-cuu-hoa-don?ma=${i.lookupCode}`} className="inline-flex min-h-11 items-center px-2 font-semibold text-primary">Xem</a>}</li>)}</ul>}
        </section>
      </PhMain>
    </>
  );
}
