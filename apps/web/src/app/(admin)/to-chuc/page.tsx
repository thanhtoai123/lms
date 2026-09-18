import Link from "next/link";
import { hasPermission, ORG_UNIT_TYPE_VI, type Actor, type OrgUnitType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { SeedTree, NewUnit, UnitActions, LegalEntityForm, RegionForm, DeleteRegion, AssignRegion, type Unit, type LegalEntity } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cây tổ chức" };

const TYPE_CHIP: Record<OrgUnitType, string> = {
  root: "bg-slate-200 text-slate-800",
  ho: "bg-violet-100 text-violet-800",
  region: "bg-sky-100 text-sky-800",
  department: "bg-amber-100 text-amber-800",
  center: "bg-green-100 text-green-800",
  site: "bg-emerald-100 text-emerald-800",
  partner: "bg-orange-100 text-orange-800",
  franchise_legacy: "bg-rose-100 text-rose-800",
};

export default async function OrgTreePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Cây tổ chức" perm="system:read" />;
  const tab = sp.tab === "khu-vuc" || sp.tab === "phap-nhan" ? sp.tab : "cay";

  const [tree, unlinked, legacy] = await Promise.all([caller.org.unitTree(), caller.org.unlinkedCenters(), caller.admin.orgTree()]);
  const units = tree.items as unknown as Unit[];
  const entities = tree.legalEntities as unknown as (LegalEntity & { address: string | null; representative: string | null })[];
  const canEdit = tree.canEdit;
  const totals = units.reduce(
    (a, u) => ({ centers: a.centers + (u.type === "center" ? 1 : 0), students: a.students + u.students, staff: a.staff + u.staff }),
    { centers: 0, students: 0, staff: 0 },
  );
  const regionOpts = legacy.regions.map((r) => ({ id: r.id, code: r.code, name: r.name }));

  const TABS = [
    { key: "cay", label: `Cây tổ chức (${units.length})` },
    { key: "phap-nhan", label: `Pháp nhân (${entities.length})` },
    { key: "khu-vuc", label: `Khu vực cũ (${legacy.regions.length})` },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cây tổ chức"
        desc={`Gốc hệ thống → hội sở → khối vùng → phòng ban → cơ sở → điểm dạy. ${units.length} đơn vị · ${totals.centers} cơ sở · ${totals.students} học viên · ${totals.staff} nhân sự. Đường dẫn (path) quyết định ai thấy dữ liệu của nhánh nào; chỉ đơn vị Đang hoạt động được tính khi xét quyền.`}
        actions={canEdit && tab === "cay" && units.length > 0 ? <NewUnit units={units} entities={entities} centers={unlinked} /> : canEdit && tab === "phap-nhan" ? <LegalEntityForm /> : canEdit && tab === "khu-vuc" ? <RegionForm managers={legacy.managerOptions} /> : null}
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-black/5 text-sm" aria-label="Nhóm">
        {TABS.map((t) => (
          <Link key={t.key} href={`/to-chuc?tab=${t.key}`} className={`whitespace-nowrap border-b-2 px-3 py-2 ${t.key === tab ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "cay" && (
        <>
          {units.length === 0 ? (
            <>
              <Empty>Chưa dựng cây tổ chức. Cây mới chạy song song với khu vực / cơ sở đang dùng — dựng xong không ảnh hưởng phân quyền hiện tại.</Empty>
              {canEdit && <SeedTree />}
            </>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400">
                  <tr>
                    <th className="p-3">Đơn vị</th><th className="p-3">Loại</th><th className="p-3">Quan hệ</th><th className="p-3">Pháp nhân</th>
                    <th className="p-3">Đường dẫn</th><th className="p-3">Quy mô</th><th className="p-3">Trạng thái</th>{canEdit && <th className="p-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {units.map((u) => (
                    <tr key={u.id} className={u.status === "active" ? "" : "opacity-60"}>
                      <td className="p-3">
                        <div style={{ paddingLeft: `${u.depth * 16}px` }}>
                          <span className="font-semibold">{u.code}</span> <span className="text-ink-600">{u.name}</span>
                          {u.address && <div className="text-xs text-ink-400">{u.address}</div>}
                          {u.note && <div className="text-xs text-ink-400">{u.note}</div>}
                        </div>
                      </td>
                      <td className="p-3"><span className={`chip ${TYPE_CHIP[u.type]}`}>{ORG_UNIT_TYPE_VI[u.type]}</span></td>
                      <td className="p-3 text-xs">{u.relationshipLabel}</td>
                      <td className="p-3 text-xs">{u.legalEntityName ?? <span className="text-ink-400">—</span>}</td>
                      <td className="p-3"><code className="font-mono text-[11px] text-ink-600">{u.path}</code></td>
                      <td className="p-3 text-xs text-ink-600">
                        {u.centerId ? <>{u.students} HV · {u.classes} lớp · {u.staff} NS</> : u.children ? `${u.children} đơn vị con` : <span className="text-ink-400">—</span>}
                      </td>
                      <td className="p-3"><span className={`chip ${u.status === "active" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{u.statusLabel}</span></td>
                      {canEdit && <td className="p-3 text-right"><UnitActions unit={u} units={units} entities={entities} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {units.length > 0 && canEdit && unlinked.length > 0 && (
            <div className="card border-dashed p-4 text-sm">
              <b className="text-amber-700">{unlinked.length} cơ sở chưa có đơn vị trong cây</b>
              <p className="text-xs text-ink-600">{unlinked.map((c) => `${c.code} — ${c.name}`).join(" · ")}. Dùng &quot;+ Thêm đơn vị&quot; loại Cơ sở rồi chọn &quot;Gắn vào cơ sở sẵn có&quot;, hoặc dựng lại cây.</p>
              <div className="mt-2"><SeedTree /></div>
            </div>
          )}
        </>
      )}

      {tab === "phap-nhan" && (
        <div className="card overflow-x-auto">
          {entities.length === 0 ? <div className="p-4"><Empty>Chưa khai pháp nhân nào.</Empty></div> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Tên pháp nhân</th><th className="p-3">Mã số thuế</th><th className="p-3">Người đại diện</th><th className="p-3">Địa chỉ</th><th className="p-3">Đơn vị dùng</th><th className="p-3">Trạng thái</th>{canEdit && <th className="p-3" />}</tr></thead>
              <tbody className="divide-y divide-black/5">
                {entities.map((e) => (
                  <tr key={e.id} className={e.isActive ? "" : "opacity-60"}>
                    <td className="p-3 font-medium">{e.legalName}</td>
                    <td className="p-3 font-mono text-xs">{e.taxCode}</td>
                    <td className="p-3 text-xs">{e.representative ?? "—"}</td>
                    <td className="p-3 text-xs">{e.address ?? "—"}</td>
                    <td className="p-3 text-xs">{units.filter((u) => u.legalEntityId === e.id).map((u) => u.code).join(", ") || "—"}</td>
                    <td className="p-3"><span className={`chip ${e.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{e.isActive ? "Đang hoạt động" : "Ngừng"}</span></td>
                    {canEdit && <td className="p-3 text-right"><LegalEntityForm entity={e} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "khu-vuc" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Khu vực và cơ sở là nguồn <b>phân quyền theo cơ sở</b> đang chạy. Cây tổ chức mới ánh xạ sang đây (đơn vị loại Cơ sở ↔ một dòng cơ sở), nên hai bên luôn khớp nhau.</p>
          {legacy.regions.length === 0 && <Empty>Chưa có khu vực.</Empty>}
          {legacy.regions.map((r) => (
            <section key={r.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{r.name} <span className="text-sm font-normal text-ink-400">({r.code})</span></h2>
                  <p className="text-xs text-ink-600">Phụ trách: {r.managerName ?? "—"} · {r.centers.length} cơ sở</p>
                </div>
                {canEdit && <div className="flex gap-2"><RegionForm managers={legacy.managerOptions} region={{ id: r.id, code: r.code, name: r.name, managerUserId: r.managerUserId, sortOrder: r.sortOrder }} /><DeleteRegion id={r.id} /></div>}
              </div>
              {r.centers.length === 0 ? <Empty>Khu vực chưa có cơ sở.</Empty> : (
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {r.centers.map((c) => (
                    <li key={c.id} className="rounded-xl border border-black/10 p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span><b>{c.code}</b> — {c.name}<div className="text-xs text-ink-600">{c.students} HV · {c.classes} lớp · {c.staff} NS</div></span>
                        {canEdit && <AssignRegion centerId={c.id} regionId={c.regionId} regions={regionOpts} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {legacy.unassigned.length > 0 && (
            <section className="card space-y-2 border-dashed p-4">
              <h2 className="font-semibold text-amber-700">Cơ sở chưa thuộc khu vực ({legacy.unassigned.length})</h2>
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {legacy.unassigned.map((c) => (
                  <li key={c.id} className="rounded-xl border border-black/10 p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span><b>{c.code}</b> — {c.name}</span>
                      {canEdit && <AssignRegion centerId={c.id} regionId={c.regionId} regions={regionOpts} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
