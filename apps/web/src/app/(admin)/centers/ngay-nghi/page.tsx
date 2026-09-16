import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { WEEKDAY_VI, Empty } from "@/components/ui";
import { HolidayForm, DeleteHoliday } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ngày nghỉ" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "holiday:read")) return <NoAccess title="Ngày nghỉ" perm="holiday:read" />;
  const canCreate = hasPermission(ctx.actor as Actor, "holiday:create");
  const year = Number(sp.year) || undefined;
  const [ref, d] = await Promise.all([caller.academics.classes.referenceData(), caller.catalog.holidays({ year, centerId: sp.center || undefined })]);
  const wd = (iso: string) => WEEKDAY_VI[new Date(iso + "T00:00:00Z").getUTCDay() || 7];
  return (
    <div className="space-y-4">
      <Link href="/centers" className="text-sm text-ink-600">← Cơ sở</Link>
      <PageHeader title="Ngày nghỉ" desc="Ngày nghỉ lễ toàn hệ thống (Hội sở) và ngày nghỉ riêng từng cơ sở. Khi sinh buổi / áp lịch mới, các ngày này tự bị bỏ qua; khi thêm ngày nghỉ có thể dời luôn các buổi bị ảnh hưởng." />
      {canCreate && <HolidayForm centers={ref.centers} canGlobal={d.canGlobal} today={d.today} />}
      <form className="flex flex-wrap gap-2">
        <select name="year" defaultValue={String(d.year)} className="input max-w-[120px]">
          {[d.year - 1, d.year, d.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[220px]">
          <option value="">Mọi cơ sở được xem</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      {d.items.length === 0 ? <Empty>Chưa có ngày nghỉ trong năm {d.year}.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Ngày</th><th className="p-3">Tên</th><th className="p-3">Phạm vi</th><th className="p-3">Người tạo</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((h) => (
                <tr key={h.id} className={h.past ? "text-ink-400" : ""}>
                  <td className="p-3 whitespace-nowrap">{wd(h.date)}, {h.date.split("-").reverse().join("/")}</td>
                  <td className="p-3 font-medium">{h.name}</td>
                  <td className="p-3">{h.centerCode ? <span className="chip bg-black/5">{h.centerCode}</span> : <span className="chip bg-brand-100 text-brand-700">Toàn hệ thống</span>}</td>
                  <td className="p-3 text-xs">{h.createdByName ?? "—"}</td>
                  <td className="p-3 text-right">{h.canDelete && <DeleteHoliday id={h.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
