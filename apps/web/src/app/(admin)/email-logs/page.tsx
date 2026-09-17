import { hasPermission, EMAIL_STATUSES, EMAIL_STATUS_VI, EMAIL_EVENTS, type Actor, type EmailStatus, type EmailEvent } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { RetryEmail } from "./retry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhật ký email" };
const CHIP: Record<EmailStatus, string> = { queued: "bg-amber-100 text-amber-800", sent: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-700", skipped: "bg-slate-100 text-slate-600" };

export default async function EmailLogsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Nhật ký email" perm="system:read" />;
  const status = EMAIL_STATUSES.includes(sp.status as EmailStatus) ? (sp.status as EmailStatus) : undefined;
  const d = await caller.admin.emailLogs({ status, q: sp.q || undefined, page: Math.max(1, Number(sp.page) || 1) });
  return (
    <div className="space-y-4">
      <PageHeader title="Nhật ký email" desc={d.provider ? "Gửi qua Resend; lỗi tự thử lại sau 1, 5, 30 phút." : "Chưa cấu hình nhà cung cấp email (RESEND_API_KEY) — email được ghi nhận nhưng không gửi đi."} />
      <form className="flex gap-2" action="/email-logs">{status && <input type="hidden" name="status" value={status} />}<input name="q" defaultValue={sp.q} placeholder="Email nhận / tiêu đề" className="input w-64" /><button className="btn-ghost">Lọc</button></form>
      <StatTabs basePath="/email-logs" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả", count: d.counts?.total }, ...EMAIL_STATUSES.map((s) => ({ key: s, label: EMAIL_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Chưa có email.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">Người nhận</th><th className="p-3">Sự kiện / tiêu đề</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((m) => (
                <tr key={m.id}>
                  <td className="p-3 text-xs">{dtVN(m.createdAt)}{m.sentAt && <div className="text-green-700">gửi {dtVN(m.sentAt)}</div>}</td>
                  <td className="p-3 text-xs">{m.toEmail}{m.byName && <div className="text-ink-400">bởi {m.byName}</div>}</td>
                  <td className="p-3 text-xs"><div className="text-ink-400">{EMAIL_EVENTS[m.eventKey as EmailEvent]?.label ?? m.eventKey}</div><div className="font-medium">{m.subject}</div><details><summary className="cursor-pointer text-brand-600">Nội dung</summary><pre className="whitespace-pre-wrap font-sans">{m.body}</pre></details></td>
                  <td className="p-3"><span className={`chip ${CHIP[m.status as EmailStatus] ?? "bg-black/5"}`}>{EMAIL_STATUS_VI[m.status as EmailStatus] ?? m.status}</span><div className="text-xs text-ink-400">{m.attempts} lần</div>{m.error && <div className="max-w-xs text-xs text-red-700">{m.error}</div>}{m.canRetry && <RetryEmail id={m.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/email-logs" params={sp} page={d.page} pageSize={d.pageSize} total={d.counts?.total ?? 0} />
    </div>
  );
}
