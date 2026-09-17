import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { LegacyImporter } from "./importer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập giao dịch cũ" };

const dt = (d: Date | string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function LegacyImportPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:confirm")) return <NoAccess title="Nhập giao dịch cũ" perm="finance:confirm" />;
  const [batches, sales] = await Promise.all([caller.finance.importBatches({}), caller.finance.saleOptions().catch(() => [])]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhập giao dịch cũ"
        desc="Đưa học phí đã đóng trước khi lên hệ thống vào đúng hồ sơ từng em, để cổng phụ huynh thôi hiện nợ. Khớp theo số điện thoại phụ huynh + họ tên — mã học viên trong file và mã trên hệ thống là hai hệ đánh số khác nhau. Mỗi em một đơn, mỗi đợt một khoản giữ đúng ngày đóng; khoản ở trạng thái chờ kế toán."
      />
      <LegacyImporter sales={sales} />
      <section className="space-y-2">
        <h2 className="font-semibold">Lịch sử nhập</h2>
        {batches.length === 0 ? <Empty>Chưa có lô nhập.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">Loại</th><th className="p-3">File / ghi chú</th><th className="p-3 text-right">Dòng nhập / tổng</th><th className="p-3 text-right">Số tiền</th><th className="p-3">Người nhập</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3 text-xs">{dt(b.createdAt)}</td>
                    <td className="p-3 text-xs">{b.kind === "legacy_payments" ? "Giao dịch cũ" : "Sao kê ngân hàng"}</td>
                    <td className="p-3 text-xs">{b.fileName ?? "(dán)"}<div className="text-ink-600">{b.note}</div></td>
                    <td className="p-3 text-right tabular-nums">{b.okRows}/{b.totalRows}</td>
                    <td className="p-3 text-right tabular-nums">{vnd(b.totalAmount)}</td>
                    <td className="p-3 text-xs">{b.creatorName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
