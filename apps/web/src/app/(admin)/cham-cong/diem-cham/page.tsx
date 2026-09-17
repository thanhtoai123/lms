import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { TimesheetTabs } from "../tabs";
import { PointsAdmin } from "./points";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm chấm công" };

export default async function CheckinPointsPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Điểm chấm công" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const d = await caller.hr.checkinPoints({ centerId, includeInactive: true });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Điểm chấm công"
        desc="Mã QR dán tại quầy là mã cố định — ảnh chụp vẫn quét được, thứ chặn người ở xa là định vị: quét ngoài bán kính của điểm sẽ bị từ chối. Đổi đời khoá khi cần huỷ hiệu lực mã đã in."
        actions={<Link href={`/cham-cong/man-hinh?center=${centerId}`} className="btn-ghost">Màn hình QR</Link>}
      />
      <TimesheetTabs centerId={centerId} active="diem-cham" />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong/diem-cham">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        <button className="btn-ghost">Xem</button>
      </form>
      <PointsAdmin centerId={centerId} data={d} />
    </div>
  );
}
