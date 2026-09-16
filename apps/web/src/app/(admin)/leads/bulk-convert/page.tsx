import { getServerCaller } from "@/lib/trpc/server";
import { BulkConvert } from "./table";

export const dynamic = "force-dynamic";

export default async function BulkConvertPage({ searchParams }: { searchParams: Promise<{ center?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chốt hàng loạt</h1>
        <p className="text-sm text-ink-600">Chọn lớp, ghi nhận đã đóng, đồng ý ảnh cho nhiều lead rồi chốt một lần. Mỗi dòng xử lý độc lập — dòng lỗi không chặn dòng khác. Sau chốt, tài khoản phụ huynh ở trạng thái <b>chờ kích hoạt</b> (OTP Zalo).</p>
      </div>
      <form className="flex flex-wrap gap-2 items-center">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-xs"><option value="">Mọi cơ sở</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Gõ để lọc tên PH / con" className="input max-w-xs" />
        <button className="btn-ghost">Lọc</button>
      </form>
      <BulkConvert centerId={sp.center || null} q={sp.q || undefined} />
    </div>
  );
}
