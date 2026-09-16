import { getServerCaller } from "@/lib/trpc/server";
import { LeadSubnav } from "@/components/lead-ui";
import { DistributionBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center ?? ref.centers[0]?.id ?? null;
  return (
    <div className="space-y-4">
      <LeadSubnav active="/ops/leads/distribution" />
      <div>
        <h1 className="text-2xl font-bold">Quản lý chia lead</h1>
        <p className="text-sm text-ink-600">Chọn chế độ chia cho cơ sở; bảng sale nhận lead với lượt đã nhận, lead đang giữ, tỷ lệ chốt. "Đặt lại lượt" bắt đầu chu kỳ luân phiên mới.</p>
      </div>
      <form className="flex gap-2 items-center">
        <select name="center" defaultValue={centerId ?? ""} className="input max-w-xs">
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Xem</button>
      </form>
      {centerId && <DistributionBoard centerId={centerId} />}
    </div>
  );
}
