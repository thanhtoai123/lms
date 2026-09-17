import Link from "next/link";
import { hasPermission, authorize, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { MovementButton } from "@/components/inventory-ui";
import { TONE_CHIP } from "@/components/shared-format";
import { ItemForm } from "../products/item-form";
import { BomEditor, AssembleButton } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học cụ (Kits)" };

export default async function KitsPage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "inventory:read")) return <NoAccess title="Học cụ (Kits)" perm="inventory:read" />;
  const [kits, comps] = await Promise.all([caller.inventory.items({ type: "kit" }), caller.inventory.items({ type: "component" })]);
  const courses = kits.canEdit && hasPermission(actor, "course:read") ? await caller.catalog.courseOptions() : [];
  const centers = kits.centers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }));
  const canIssue = kits.centers.some((c) => authorize(actor, "inventory:create", { centerId: c.id }).allowed);
  const componentOpts = comps.items.map((c) => ({ id: c.id, label: `${c.sku} — ${c.name}` }));
  const kitOpts = kits.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, type: i.type }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Học cụ (Kits)"
        desc="Bộ học cụ theo khoá: định mức linh kiện, tồn từng cơ sở, số bộ đóng được từ linh kiện còn lại. Cấp phát cho học viên được ghi vào thẻ kho và hồ sơ học viên."
        actions={<div className="flex gap-2">{kits.canEdit && <ItemForm courses={courses} defaultType="kit" />}{canIssue && kitOpts.length > 0 && <MovementButton type="issue" centers={centers} items={kitOpts} label="Cấp học cụ cho HV" />}{canIssue && kitOpts.length > 0 && <MovementButton type="return" centers={centers} items={kitOpts} label="Nhận lại học cụ" />}</div>}
      />
      {kits.items.length === 0 ? <Empty>Chưa có bộ học cụ.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {kits.items.map((k) => (
            <div key={k.id} className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{k.name}</h2>
                  <div className="font-mono text-xs text-ink-400">{k.sku}{k.courseCode ? ` · khoá ${k.courseCode}` : ""}</div>
                  <div className="text-xs text-ink-600">{k.salePrice ? `Bán ${vnd(k.salePrice)}` : "Không bán"}{k.rentPrice ? ` · thuê ${vnd(k.rentPrice)}/tháng, cọc ${vnd(k.deposit ?? 0)}` : ""}</div>
                </div>
                {kits.canEdit && <ItemForm courses={courses} item={{ id: k.id, sku: k.sku, name: k.name, type: "kit", unit: k.unit, courseId: k.courseId, salePrice: k.salePrice, rentPrice: k.rentPrice, deposit: k.deposit, reorderLevel: k.reorderLevel, description: k.description, isActive: k.isActive }} />}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-ink-400">Định mức / 1 bộ</div>
                {k.bom.length === 0 ? <p className="text-sm text-amber-700">Chưa khai báo linh kiện.</p> : (
                  <ul className="text-sm">{k.bom.map((b) => <li key={b.componentId}>{b.qty} × {b.name} <span className="font-mono text-xs text-ink-400">{b.sku}</span></li>)}</ul>
                )}
                {kits.canEdit && componentOpts.length > 0 && <BomEditor kitId={k.id} lines={k.bom.map((b) => ({ componentId: b.componentId, qty: b.qty }))} components={componentOpts} />}
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="py-1">Cơ sở</th><th className="py-1 text-right">Tồn bộ</th><th className="py-1 text-right">Đóng thêm được</th><th /></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {k.byCenter.map((b) => (
                    <tr key={b.centerId}>
                      <td className="py-1.5">{b.code}</td>
                      <td className="py-1.5 text-right"><Link href={`/inventory/dashboard?tab=log&center=${b.centerId}&item=${k.id}`} className={`chip ${TONE_CHIP[b.tone]}`}>{b.onHand}</Link></td>
                      <td className="py-1.5 text-right tabular-nums">{k.bom.length ? b.assemblable : "—"}</td>
                      <td className="py-1.5 text-right">{k.bom.length > 0 && authorize(actor, "inventory:update", { centerId: b.centerId }).allowed && <AssembleButton kitId={k.id} centerId={b.centerId} max={b.assemblable} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {comps.items.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b border-black/5 p-3 font-semibold">Linh kiện</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/5">
              {comps.items.map((c) => (
                <tr key={c.id}>
                  <td className="p-3"><div className="font-medium">{c.name}</div><div className="font-mono text-xs text-ink-400">{c.sku}</div></td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{c.byCenter.map((b) => <span key={b.centerId} className={`chip ${TONE_CHIP[b.tone]}`}>{b.code}: {b.onHand}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
