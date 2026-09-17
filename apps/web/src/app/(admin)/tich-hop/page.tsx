import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { TestEmail } from "./test-email";

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
  const { items } = await caller.admin.integrations();
  const canTest = hasPermission(ctx.actor as Actor, "system:update");
  return (
    <div className="space-y-4">
      <PageHeader title="Tích hợp" desc="Trạng thái các dịch vụ bên ngoài. Khoá bí mật chỉ đặt qua biến môi trường trên máy chủ — trang này không hiển thị giá trị khoá." />
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
              {it.key === "email" && canTest && <TestEmail />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
