import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { RoomsTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phòng học" };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [ref, rows] = await Promise.all([caller.academics.classes.referenceData(), caller.org.rooms({ centerId: sp.center || undefined })]);
  return (
    <div className="space-y-4">
      <PageHeader title="Phòng học" desc="Phòng theo cơ sở, sức chứa và mức sử dụng tuần này. Lịch lớp dùng phòng để chặn trùng giờ." />
      <form className="flex gap-2">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[240px]"><option value="">Mọi cơ sở</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      <RoomsTable rows={rows} centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} defaultCenterId={sp.center || ref.centers[0]?.id || ""} />
    </div>
  );
}
