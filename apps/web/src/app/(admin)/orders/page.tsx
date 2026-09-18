import Link from "next/link";
import { hasPermission, ORDER_STATUSES, ORDER_STATUS_VI, ORDER_TYPE_VI, type Actor, type OrderStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { OrderChip, OrderDisplayChip, vnd, fmtD } from "@/components/finance-ui";
import { RememberFilters } from "@/components/remember-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đơn hàng" };

type SP = { q?: string; center?: string; status?: string; from?: string; to?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Đơn hàng" perm="finance:read" />;
  const canCreate = hasPermission(ctx.actor as Actor, "finance:create");
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const [ref, d] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.finance.orders({ q: sp.q || undefined, centerId: sp.center || undefined, status, from: sp.from || undefined, to: sp.to || undefined, page: Number(sp.page) || 1 }),
  ]);
  return (
    <div className="space-y-4">
      <RememberFilters storageKey="orders" ignore={["page"]} />
      <PageHeader
        title="Đơn hàng"
        desc="Đơn học phí / sản phẩm. Badge chính suy từ tiền đã thu (kể cả khoản kế toán chưa đối soát); công nợ phụ huynh vẫn chỉ trừ khoản đã xác nhận."
        actions={<>{canCreate && <Link href="/thieu-hoc-phi?kind=no_order" className="btn-ghost">HV chưa lập đơn</Link>}{canCreate && <Link href="/orders/new" className="btn-primary">+ Tạo đơn</Link>}</>}
      />
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Mã đơn / tên / SĐT…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[180px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        <label className="text-xs text-ink-600">Từ<input type="date" name="from" defaultValue={sp.from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Đến<input type="date" name="to" defaultValue={sp.to} className="input mt-1 !py-1.5" /></label>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/orders" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...ORDER_STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_VI[s], count: d.counts?.[s] }))]} />
      <div className="text-sm text-ink-600">{d.total} đơn · tổng giá trị {vnd(d.sum)}</div>
      {d.items.length === 0 ? <Empty>Không có đơn phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Mã đơn</th><th className="p-3">Khách hàng</th><th className="p-3">Loại</th><th className="p-3 text-right">Tổng</th><th className="p-3 text-right">Đã thu</th><th className="p-3 text-right">Còn nợ</th><th className="p-3">Phương thức</th><th className="p-3">Trạng thái</th><th className="p-3">Tạo</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((o) => (
                <tr key={o.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/orders/${o.id}`} className="font-mono text-xs font-semibold text-brand-600">{o.code}</Link><div className="text-xs text-ink-400">{o.centerCode}</div></td>
                  <td className="p-3">{o.customerName}<div className="text-xs text-ink-400">{o.customerPhone}{o.studentName ? ` · HV ${o.studentName}` : ""}</div></td>
                  <td className="p-3 text-xs">{ORDER_TYPE_VI[o.type]}</td>
                  <td className="p-3 text-right tabular-nums">{vnd(o.total)}</td>
                  <td className="p-3 text-right tabular-nums text-green-700">{vnd(o.confirmed)}{o.pending > 0 && <div className="text-[11px] text-amber-700">+{vnd(o.pending)} chờ</div>}</td>
                  <td className={`p-3 text-right tabular-nums ${o.outstanding ? "font-semibold text-red-700" : "text-ink-400"}`}>{vnd(o.outstanding)}</td>
                  <td className="p-3 text-xs">{o.methodName ?? "—"}</td>
                  <td className="p-3"><OrderDisplayChip state={o.display} /><div className="mt-1"><OrderChip status={o.status} /></div></td>
                  <td className="p-3 text-xs">{fmtD(o.createdAt)}<div className="text-ink-400">{o.creatorName ?? ""}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/orders" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
