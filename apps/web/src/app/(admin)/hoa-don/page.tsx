import Link from "next/link";
import { hasPermission, INVOICE_STATUSES, INVOICE_STATUS_VI, type Actor, type InvoiceStatus, type InvoiceLine } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { SettingsForm, DraftFromPayment, BuyerForm, IssueButtons, CorrectionForm, PrintInvoice } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoá đơn điện tử" };
type SP = { id?: string; status?: string; q?: string; tab?: string; year?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const CHIP: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-ink-600", issuing: "bg-sky-100 text-sky-800", issued: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-700",
  adjusted: "bg-amber-100 text-amber-800", replaced: "bg-slate-200 text-ink-600", cancelled: "bg-slate-100 text-ink-400",
};
const DL: Record<string, { cls: string; label: string }> = { late: { cls: "bg-red-100 text-red-700", label: "Trễ hạn lập" }, due_today: { cls: "bg-amber-100 text-amber-800", label: "Lập trong hôm nay" }, ok: { cls: "", label: "" } };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "finance:read")) return <NoAccess title="Hoá đơn điện tử" perm="finance:read" />;
  if (sp.id && UUID.test(sp.id)) return <InvoiceDetail id={sp.id} />;
  const tab = ["settings", "report"].includes(sp.tab ?? "") ? sp.tab! : "list";
  const status = INVOICE_STATUSES.includes(sp.status as InvoiceStatus) ? (sp.status as InvoiceStatus) : undefined;
  const d = await caller.invoice.list({ status, q: sp.q || undefined });
  const c = d.counts;
  const tabs = [["list", "Hoá đơn"], ["report", "Đối soát theo tháng"], ["settings", "Cấu hình"]] as const;
  return (
    <div className="space-y-4">
      <PageHeader title="Hoá đơn điện tử" desc="Hoá đơn lập tại thời điểm thu tiền (NĐ 123/2020, sửa đổi NĐ 70/2025). Đã phát hành thì không sửa / huỷ — sai sót lập hoá đơn điều chỉnh hoặc thay thế kèm văn bản thoả thuận với người mua. Học phí mặc định ghi “Không chịu thuế”." />
      {!d.settings.enabled && <div className="card border-amber-200 bg-amber-50 p-3 text-sm">Hoá đơn điện tử chưa bật — vào tab Cấu hình.</div>}
      {d.settings.enabled && d.settings.provider === "sandbox" && <div className="card border-amber-200 bg-amber-50 p-3 text-sm">Đang dùng nhà cung cấp THỬ NGHIỆM — hoá đơn không có giá trị pháp lý, chưa gửi cơ quan thuế.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Khoản thu chưa có hoá đơn" value={c.missing} tone={c.missing ? "warn" : "good"} />
        <Kpi label="Nháp trễ hạn lập" value={c.lateDrafts} tone={c.lateDrafts ? "bad" : "default"} />
        <Kpi label="Nháp" value={c.draft} />
        <Kpi label="Lỗi phát hành" value={c.failed} tone={c.failed ? "bad" : "default"} />
        <Kpi label="Đã phát hành" value={c.issued} tone="good" />
        <Kpi label="Hoàn tiền cần điều chỉnh" value={c.refundsToAdjust} tone={c.refundsToAdjust ? "warn" : "default"} />
      </div>
      <div className="flex gap-1 border-b border-black/10 text-sm">{tabs.map(([k, l]) => <Link key={k} href={k === "list" ? "/hoa-don" : `/hoa-don?tab=${k}`} className={`px-3 py-2 ${tab === k ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>{l}</Link>)}</div>
      {tab === "settings" ? <Settings /> : tab === "report" ? <Report year={Number(sp.year) || new Date().getFullYear()} /> : (
        <>
          {d.missing.length > 0 && (
            <Section title="Khoản thu chưa lập hoá đơn" desc="Worker tự lập nháp mỗi phút nếu bật “tự lập nháp”; có thể lập tay.">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Phiếu thu</th><th className={th}>Đơn</th><th className={th}>Khách</th><th className={th}>Số tiền</th><th className={th}>Ngày thu</th><th className={th}></th></tr></thead>
                <tbody className="divide-y divide-black/5">{d.missing.slice(0, 30).map((m) => (
                  <tr key={m.id}><td className="p-3 font-mono text-xs">{m.receiptNo ?? "—"}</td><td className="p-3 text-xs">{m.orderCode} · {m.centerCode}</td><td className="p-3 text-xs">{m.customer}</td><td className={td}>{vnd(m.amount)}</td>
                    <td className="p-3 text-xs">{m.paidAt.split("-").reverse().join("/")} {DL[m.deadline]!.label && <span className={`chip ${DL[m.deadline]!.cls}`}>{DL[m.deadline]!.label}</span>}</td>
                    <td className="p-3">{d.canIssue && <DraftFromPayment paymentId={m.id} />}</td></tr>
                ))}</tbody>
              </table>
            </Section>
          )}
          {d.refundsToAdjust.length > 0 && (
            <Section title="Hoàn tiền đã chi — cần hoá đơn điều chỉnh giảm">
              <ul className="divide-y divide-black/5 text-sm">{d.refundsToAdjust.map((r) => <li key={r.id} className="flex justify-between p-3"><span>{r.orderCode} · hoàn {vnd(r.amount)}</span><Link href={`/hoa-don?id=${r.invoiceId}`} className="text-brand-600">Hoá đơn số {r.invoiceNo} →</Link></li>)}</ul>
            </Section>
          )}
          <Section title="Hoá đơn" actions={<form className="flex gap-2 text-sm"><input name="q" defaultValue={sp.q} placeholder="Số HĐ, mã đơn, người mua, mã tra cứu" className="input !py-1.5 w-56" /><select name="status" defaultValue={status ?? ""} className="input !w-auto !py-1.5"><option value="">Mọi trạng thái</option>{INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_VI[s]}</option>)}</select><button className="btn-ghost !py-1.5">Lọc</button></form>}>
            {d.items.length === 0 ? <div className="p-4"><Empty>Chưa có hoá đơn.</Empty></div> : (
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Số / ký hiệu</th><th className={th}>Loại</th><th className={th}>Người mua</th><th className={th}>Đơn · phiếu thu</th><th className={th}>Tổng tiền</th><th className={th}>Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-black/5">{d.items.map((i) => (
                  <tr key={i.id} className="hover:bg-black/[0.02]">
                    <td className="p-3"><Link href={`/hoa-don?id=${i.id}`} className="font-mono text-xs font-semibold text-brand-600">{i.number ? `${i.templateCode}${i.serial} · ${String(i.number).padStart(7, "0")}` : "(chưa cấp số)"}</Link><div className="text-[11px] text-ink-400">{i.issuedAt ? dtVN(i.issuedAt) : dtVN(i.createdAt)}</div></td>
                    <td className="p-3 text-xs">{i.kindLabel}</td>
                    <td className="p-3 text-xs">{i.buyer}</td>
                    <td className="p-3 text-xs">{i.orderCode ?? "—"}<div className="text-ink-400">{i.receiptNo ?? ""} · {i.centerCode}</div></td>
                    <td className={td}>{vnd(i.total)}{i.vat ? <div className="text-[11px] text-ink-400">thuế {vnd(i.vat)}</div> : null}</td>
                    <td className="p-3"><span className={`chip ${CHIP[i.status as InvoiceStatus]}`}>{i.statusLabel}</span>{DL[i.deadline]!.label && <span className={`chip ml-1 ${DL[i.deadline]!.cls}`}>{DL[i.deadline]!.label}</span>}{i.error && <div className="text-[11px] text-red-700">{i.error}</div>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

async function Settings() {
  const { caller } = await getServerCaller();
  const s = await caller.invoice.settings();
  return (
    <Section title="Cấu hình hoá đơn điện tử" desc={s.canEdit ? "Kế toán Hội sở cấu hình. Khoá kết nối nhà cung cấp đặt trong biến môi trường máy chủ." : "Chỉ kế toán Hội sở sửa được."}>
      {s.providerStatus.sandboxBlocked && <p className="px-4 pt-3 text-sm text-red-700">Nhà cung cấp thử nghiệm bị chặn ở production.</p>}
      <SettingsForm canEdit={s.canEdit} initial={{ enabled: s.enabled, provider: s.provider, templateCode: s.templateCode, serial: s.serial, sellerName: s.sellerName, sellerTaxCode: s.sellerTaxCode, sellerAddress: s.sellerAddress, courseRate: s.courseRate, goodsRate: s.goodsRate, autoDraft: s.autoDraft, autoIssue: s.autoIssue, startDate: s.startDate, lookupUrl: s.lookupUrl }} />
      <p className="border-t border-black/5 p-4 text-xs text-ink-600">Cổng kết nối: {s.providerStatus.httpConfigured ? "đã cấu hình EINVOICE_API_URL / EINVOICE_API_KEY" : "chưa cấu hình"}. Hệ thống gửi POST {"{EINVOICE_API_URL}/invoices"} (JSON: người bán, người mua, dòng hàng, thuế, hoá đơn gốc khi điều chỉnh / thay thế; header Idempotency-Key) và nhận về số hoá đơn, mã tra cứu — dùng cho lớp kết nối tới MISA meInvoice, Viettel S-Invoice, VNPT…</p>
    </Section>
  );
}

async function Report({ year }: { year: number }) {
  const { caller } = await getServerCaller();
  const r = await caller.invoice.report({ year });
  return (
    <Section title={`Đối soát thu tiền – hoá đơn năm ${year}`} desc="Chênh lệch khác 0 nghĩa là còn khoản thu chưa lập hoá đơn (hoặc hoá đơn lập khác tháng thu)." actions={<div className="flex gap-1 text-xs">{[year - 1, year, year + 1].map((y) => <Link key={y} href={`/hoa-don?tab=report&year=${y}`} className={`chip ${y === year ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>{y}</Link>)}</div>}>
      <table className="w-full text-sm">
        <thead><tr><th className={th}>Tháng</th><th className={th}>Đã thu</th><th className={th}>Khoản thu</th><th className={th}>Đã xuất HĐ</th><th className={th}>Thuế GTGT</th><th className={th}>Số HĐ</th><th className={th}>Chênh lệch</th></tr></thead>
        <tbody className="divide-y divide-black/5">{r.rows.map((m) => (
          <tr key={m.mo}><td className="p-3">T{m.mo}</td><td className={td}>{vnd(m.collected)}</td><td className={td}>{m.payments}</td><td className={td}>{vnd(m.invoiced)}</td><td className={td}>{vnd(m.vat)}</td><td className={td}>{m.invoices}</td><td className={`${td} ${m.gap ? "font-semibold text-amber-700" : "text-ink-400"}`}>{vnd(m.gap)}</td></tr>
        ))}</tbody>
      </table>
    </Section>
  );
}

async function InvoiceDetail({ id }: { id: string }) {
  const { caller } = await getServerCaller();
  const i = await caller.invoice.get({ id });
  const list = i.can.correct ? await caller.invoice.list({}) : null;
  const refunds = (list?.refundsToAdjust ?? []).filter((r) => r.invoiceId === i.id).map((r) => ({ id: r.id, amount: r.amount, label: `${r.orderCode} · hoàn ${vnd(r.amount)}` }));
  const lines = i.lines as InvoiceLine[];
  return (
    <div className="space-y-4">
      <div className="print:hidden"><PageHeader title={i.number ? `Hoá đơn số ${String(i.number).padStart(7, "0")}` : "Hoá đơn nháp"} desc={`${i.kindLabel} · ${i.statusLabel}${i.orderCode ? ` · đơn ${i.orderCode}` : ""}${i.receiptNo ? ` · phiếu thu ${i.receiptNo}` : ""}`} actions={<div className="flex gap-2"><Link href="/hoa-don" className="btn-ghost">← Danh sách</Link>{i.orderId && <Link href={`/orders/${i.orderId}`} className="btn-ghost">Đơn hàng</Link>}<PrintInvoice /></div>} /></div>
      {i.error && <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800 print:hidden">Lỗi phát hành lần gần nhất: {i.error}</div>}
      <div className="card mx-auto max-w-3xl space-y-3 p-6 text-sm print:shadow-none">
        {i.sandbox && <div className="rounded bg-amber-100 p-2 text-center text-xs font-semibold text-amber-900">BẢN THỬ NGHIỆM — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ</div>}
        <div className="text-center">
          <div className="text-lg font-bold uppercase">{i.templateCode === "1" ? "Hoá đơn giá trị gia tăng" : "Hoá đơn bán hàng"}</div>
          {i.kind !== "original" && <div className="text-xs font-semibold">({i.kindLabel})</div>}
          <div className="text-xs text-ink-600">Ký hiệu: {i.templateCode}{i.serial} · Số: {i.number ? String(i.number).padStart(7, "0") : "—"} · Ngày: {i.issuedAt ? new Date(i.issuedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—"}</div>
          {i.lookupCode && <div className="text-xs">Mã tra cứu: <span className="font-mono font-semibold">{i.lookupCode}</span></div>}
        </div>
        <div className="grid gap-1 border-y border-black/10 py-2 text-xs">
          <div><b>Đơn vị bán:</b> {i.seller.name || "(chưa cấu hình)"} · MST {i.seller.taxCode || "—"}</div>
          <div><b>Địa chỉ:</b> {i.seller.address || "—"}</div>
          <div><b>Người mua:</b> {i.noInvoiceRequested && !i.buyerName ? "Người mua không lấy hoá đơn" : i.buyerName ?? "—"}{i.buyerCompany ? ` · Đơn vị: ${i.buyerCompany}` : ""}{i.buyerTaxCode ? ` · MST ${i.buyerTaxCode}` : ""}</div>
          {i.buyerAddress && <div><b>Địa chỉ:</b> {i.buyerAddress}</div>}
          <div><b>Hình thức thanh toán:</b> {i.paymentMethod ?? "TM/CK"}{i.buyerEmail ? ` · Email: ${i.buyerEmail}` : ""}</div>
          {i.reason && <div><b>Lý do:</b> {i.reason} {i.agreementNote ? `(${i.agreementNote})` : ""}</div>}
        </div>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-black/10 text-left"><th className="py-1">STT</th><th>Tên hàng hoá, dịch vụ</th><th>ĐVT</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">Thành tiền</th><th className="text-right">Thuế suất</th></tr></thead>
          <tbody>{lines.map((l, k) => <tr key={k} className="border-b border-black/5"><td className="py-1">{k + 1}</td><td>{l.name}</td><td>{l.unit}</td><td className="text-right">{l.quantity}</td><td className="text-right">{vnd(l.unitPrice)}</td><td className="text-right">{vnd(l.amount)}</td><td className="text-right">{l.taxRate === "KCT" ? "KCT" : `${l.taxRate}%`}</td></tr>)}</tbody>
        </table>
        <div className="ml-auto max-w-xs space-y-0.5 text-xs">
          {i.byRate.map((r) => <div key={r.rate} className="flex justify-between"><span>{r.label}: tiền trước thuế</span><span>{vnd(r.base)}{r.vat ? ` · thuế ${vnd(r.vat)}` : ""}</span></div>)}
          <div className="flex justify-between font-semibold"><span>Tổng tiền thanh toán</span><span>{vnd(i.total)}</span></div>
        </div>
        <div className="text-xs"><b>Số tiền bằng chữ:</b> {i.totalInWords}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        <Section title="Xử lý">
          <div className="space-y-3 p-4">
            {i.can.edit && <BuyerForm id={i.id} initial={{ buyerName: i.buyerName, buyerCompany: i.buyerCompany, buyerTaxCode: i.buyerTaxCode, buyerAddress: i.buyerAddress, buyerEmail: i.buyerEmail, noInvoiceRequested: i.noInvoiceRequested }} />}
            {(i.can.issue || i.can.cancel) && <IssueButtons id={i.id} canIssue={i.can.issue} canCancel={i.can.cancel} />}
            {i.can.correct && <CorrectionForm originalId={i.id} lines={lines} refunds={refunds} />}
            {!i.can.edit && !i.can.issue && !i.can.correct && <p className="text-xs text-ink-400">Không có thao tác.</p>}
          </div>
        </Section>
        <Section title="Lịch sử & hoá đơn liên quan">
          <div className="space-y-2 p-4 text-xs">
            {i.related.map((r) => <div key={r.id}><Link href={`/hoa-don?id=${r.id}`} className="text-brand-600">{r.kind === "original" ? "Hoá đơn gốc" : r.kind === "adjustment" ? "Điều chỉnh" : "Thay thế"} {r.number ? `số ${r.number}` : "(nháp)"}</Link> · {INVOICE_STATUS_VI[r.status as InvoiceStatus]} · {vnd(r.total)}</div>)}
            <ol className="space-y-1 border-t border-black/5 pt-2">{i.events.map((e) => <li key={e.id}><b>{e.action}</b> · {e.by ?? "Hệ thống"} · {dtVN(e.createdAt)}{e.note ? ` — ${e.note}` : ""}</li>)}</ol>
          </div>
        </Section>
      </div>
    </div>
  );
}
