import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { hm, flagLabel } from "@/components/hr-ui";
import { FullScreenQr } from "./screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Màn hình QR chấm công" };

export default async function CheckinScreenPage({ searchParams }: { searchParams: Promise<{ center?: string; point?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "timesheet:read")) return <NoAccess title="Màn hình QR" perm="timesheet:read" />;
  const ref = await caller.academics.classes.referenceData();
  const centerId = ref.centers.find((c) => c.id === sp.center)?.id ?? ref.centers[0]?.id;
  if (!centerId) return <Empty>Chưa có cơ sở.</Empty>;
  const d = await caller.hr.checkinScreen({ centerId, pointId: sp.point });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Màn hình QR chấm công"
        desc="Chiếu mã này tại quầy để nhân sự quét bằng camera điện thoại. Mã cố định — ảnh chụp vẫn quét được, nhưng quét ngoài bán kính điểm chấm công sẽ bị từ chối. TV rớt mạng vẫn giữ mã cuối."
        actions={<Link href={`/cham-cong/diem-cham?center=${centerId}`} className="btn-ghost">Sửa điểm chấm công</Link>}
      />
      <form className="flex flex-wrap items-end gap-2" action="/cham-cong/man-hinh">
        {ref.centers.length > 1 ? <select name="center" defaultValue={centerId} className="input w-auto">{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select> : <input type="hidden" name="center" value={centerId} />}
        {d.points.length > 1 && <select name="point" defaultValue={d.point?.id} className="input w-auto">{d.points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <button className="btn-ghost">Xem</button>
      </form>
      {!d.point ? (
        <Empty>Cơ sở chưa có điểm chấm công đang dùng — tạo ở trang Điểm chấm công.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="card space-y-2 p-4 text-center">
            <div className="text-sm font-semibold">{d.center?.name}</div>
            <div className="text-xs text-ink-500">{d.point.name} · Mã cố định · đời khoá {d.point.keyVersion}</div>
            <div className="mx-auto w-full max-w-xs" dangerouslySetInnerHTML={{ __html: d.point.qrSvg }} />
            <div className="text-xs text-ink-500">Kiểm định vị: {d.point.geofenceEnabled ? `Bật · bán kính ${d.point.radiusM}m` : "Tắt"}</div>
            <FullScreenQr svg={d.point.qrSvg} centerName={d.center?.name ?? ""} pointName={d.point.name} />
          </div>
          <div className="card overflow-x-auto p-0">
            <div className="p-3 text-sm font-semibold">Lượt chấm hôm nay ({d.punches.length})</div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Nhân sự</th><th className="p-3">Giờ</th><th className="p-3">Vào/Ra</th><th className="p-3">Cờ</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {d.punches.map((p, i) => (
                  <tr key={i}>
                    <td className="p-3">{p.name}<div className="text-xs text-ink-400">{p.code}</div></td>
                    <td className="p-3 tabular-nums">{hm(p.min)}</td>
                    <td className="p-3">{p.kind === "in" ? "Vào" : "Ra"}</td>
                    <td className="p-3 text-xs text-amber-700">{p.flags.map(flagLabel).join(", ")}</td>
                  </tr>
                ))}
                {d.punches.length === 0 && <tr><td className="p-3 text-sm text-ink-400" colSpan={4}>Chưa có lượt chấm nào hôm nay.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
