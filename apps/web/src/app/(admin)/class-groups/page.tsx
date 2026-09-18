import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { ClassGroupsTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhóm lớp" };

export default async function ClassGroupsPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const [ref, rows] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.academics.classes.groups({ centerId: sp.center || undefined, includeInactive: true }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhóm lớp"
        desc="Gom nhiều lớp thành một nhóm (khối) để lọc và báo cáo — ví dụ “Sata4 hè 2026 CS1”. Nhóm không gắn cơ sở dùng chung toàn hệ thống. Chọn nhóm cho từng lớp ở trang chi tiết lớp; nhóm còn lớp thì không xoá được."
      />
      <form className="flex gap-2">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[260px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      <ClassGroupsTable rows={rows} centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} defaultCenterId={sp.center ?? ""} />
    </div>
  );
}
