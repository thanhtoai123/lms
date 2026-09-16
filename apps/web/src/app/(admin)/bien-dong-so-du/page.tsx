import Link from "next/link";
import { hasPermission, BANK_TX_STATUSES, BANK_TX_STATUS_VI, type Actor, type BankTxStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { BankRowActions, StatementImport } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Biến động số dư" };

const CHIP: Record<BankTxStatus, string> = {
  matched: "bg-green-100 text-green-800",
  unmatched: "bg-amber-100 text-amber-800",
  needs_review: "bg-red-100 text-red-700",
  ignored: "bg-slate-100 text-slate-600",
};

const dt = (d: Date | string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function BankTxPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Biến động số dư" perm="finance:read" />;
  const status = BANK_TX_STATUSES.includes(sp.status as BankTxStatus) ? (sp.status as BankTxStatus) : undefined;
  const d = await caller.finance.bankTxs({ status, q: sp.q || undefined, from: sp.from || undefined, to: sp.to || undefined, page: Math.max(1, Number(sp.page) || 1) });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Biến động số dư"
        desc="Tiền vào tài khoản (SePay hoặc sao kê) được tự khớp với đơn theo mã trong nội dung chuyển khoản (VD: SATA DH26000012). Khớp được → tự xác nhận khoản thu và cấp số phiếu; không chắc chắn → chờ kế toán kiểm tra."
        actions={<CsvButton filename="bien-dong-so-du" headers={["Thời gian", "Tài khoản", "Số tiền", "Nội dung", "Mã GD", "Trạng thái", "Đơn", "Phiếu thu", "Ghi chú"]} rows={d.items.map((t) => [dt(t.occurredAt), t.accountNo, t.direction === "in" ? t.amount : -t.amount, t.content, t.referenceCode, BANK_TX_STATUS_VI[t.status], t.orderCode, t.receiptNo, t.matchNote])} />}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-ink-400">Tiền vào (bộ lọc)</div><b className="text-lg tabular-nums">{vnd(d.sums.in)}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Đã khớp đơn</div><b className="text-lg tabular-nums text-green-700">{vnd(d.sums.matched)}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Chưa xử lý</div><b className="text-lg tabular-nums text-amber-700">{vnd(d.sums.open)}</b><div className="text-xs text-ink-400">{d.counts.unmatched + d.counts.needs_review} giao dịch</div></div>
        <div className="card p-3 text-xs">
          <div className="text-ink-400">Webhook SePay</div>
          {d.webhook.configured ? <b className="text-green-700">Đã bật</b> : <b className="text-amber-700">Chưa cấu hình SEPAY_API_KEY</b>}
          <div className="mt-1 break-all font-mono">POST {d.webhook.path}</div>
          <div>Header: <span className="font-mono">Authorization: Apikey …</span></div>
          <div>Lần nhận gần nhất: {d.webhook.lastReceivedAt ? dt(d.webhook.lastReceivedAt) : "—"}</div>
        </div>
      </div>

      {d.accounts.length > 0 && (
        <div className="text-xs text-ink-600">
          Tài khoản đang đối khớp: {d.accounts.map((a) => `${a.bankName ?? a.name} ${a.accountNo ?? ""} (${a.centerCode ?? "dùng chung"})`).join(" · ")} — thêm/sửa ở <Link href="/payment-methods" className="text-brand-600">Phương thức TT</Link>.
        </div>
      )}

      {d.canImport && <StatementImport accounts={d.accounts.map((a) => ({ id: a.id, label: `${a.bankName ?? a.name} · ${a.accountNo ?? ""} · ${a.centerCode ?? "dùng chung"}` }))} />}

      <form className="flex flex-wrap items-end gap-2" action="/bien-dong-so-du">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Nội dung, mã GD, số tiền…" className="input w-64" />
        <label className="text-xs text-ink-600">Từ<input type="date" name="from" defaultValue={sp.from} className="input mt-1" /></label>
        <label className="text-xs text-ink-600">Đến<input type="date" name="to" defaultValue={sp.to} className="input mt-1" /></label>
        <button className="btn-ghost">Lọc</button>
      </form>

      <StatTabs basePath="/bien-dong-so-du" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...(["needs_review", "unmatched", "matched", "ignored"] as const).map((s) => ({ key: s, label: BANK_TX_STATUS_VI[s], count: d.counts[s] }))]} />

      {d.items.length === 0 ? <Empty>Không có giao dịch.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Thời gian</th><th className="p-3 text-right">Số tiền</th><th className="p-3">Nội dung</th><th className="p-3">Trạng thái</th><th className="p-3">Đơn / phiếu</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 whitespace-nowrap text-xs">{dt(t.occurredAt)}<div className="text-ink-400">{t.gateway ?? ""} · {t.accountNo}</div><div className="text-ink-400">{t.source === "sepay" ? "SePay" : "Sao kê"}{t.centerCode ? ` · ${t.centerCode}` : ""}</div></td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${t.direction === "in" ? "text-green-700" : "text-ink-400"}`}>{t.direction === "in" ? "+" : "−"}{vnd(t.amount)}</td>
                  <td className="p-3 text-xs"><div className="max-w-md break-words">{t.content || "—"}</div>{t.referenceCode && <div className="font-mono text-ink-400">{t.referenceCode}</div>}{t.orderRef && t.status !== "matched" && <div className="text-ink-600">Mã đơn đọc được: <b className="font-mono">{t.orderRef}</b></div>}</td>
                  <td className="p-3"><span className={`chip ${CHIP[t.status]}`}>{BANK_TX_STATUS_VI[t.status]}</span>{t.matchNote && <div className="mt-1 max-w-xs text-xs text-ink-600">{t.matchNote}</div>}{t.handlerName && <div className="text-xs text-ink-400">{t.handlerName}</div>}</td>
                  <td className="p-3 text-xs">{t.orderId ? <Link href={`/orders/${t.orderId}`} className="font-mono text-brand-600">{t.orderCode}</Link> : "—"}{t.customerName && <div>{t.customerName}</div>}{t.receiptNo && t.paymentId && <Link href={`/payments/${t.paymentId}/phieu-thu`} className="block font-mono text-green-700">{t.receiptNo}</Link>}</td>
                  <td className="p-3">{t.canHandle && <BankRowActions id={t.id} amount={t.amount} status={t.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/bien-dong-so-du" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
