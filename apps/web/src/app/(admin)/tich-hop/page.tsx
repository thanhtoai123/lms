import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { TestEmail, TestDelivery } from "./test-email";
import { ZaloOaCard } from "./zalo-oa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tích hợp" };
const TONE = {
  ok: { chip: "bg-green-100 text-green-800", label: "Hoạt động", bar: "border-l-green-500" },
  warn: { chip: "bg-amber-100 text-amber-800", label: "Cần kiểm tra", bar: "border-l-amber-400" },
  off: { chip: "bg-slate-100 text-slate-600", label: "Chưa cấu hình", bar: "border-l-slate-300" },
} as const;

export default async function IntegrationsPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Tích hợp" perm="system:read" />;
  const { items, providerErrors } = await caller.admin.integrations();
  // Trạng thái token Zalo OA (hạn 25 giờ, tự làm mới) — hiện ngay trong thẻ Zalo OA
  const zalo = await caller.admin.zaloToken();
  const canTest = hasPermission(ctx.actor as Actor, "system:update");
  return (
    <div className="space-y-4">
      <PageHeader title="Tích hợp" desc="Trạng thái các dịch vụ bên ngoài. Khoá bí mật chỉ đặt qua biến môi trường trên máy chủ — trang này không hiển thị giá trị khoá. Thiếu credential thì hệ thống dừng an toàn: không gọi ra ngoài, không mất dữ liệu." />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => {
          const t = TONE[it.status];
          return (
            <div key={it.key} className={`card border-l-4 p-4 ${t.bar}`}>
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="font-semibold">{it.name}</h2><p className="text-xs text-ink-600">{it.purpose}</p></div>
                <span className={`chip ${t.chip}`}>{t.label}</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-600">{it.details.map((x) => <li key={x}>• {x}</li>)}</ul>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                {it.env.map((e) => <code key={e} className="rounded bg-black/5 px-1.5 py-0.5">{e}</code>)}
                {it.href && <Link href={it.href} className="ml-auto text-xs text-brand-600">Xem chi tiết →</Link>}
              </div>
              {canTest && it.test === "email" && <TestEmail />}
              {it.key === "zalo_oa" && <ZaloOaCard state={zalo} canEdit={canTest} />}
              {canTest && it.test === "zns" && <TestDelivery channel="zns" />}
              {canTest && it.test === "sms" && <TestDelivery channel="sms" />}
              {!it.test && <p className="mt-3 border-t border-black/5 pt-3 text-[11px] text-ink-400">Không có thao tác &quot;Gửi thử&quot; cho dịch vụ này.</p>}
            </div>
          );
        })}
      </div>

      <section className="card">
        <h2 className="border-b border-black/5 p-3 font-semibold">Lỗi nhà cung cấp gần nhất <span className="text-xs font-normal text-ink-400">(email · Zalo ZNS / SMS · webhook — 20 dòng mới nhất)</span></h2>
        {providerErrors.length === 0 ? <div className="p-4"><Empty>Chưa ghi nhận lỗi nhà cung cấp nào.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời điểm</th><th className="p-3">Nhà cung cấp</th><th className="p-3">Đối tượng</th><th className="p-3">Mã lỗi</th><th className="p-3">Nội dung lỗi</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {providerErrors.map((e, i) => (
                  <tr key={`${e.provider}-${i}`}>
                    <td className="p-3 whitespace-nowrap text-xs">{dtVN(e.at)}</td>
                    <td className="p-3 text-xs font-medium">{e.provider}</td>
                    <td className="p-3 text-xs">{e.target}</td>
                    <td className="p-3 font-mono text-xs">{e.code}</td>
                    <td className="p-3 text-xs text-red-700">{e.message.slice(0, 200)}</td>
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
