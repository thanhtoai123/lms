import Link from "next/link";
import { hasPermission, PAYMENT_METHOD_KIND_VI, PAYMENT_SCOPE_FLAGS, PAYMENT_SCOPE_FLAG_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { MethodEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phương thức thanh toán" };

export default async function MethodsPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Phương thức thanh toán" perm="finance:read" />;
  const canConfigure = hasPermission(ctx.actor as Actor, "finance:configure");
  const [rows, ref] = await Promise.all([caller.finance.methods({}), caller.academics.classes.referenceData()]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Phương thức thanh toán"
        desc="Tài khoản / hình thức nhận tiền. Phương thức dùng chung hiện ở mọi cơ sở; phương thức riêng chỉ hiện ở đơn của cơ sở đó. Chuyển khoản có mã BIN + số tài khoản sẽ dựng mã QR VietQR trên đơn."
        actions={<Link href="/cau-hinh-van-hanh?tab=phuong-thuc-tt" className="btn-ghost">Mở trong Cấu hình vận hành</Link>}
      />
      {canConfigure && <MethodEditor centers={ref.centers} />}
      {rows.length === 0 ? <Empty>Chưa có phương thức thanh toán.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Mã / tên</th><th className="p-3">Loại</th><th className="p-3">Tài khoản</th><th className="p-3">Phạm vi</th><th className="p-3">Dùng cho</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((m) => (
                <tr key={m.id} className={m.isActive ? "" : "text-ink-400"}>
                  <td className="p-3"><div className="font-mono text-xs font-semibold">{m.code}</div><div className="font-medium">{m.name}</div>{m.description && <div className="text-xs text-ink-400">{m.description}</div>}</td>
                  <td className="p-3">{PAYMENT_METHOD_KIND_VI[m.kind]}</td>
                  <td className="p-3 text-xs">{m.kind === "bank_transfer" ? <>{m.bankName} · BIN {m.bankBin}<div className="font-mono">{m.accountNo}</div><div>{m.accountName}</div>{m.bankBranch && <div className="text-ink-400">{m.bankBranch}</div>}</> : "—"}</td>
                  <td className="p-3">{m.centerCode ? <span className="chip bg-black/5">{m.centerCode}</span> : <span className="chip bg-brand-100 text-brand-700">Dùng chung</span>}</td>
                  <td className="p-3 text-xs">{PAYMENT_SCOPE_FLAGS.filter((k) => m.scope[k]).map((k) => PAYMENT_SCOPE_FLAG_VI[k]).join(", ") || "—"}</td>
                  <td className="p-3">{m.isActive ? <span className="chip bg-green-100 text-green-800">Đang dùng</span> : <span className="chip bg-slate-100 text-slate-600">Tắt</span>}</td>
                  <td className="p-3">{m.canEdit && <MethodEditor centers={ref.centers} method={{ ...m, centerId: m.centerId }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
