import { hasPermission, WEBHOOK_SOURCES, WEBHOOK_SOURCE_VI, WEBHOOK_STATUSES, WEBHOOK_STATUS_VI, type Actor, type WebhookSource, type WebhookStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { ReplayButton } from "./replay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhook replay" };
const CHIP: Record<WebhookStatus, string> = { processed: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-700", rejected: "bg-amber-100 text-amber-800", duplicate: "bg-slate-100 text-slate-600" };

export default async function WebhookReplayPage({ searchParams }: { searchParams: Promise<{ source?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Webhook replay" perm="system:read" />;
  const source = WEBHOOK_SOURCES.includes(sp.source as WebhookSource) ? (sp.source as WebhookSource) : undefined;
  const status = WEBHOOK_STATUSES.includes(sp.status as WebhookStatus) ? (sp.status as WebhookStatus) : undefined;
  const d = await caller.admin.webhooks({ source, status, page: Math.max(1, Number(sp.page) || 1) });
  return (
    <div className="space-y-4">
      <PageHeader title="Webhook replay" desc="Mọi lần gọi vào webhook SePay và form đăng ký công khai đều được ghi lại. Sự kiện lỗi xử lý có thể chạy lại (tối đa 5 lần); sự kiện bị từ chối (sai khoá / dữ liệu) không chạy lại." />
      <div className="flex flex-wrap gap-2 text-sm">
        <a href={`/crm/webhook-replay${status ? `?status=${status}` : ""}`} className={`chip ${!source ? "bg-brand-600 text-white" : "bg-black/5"}`}>Tất cả nguồn</a>
        {WEBHOOK_SOURCES.map((s) => <a key={s} href={`/crm/webhook-replay?source=${s}${status ? `&status=${status}` : ""}`} className={`chip ${source === s ? "bg-brand-600 text-white" : "bg-black/5"}`}>{WEBHOOK_SOURCE_VI[s]}</a>)}
      </div>
      <StatTabs basePath="/crm/webhook-replay" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả", count: d.counts?.total }, ...WEBHOOK_STATUSES.map((s) => ({ key: s, label: WEBHOOK_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Chưa có sự kiện.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Nhận lúc</th><th className="p-3">Nguồn</th><th className="p-3">Dữ liệu</th><th className="p-3">Kết quả</th><th /></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((w) => (
                <tr key={w.id}>
                  <td className="p-3 text-xs">{dtVN(w.receivedAt)}<div className="text-ink-400">IP {w.ip ?? "—"}</div></td>
                  <td className="p-3 text-xs">{WEBHOOK_SOURCE_VI[w.source as WebhookSource] ?? w.source}{w.externalId && <div className="text-ink-400">#{w.externalId}</div>}</td>
                  <td className="p-3 text-xs">
                    <details><summary className="cursor-pointer text-brand-600">Payload</summary><pre className="max-h-64 max-w-md overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2">{JSON.stringify(w.payload, null, 2)}</pre></details>
                    {w.headers != null && <details><summary className="cursor-pointer text-ink-400">Header</summary><pre className="max-w-md overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2">{JSON.stringify(w.headers, null, 2)}</pre></details>}
                  </td>
                  <td className="p-3 text-xs">
                    <span className={`chip ${CHIP[w.status as WebhookStatus] ?? "bg-black/5"}`}>{WEBHOOK_STATUS_VI[w.status as WebhookStatus] ?? w.status}</span> <span className="text-ink-400">HTTP {w.httpStatus} · {w.attempts} lần</span>
                    {w.error && <div className="max-w-xs text-red-700">{w.error}</div>}
                    {w.result != null && <div className="max-w-xs truncate text-ink-400">{JSON.stringify(w.result)}</div>}
                    {w.byName && <div className="text-ink-400">Chạy lại bởi {w.byName}{w.lastAttemptAt ? ` · ${dtVN(w.lastAttemptAt)}` : ""}</div>}
                  </td>
                  <td className="p-3 text-right">{d.canReplay && (w.replayBlock ? <span className="text-xs text-ink-400">{w.replayBlock}</span> : <ReplayButton id={w.id} />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/crm/webhook-replay" params={sp} page={d.page} pageSize={d.pageSize} total={(status ? d.counts?.[status] : d.counts?.total) ?? 0} />
    </div>
  );
}
