import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { TimesheetTabs } from "../tabs";
import { RosterMonth } from "./roster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lưới phân ca" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ center?: string; period?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Lưới phân ca" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period! : now;
  const r = await caller.hr.roster({ centerId, period });
  const [y, m] = period.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const href = (p: string) => `/cham-cong/phan-ca?center=${centerId}&period=${p}`;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Lưới phân ca"
        desc="Xếp ca theo tháng. Sinh lưới có Chạy thử trước rồi mới Ghi thật, kết quả chia 8 nhóm. Ô sửa tay (T), ô sinh từ đơn đã duyệt (Đ) và ô nhập từ Sheet (N) được bảo vệ khi sinh lưới; lưới chỉ áp từ NGÀY MAI. Người được xếp ca nhận thông báo ngay."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/cham-cong?center=${centerId}&period=${period}`} className="btn-ghost">Bảng công</Link>
            <Link href={`/cham-cong/danh-muc-ca?center=${centerId}`} className="btn-ghost">Mã ca</Link>
            <Link href={href(prev)} className="btn-ghost">‹ Tháng trước</Link>
            <Link href={href(next)} className="btn-ghost">Tháng sau ›</Link>
          </div>
        }
      />
      <TimesheetTabs centerId={centerId} period={period} active="phan-ca" />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong/phan-ca">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        <input type="month" name="period" defaultValue={period} className="input w-auto" />
        <button className="btn-ghost">Xem</button>
      </form>
      <RosterMonth centerId={centerId} period={period} data={r} />
    </div>
  );
}
