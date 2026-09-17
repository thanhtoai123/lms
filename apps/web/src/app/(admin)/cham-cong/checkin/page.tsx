import Link from "next/link";
import { PageHeader } from "@/components/admin-ui";
import { CheckinPanel } from "./panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chấm công" };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const token = (sp.t ?? "").trim();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title="Chấm công"
        desc="Cần quét mã QR tại quầy. Mở từ menu thì không chấm được — dùng camera điện thoại quét mã dán tại quầy (hoặc chiếu trên màn hình quầy) của cơ sở."
        actions={<Link href="/cham-cong/lich-ca" className="btn-ghost">Về lịch ca của tôi</Link>}
      />
      {!token ? (
        <div className="card p-6 text-sm">
          <p className="font-semibold">Chưa có mã quét.</p>
          <p className="mt-1 text-ink-600">Hãy quét mã QR tại quầy bằng camera điện thoại. Mã sẽ mở lại đúng trang này kèm mã hợp lệ.</p>
        </div>
      ) : (
        <CheckinPanel token={token} />
      )}
    </div>
  );
}
