import Link from "next/link";
import { hasPermission, ITEM_TYPES, ITEM_TYPE_VI, type Actor, type ItemType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { SellButton, RentButton } from "@/components/inventory-ui";
import { TONE_CHIP } from "@/components/shared-format";
import { ItemForm } from "./item-form";
import { productMethods } from "../inventory/loaders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sản phẩm & danh mục hàng" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string; all?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "inventory:read")) return <NoAccess title="Sản phẩm bán/thuê" perm="inventory:read" />;
  const type = ITEM_TYPES.includes(sp.type as ItemType) ? (sp.type as ItemType) : sp.type === "any" ? undefined : ("product" as ItemType);
  const d = await caller.inventory.items({ type, q: sp.q || undefined, includeInactive: sp.all === "1" });
  const courses = d.canEdit && hasPermission(actor, "course:read") ? await caller.catalog.courseOptions() : [];
  const all = await caller.inventory.items({});
  const opts = all.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, type: i.type, salePrice: i.salePrice, rentPrice: i.rentPrice, deposit: i.deposit }));
  const centers = d.centers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }));
  const methods = hasPermission(actor, "inventory:create") ? await productMethods(caller, actor) : [];
  const tabs: [string, string][] = [["product", ITEM_TYPE_VI.product], ["kit", ITEM_TYPE_VI.kit], ["component", ITEM_TYPE_VI.component], ["material", ITEM_TYPE_VI.material], ["any", "Tất cả"]];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sản phẩm bán / thuê"
        desc="Danh mục hàng dùng chung toàn hệ thống (Hội sở quản lý): giá bán, giá thuê theo tháng, tiền cọc, mức tồn tối thiểu. Bán / cho thuê tự lập đơn hàng và xuất kho."
        actions={<div className="flex flex-wrap gap-2">{d.canEdit && <ItemForm courses={courses} defaultType={type ?? "product"} />}{methods.length > 0 && <SellButton centers={centers} items={opts} methods={methods} />}{hasPermission(actor, "inventory:create") && <RentButton centers={centers} items={opts} methods={methods} />}</div>}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {tabs.map(([k, label]) => <Link key={k} href={`/products?type=${k}`} className={`chip ${(sp.type ?? "product") === k ? "bg-brand-600 text-white" : "bg-black/5"}`}>{label}</Link>)}
        <form className="ml-auto flex gap-2" action="/products">
          <input type="hidden" name="type" value={sp.type ?? "product"} />
          <input name="q" defaultValue={sp.q} placeholder="Mã / tên" className="input w-48" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="all" value="1" defaultChecked={sp.all === "1"} /> gồm hàng ngừng dùng</label>
          <button className="btn-ghost">Lọc</button>
        </form>
      </div>
      {d.items.length === 0 ? <Empty>Chưa có mặt hàng.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Mặt hàng</th><th className="p-3">Loại</th><th className="p-3 text-right">Giá bán</th><th className="p-3 text-right">Thuê / tháng</th><th className="p-3 text-right">Cọc</th><th className="p-3">Tồn theo cơ sở</th><th /></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((i) => (
                <tr key={i.id} className={i.isActive ? "" : "opacity-50"}>
                  <td className="p-3"><div className="font-medium">{i.name}</div><div className="font-mono text-xs text-ink-400">{i.sku} · {i.unit}{i.courseCode ? ` · ${i.courseCode}` : ""}</div>{!i.isActive && <span className="chip bg-slate-100 text-slate-500">Ngừng dùng</span>}</td>
                  <td className="p-3 text-xs">{i.typeLabel}</td>
                  <td className="p-3 text-right tabular-nums">{i.salePrice ? vnd(i.salePrice) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{i.rentPrice ? vnd(i.rentPrice) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{i.deposit ? vnd(i.deposit) : "—"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{i.byCenter.map((b) => <Link key={b.centerId} href={`/inventory/dashboard?tab=log&center=${b.centerId}&item=${i.id}`} className={`chip ${TONE_CHIP[b.tone]}`}>{b.code}: {b.onHand}</Link>)}</div></td>
                  <td className="p-3 text-right">{d.canEdit && <ItemForm courses={courses} item={{ id: i.id, sku: i.sku, name: i.name, type: i.type as ItemType, unit: i.unit, courseId: i.courseId, salePrice: i.salePrice, rentPrice: i.rentPrice, deposit: i.deposit, reorderLevel: i.reorderLevel, description: i.description, isActive: i.isActive }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
