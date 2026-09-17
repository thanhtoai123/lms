import Link from "next/link";
import { hasPermission, ITEM_TYPES, ITEM_TYPE_VI, MOVEMENT_TYPES, MOVEMENT_TYPE_VI, RENTAL_STATUS_VI, type Actor, type ItemType, type MovementType, type RentalStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { vnd, fmtD } from "@/components/finance-ui";
import { dtVN } from "@/components/care-ui";
import { CsvButton } from "@/components/csv-button";
import { MovementButton, TransferButton, SellButton, RentButton, CloseRentalButton } from "@/components/inventory-ui";
import { TONE_CHIP, TONE_VI } from "@/components/shared-format";
import { productMethods } from "../loaders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tồn kho" };

type SP = { center?: string; type?: string; tone?: string; q?: string; tab?: string; mtype?: string; page?: string; rstatus?: string; item?: string };

export default async function InventoryDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "inventory:read")) return <NoAccess title="Tồn kho" perm="inventory:read" />;
  const type = ITEM_TYPES.includes(sp.type as ItemType) ? (sp.type as ItemType) : undefined;
  const tone = sp.tone === "out" || sp.tone === "low" || sp.tone === "ok" ? sp.tone : undefined;
  const tab = sp.tab === "log" || sp.tab === "rentals" ? sp.tab : "stock";
  const d = await caller.inventory.stock({ centerId: sp.center || undefined, type, tone, q: sp.q || undefined });
  const catalog = await caller.inventory.items({});
  const items = catalog.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, type: i.type, salePrice: i.salePrice, rentPrice: i.rentPrice, deposit: i.deposit }));
  const centers = d.centers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }));
  const myCenters = d.centerId ? centers.filter((c) => c.id === d.centerId) : centers;
  const methods = await productMethods(caller, actor);
  const q = (patch: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    const qs = u.toString();
    return `/inventory/dashboard${qs ? `?${qs}` : ""}`;
  };
  const k = d.kpi;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tồn kho"
        desc="Tồn theo cơ sở, giá vốn bình quân. Mọi thay đổi tồn đi qua phiếu (không sửa / xoá được); tồn không bao giờ âm."
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canReceive && <MovementButton type="receipt" centers={myCenters} items={items} />}
            {d.canIssue && <MovementButton type="issue" centers={myCenters} items={items} label="Cấp phát" />}
            {d.canIssue && <MovementButton type="return" centers={myCenters} items={items} label="Nhận lại" />}
            {d.canReceive && <MovementButton type="damage" centers={myCenters} items={items} label="Báo hỏng" />}
            {d.canReceive && <TransferButton centers={myCenters} allCenters={centers} items={items} />}
            {d.canIssue && <SellButton centers={myCenters} items={items} methods={methods} />}
            {d.canIssue && <RentButton centers={myCenters} items={items} methods={methods} />}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {d.centers.length > 1 && <Link href={q({ center: undefined })} className={`chip ${!d.centerId ? "bg-brand-600 text-white" : "bg-black/5"}`}>Tất cả cơ sở</Link>}
        {d.centers.map((c) => <Link key={c.id} href={q({ center: c.id })} className={`chip ${d.centerId === c.id ? "bg-brand-600 text-white" : "bg-black/5"}`}>{c.code}</Link>)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Mã hàng còn tồn" value={k.skus} hint={`${k.units.toLocaleString("vi-VN")} đơn vị`} />
        <Kpi label="Giá trị tồn" value={vnd(k.value)} tone="brand" />
        <Kpi label="Sắp hết" value={<Link href={q({ tab: "stock", tone: "low" })}>{k.low}</Link>} tone={k.low ? "warn" : "default"} />
        <Kpi label="Hết hàng" value={<Link href={q({ tab: "stock", tone: "out" })}>{k.out}</Link>} tone={k.out ? "bad" : "default"} />
        <Kpi label="Đang cho thuê" value={<Link href={q({ tab: "rentals" })}>{k.rentalsOut}</Link>} />
        <Kpi label="Thuê quá hạn" value={<Link href={q({ tab: "rentals", rstatus: "overdue" })}>{k.rentalsOverdue}</Link>} tone={k.rentalsOverdue ? "bad" : "default"} />
        <Kpi label="Kiểm kê chờ duyệt" value={<Link href="/inventory/audit">{k.auditsWaiting}</Link>} tone={k.auditsWaiting ? "warn" : "default"} hint={`${k.auditsOpen} phiếu đang mở`} />
      </div>
      <div className="flex gap-1 border-b border-black/10 text-sm">
        {([["stock", "Tồn kho"], ["log", "Nhật ký phiếu"], ["rentals", "Cho thuê"]] as const).map(([key, label]) => (
          <Link key={key} href={q({ tab: key === "stock" ? undefined : key })} className={`-mb-px border-b-2 px-3 py-2 ${tab === key ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600"}`}>{label}</Link>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <form className="flex flex-wrap gap-2" action="/inventory/dashboard">
            {d.centerId && <input type="hidden" name="center" value={d.centerId} />}
            <input name="q" defaultValue={sp.q} placeholder="Mã / tên hàng" className="input w-56" />
            <select name="type" defaultValue={type ?? ""} className="input"><option value="">Mọi loại</option>{ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_VI[t]}</option>)}</select>
            <select name="tone" defaultValue={tone ?? ""} className="input"><option value="">Mọi mức tồn</option><option value="low">Sắp hết</option><option value="out">Hết hàng</option><option value="ok">Đủ</option></select>
            <button className="btn-ghost">Lọc</button>
            <CsvButton filename="ton-kho" headers={["Cơ sở", "Mã", "Tên", "Loại", "ĐVT", "Tồn", "Tối thiểu", "Giá vốn BQ", "Giá trị"]} rows={d.rows.map((r) => [r.centerCode, r.sku, r.name, r.typeLabel, r.unit, r.onHand, r.reorderLevel, r.avgCost, r.value])} />
          </form>
          {d.rows.length === 0 ? <Empty>Không có dòng tồn phù hợp.</Empty> : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Cơ sở</th><th className="p-3">Mặt hàng</th><th className="p-3">Loại</th><th className="p-3 text-right">Tồn</th><th className="p-3 text-right">Tối thiểu</th><th className="p-3 text-right">Giá vốn BQ</th><th className="p-3 text-right">Giá trị</th><th className="p-3">Mức</th><th /></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.rows.map((r) => (
                    <tr key={`${r.itemId}-${r.centerId}`}>
                      <td className="p-3">{r.centerCode}</td>
                      <td className="p-3"><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-ink-400">{r.sku}</div></td>
                      <td className="p-3 text-xs">{r.typeLabel}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{r.onHand} <span className="text-xs font-normal text-ink-400">{r.unit}</span></td>
                      <td className="p-3 text-right tabular-nums text-ink-400">{r.reorderLevel || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{vnd(r.avgCost)}</td>
                      <td className="p-3 text-right tabular-nums">{vnd(r.value)}</td>
                      <td className="p-3"><span className={`chip ${TONE_CHIP[r.tone]}`}>{TONE_VI[r.tone]}</span></td>
                      <td className="p-3 text-right"><Link className="text-xs text-brand-600" href={`/inventory/dashboard?tab=log&center=${r.centerId}&item=${r.itemId}`}>Thẻ kho</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "log" && <MovementLog sp={sp} caller={caller} centerId={d.centerId} />}
      {tab === "rentals" && <RentalList sp={sp} caller={caller} centerId={d.centerId} />}
    </div>
  );
}

type Caller = Awaited<ReturnType<typeof getServerCaller>>["caller"];

async function MovementLog({ sp, caller, centerId }: { sp: SP; caller: Caller; centerId: string | null }) {
  const mtype = MOVEMENT_TYPES.includes(sp.mtype as MovementType) ? (sp.mtype as MovementType) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await caller.inventory.movements({ centerId: centerId ?? undefined, itemId: sp.item || undefined, type: mtype, page });
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap gap-2" action="/inventory/dashboard">
        <input type="hidden" name="tab" value="log" />
        {centerId && <input type="hidden" name="center" value={centerId} />}
        {sp.item && <input type="hidden" name="item" value={sp.item} />}
        <select name="mtype" defaultValue={mtype ?? ""} className="input"><option value="">Mọi loại phiếu</option>{MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_TYPE_VI[t]}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
        {sp.item && <Link href={`/inventory/dashboard?tab=log${centerId ? `&center=${centerId}` : ""}`} className="btn-ghost">Bỏ lọc mặt hàng</Link>}
      </form>
      {d.items.length === 0 ? <Empty>Chưa có phiếu.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian / số phiếu</th><th className="p-3">Loại</th><th className="p-3">Mặt hàng</th><th className="p-3 text-right">SL</th><th className="p-3 text-right">Tồn sau</th><th className="p-3">Đối tượng</th><th className="p-3">Người lập</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((m) => (
                <tr key={m.id}>
                  <td className="p-3 text-xs">{dtVN(m.createdAt)}<div className="font-mono text-ink-400">{m.code}</div></td>
                  <td className="p-3 text-xs">{m.typeLabel}<div className="text-ink-400">{m.centerCode}{m.counterpartCode ? (m.qty < 0 ? ` → ${m.counterpartCode}` : ` ← ${m.counterpartCode}`) : ""}</div></td>
                  <td className="p-3 text-xs"><div className="font-medium">{m.itemName}</div><div className="font-mono text-ink-400">{m.sku}</div></td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${m.qty < 0 ? "text-red-700" : "text-green-700"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td className="p-3 text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="p-3 text-xs">
                    {m.studentName && <div>HV: {m.studentName}</div>}{m.classCode && <div>Lớp: {m.classCode}</div>}
                    {m.orderCode && m.orderId && <div>Đơn: <Link className="text-brand-600" href={`/orders/${m.orderId}`}>{m.orderCode}</Link></div>}
                    {m.supplier && <div>NCC: {m.supplier}</div>}{m.unitCost != null && m.type === "receipt" && <div>Giá nhập {vnd(m.unitCost)}</div>}
                    {m.note && <div className="text-ink-400">{m.note}</div>}
                  </td>
                  <td className="p-3 text-xs">{m.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/inventory/dashboard" params={{ ...sp, tab: "log" }} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}

async function RentalList({ sp, caller, centerId }: { sp: SP; caller: Caller; centerId: string | null }) {
  const overdue = sp.rstatus === "overdue";
  const status = sp.rstatus === "returned" || sp.rstatus === "lost" || sp.rstatus === "out" ? (sp.rstatus as RentalStatus) : undefined;
  const rows = await caller.inventory.rentals({ centerId: centerId ?? undefined, status: overdue ? undefined : status ?? "out", overdue });
  const tabs = [["out", "Đang thuê"], ["overdue", "Quá hạn"], ["returned", "Đã trả"], ["lost", "Mất"]] as const;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/inventory/dashboard?tab=rentals&rstatus=${key}${centerId ? `&center=${centerId}` : ""}`} className={`chip ${(sp.rstatus ?? "out") === key ? "bg-brand-600 text-white" : "bg-black/5"}`}>{label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <Empty>Không có phiếu thuê.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Phiếu</th><th className="p-3">Học viên</th><th className="p-3">Mặt hàng</th><th className="p-3">Thời hạn</th><th className="p-3 text-right">Tiền thuê / cọc</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-mono text-xs">{r.code}<div className="font-sans text-ink-400">{r.centerCode}</div>{r.orderCode && r.orderId && <Link className="font-sans text-brand-600" href={`/orders/${r.orderId}`}>{r.orderCode}</Link>}</td>
                  <td className="p-3"><Link className="hover:underline" href={`/students/${r.studentId}`}>{r.studentName}</Link><div className="font-mono text-xs text-ink-400">{r.studentCode}</div></td>
                  <td className="p-3 text-xs">{r.itemName} × {r.qty}<div className="font-mono text-ink-400">{r.sku}</div></td>
                  <td className="p-3 text-xs">{fmtD(r.startDate)} → {fmtD(r.dueDate)}{r.overdueDays > 0 && <div className="font-semibold text-red-700">Quá hạn {r.overdueDays} ngày</div>}</td>
                  <td className="p-3 text-right text-xs tabular-nums">{vnd(r.fee)}<div className="text-ink-400">cọc {vnd(r.deposit)}{r.depositCharged ? ` · trừ ${vnd(r.depositCharged)}` : ""}</div></td>
                  <td className="p-3 text-xs">
                    <span className={`chip ${r.status === "out" ? (r.overdueDays ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700") : r.status === "lost" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"}`}>{RENTAL_STATUS_VI[r.status as RentalStatus]}</span>
                    {r.returnedAt && <div className="text-ink-400">{dtVN(r.returnedAt)}</div>}
                    {r.note && <div className="text-ink-400">{r.note}</div>}
                    {r.canClose && <div className="mt-1"><CloseRentalButton id={r.id} deposit={r.deposit} /></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
