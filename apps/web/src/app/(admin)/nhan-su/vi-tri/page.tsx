import Link from "next/link";
import { hasPermission, POSITION_KINDS, POSITION_KIND_VI, DEPARTMENT_VI, STAFF_STATUS_VI, type Actor, type PositionKind, type Department } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dmy } from "@/components/hr-ui";
import { CsvButton } from "@/components/csv-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vị trí công việc" };

export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ kind?: string; date?: string; ended?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "staff:read")) return <NoAccess title="Vị trí công việc" perm="staff:read" />;
  const kind = POSITION_KINDS.includes(sp.kind as PositionKind) ? (sp.kind as PositionKind) : undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined;
  const d = await caller.hr.positions({ kind, date, includeEnded: sp.ended === "1", centerId: sp.center || undefined });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Vị trí công việc"
        desc="Mỗi nhân sự có một vị trí chính tại một thời điểm; có thể kiêm nhiệm thêm hoặc được uỷ quyền tạm thời (tối đa 90 ngày). Thêm / kết thúc vị trí trong hồ sơ nhân sự."
        actions={<div className="flex gap-2"><Link href="/nhan-su" className="btn-ghost">← Nhân sự</Link><CsvButton filename="vi-tri-cong-viec" headers={["Mã NV", "Họ tên", "Chức danh", "Loại", "Bộ phận", "Cơ sở", "Từ", "Đến"]} rows={d.items.map((p) => [p.staffCode, p.staffName, p.title, POSITION_KIND_VI[p.kind], DEPARTMENT_VI[p.department as Department] ?? p.department, p.centerCode, p.effectiveFrom, p.effectiveTo])} /></div>}
      />
      <form className="flex flex-wrap items-end gap-2" action="/nhan-su/vi-tri">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="text-xs text-ink-600">Tại ngày<input type="date" name="date" defaultValue={d.date} className="input mt-1" /></label>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="ended" value="1" defaultChecked={sp.ended === "1"} /> Gồm cả vị trí đã kết thúc</label>
        <button className="btn-ghost">Xem</button>
      </form>
      <StatTabs basePath="/nhan-su/vi-tri" params={sp} active={kind ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...POSITION_KINDS.map((k) => ({ key: k, label: POSITION_KIND_VI[k] }))]} />
      {d.items.length === 0 ? <Empty>Không có vị trí.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Cơ sở</th><th className="p-3">Chức danh</th><th className="p-3">Nhân sự</th><th className="p-3">Loại</th><th className="p-3">Hiệu lực</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 text-xs">{p.centerCode}</td>
                  <td className="p-3">{p.title}<div className="text-xs text-ink-400">{DEPARTMENT_VI[p.department as Department] ?? p.department}</div></td>
                  <td className="p-3"><Link href={`/nhan-su/${p.staffId}`} className="text-brand-700">{p.staffName}</Link><div className="text-xs text-ink-400">{p.staffCode}{p.staffStatus === "resigned" ? ` · ${STAFF_STATUS_VI.resigned}` : ""}</div></td>
                  <td className="p-3 text-xs"><span className={`chip ${p.kind === "primary" ? "bg-green-100 text-green-800" : p.kind === "delegated" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{POSITION_KIND_VI[p.kind]}</span></td>
                  <td className="p-3 text-xs">{dmy(p.effectiveFrom)} → {p.effectiveTo ? dmy(p.effectiveTo) : "nay"}{p.endingSoon && <div className="text-amber-700">Sắp hết hiệu lực</div>}{p.endReason && <div className="text-ink-400">{p.endReason}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
