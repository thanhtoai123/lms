import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { RegionForm, DeleteRegion, AssignRegion } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cây tổ chức" };

type Tree = Awaited<ReturnType<Awaited<ReturnType<typeof getServerCaller>>["caller"]["admin"]["orgTree"]>>;
type CenterNode = Tree["unassigned"][number];

function CenterCard({ c, regions, canEdit }: { c: CenterNode; regions: { id: string; code: string; name: string }[]; canEdit: boolean }) {
  return (
    <div className={`rounded-xl border border-black/10 bg-white p-3 ${c.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href="/centers" className="font-semibold hover:underline">{c.code} — {c.name}</Link>
          {!c.isActive && <span className="chip ml-1 bg-slate-100 text-slate-600">Ngừng</span>}
          <div className="text-xs text-ink-600">Quản lý: {c.managers.length ? c.managers.join(", ") : <span className="text-amber-700">chưa gán</span>}</div>
        </div>
        {canEdit && <AssignRegion centerId={c.id} regionId={c.regionId} regions={regions} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-600">
        <span><b className="text-ink-900">{c.students}</b> học viên</span>
        <span><b className="text-ink-900">{c.classes}</b> lớp đang chạy/tuyển</span>
        <span><b className="text-ink-900">{c.staff}</b> nhân sự</span>
      </div>
      {c.departments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {c.departments.map((d) => <li key={d.key} className="chip bg-black/5 text-ink-600">{d.label}: {d.staff}</li>)}
        </ul>
      )}
    </div>
  );
}

export default async function OrgTreePage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Cây tổ chức" perm="system:read" />;
  const t = await caller.admin.orgTree();
  const regionOpts = t.regions.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  const totals = [...t.regions.flatMap((r) => r.centers), ...t.unassigned].reduce((a, c) => ({ centers: a.centers + 1, students: a.students + c.students, staff: a.staff + c.staff }), { centers: 0, students: 0, staff: 0 });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cây tổ chức"
        desc={`Hội sở → khu vực → cơ sở → bộ phận. ${totals.centers} cơ sở · ${totals.students} học viên · ${totals.staff} nhân sự.`}
        actions={t.canEdit ? <RegionForm managers={t.managerOptions} /> : null}
      />
      <div className="card p-4">
        <div className="text-sm font-semibold">Hội sở Sata Robo</div>
        <p className="text-xs text-ink-400">Nhân sự hội sở và phân quyền xem tại <Link href="/nhan-su" className="text-brand-600">Nhân sự</Link> · <Link href="/users" className="text-brand-600">Tài khoản</Link></p>
      </div>
      {t.regions.length === 0 && <Empty>Chưa có khu vực — tạo khu vực để nhóm các cơ sở.</Empty>}
      {t.regions.map((r) => (
        <section key={r.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{r.name} <span className="text-sm font-normal text-ink-400">({r.code})</span></h2>
              <p className="text-xs text-ink-600">Phụ trách: {r.managerName ?? "—"} · {r.centers.length} cơ sở</p>
            </div>
            {t.canEdit && (
              <div className="flex gap-2">
                <RegionForm managers={t.managerOptions} region={{ id: r.id, code: r.code, name: r.name, managerUserId: r.managerUserId, sortOrder: r.sortOrder }} />
                <DeleteRegion id={r.id} />
              </div>
            )}
          </div>
          {r.centers.length === 0 ? <Empty>Khu vực chưa có cơ sở.</Empty> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{r.centers.map((c) => <CenterCard key={c.id} c={c} regions={regionOpts} canEdit={t.canEdit} />)}</div>
          )}
        </section>
      ))}
      {t.unassigned.length > 0 && (
        <section className="card space-y-3 border-dashed p-4">
          <h2 className="font-semibold text-amber-700">Cơ sở chưa thuộc khu vực ({t.unassigned.length})</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{t.unassigned.map((c) => <CenterCard key={c.id} c={c} regions={regionOpts} canEdit={t.canEdit} />)}</div>
        </section>
      )}
    </div>
  );
}
