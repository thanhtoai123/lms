import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { Compose, Retry, HideNotification } from "./compose";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thông báo phụ huynh" };

const ST: Record<string, [string, string]> = { queued: ["Chờ gửi", "bg-amber-100 text-amber-800"], sent: ["Đã gửi", "bg-sky-100 text-sky-800"], read: ["Đã đọc", "bg-green-100 text-green-800"], failed: ["Lỗi", "bg-red-100 text-red-700"] };
const CH: Record<string, string> = { in_app: "App", zns: "Zalo ZNS", push: "Push", email: "Email" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ status?: string; channel?: string; template?: string; q?: string; page?: string; hidden?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Thông báo phụ huynh" perm="care:read" />;
  const status = ["queued", "sent", "failed", "read"].includes(sp.status ?? "") ? (sp.status as "queued" | "sent" | "failed" | "read") : undefined;
  const showHidden = sp.hidden === "1";
  const d = await caller.care.notifications({ status, channel: sp.channel || undefined, template: sp.template || undefined, q: sp.q || undefined, page: Math.max(1, Number(sp.page) || 1), hidden: showHidden || undefined });
  const ref = d.canSend ? await caller.academics.classes.referenceData() : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Thông báo phụ huynh" desc="Mọi thông báo gửi phụ huynh (tóm tắt buổi học, nhắc học phí, khảo sát, sinh nhật, thông báo chung) và trạng thái gửi. Gửi hàng loạt theo lớp / cơ sở / khoá, dùng biến {ten_ph}, {ten_hv}, {lop}, {co_so}." />
      {d.canSend && ref && <Compose centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} courses={ref.courses.map((c) => ({ id: c.id, code: c.code }))} znsConfigured={d.zns.configured} />}
      {d.broadcasts.length > 0 && (
        <details className="card p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Đợt gửi gần đây ({d.broadcasts.length})</summary>
          <table className="mt-2 w-full text-xs"><tbody className="divide-y divide-black/5">{d.broadcasts.map((b) => <tr key={b.id}><td className="p-1">{dtVN(b.createdAt)}</td><td className="p-1 font-medium">{b.title}</td><td className="p-1">{CH[b.channel] ?? b.channel}</td><td className="p-1 text-right">{b.recipients} PH</td><td className="p-1">{b.byName}</td></tr>)}</tbody></table>
        </details>
      )}
      <form className="flex flex-wrap items-end gap-2" action="/notifications">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Phụ huynh / tiêu đề" className="input w-56" />
        <select name="channel" defaultValue={sp.channel ?? ""} className="input w-auto"><option value="">Mọi kênh</option>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="template" defaultValue={sp.template ?? ""} className="input w-auto"><option value="">Mọi loại</option>{d.templates.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <label className="flex items-center gap-1 pb-2 text-xs text-ink-600"><input type="checkbox" name="hidden" value="1" defaultChecked={showHidden} /> Xem thông báo đã ẩn ({d.hiddenCount})</label>
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/notifications" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả", count: d.counts?.total }, ...(["queued", "sent", "read", "failed"] as const).map((s) => ({ key: s, label: ST[s]![0], count: d.counts?.[s] }))]} />
      {!d.zns.configured && <p className="text-xs text-amber-700">Zalo ZNS chưa cấu hình — thông báo kênh ZNS sẽ nằm ở "Chờ gửi" cho tới khi tích hợp (Hệ thống → Tích hợp).</p>}
      {d.items.length === 0 ? <Empty>Không có thông báo.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">Phụ huynh / HV</th><th className="p-3">Nội dung</th><th className="p-3">Kênh</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((n) => (
                <tr key={n.id}>
                  <td className="p-3 text-xs">{dtVN(n.createdAt)}<div className="text-ink-400">{n.template}</div></td>
                  <td className="p-3">{n.parentName}<div className="text-xs text-ink-400">{n.studentName ?? ""}</div></td>
                  <td className="p-3 text-xs"><div className="font-medium">{n.title}</div><div className="line-clamp-2 max-w-md text-ink-600">{n.body}</div>{n.link && <div className="font-mono text-ink-400">{n.link}</div>}</td>
                  <td className="p-3 text-xs">{CH[n.channel] ?? n.channel}</td>
                  <td className="p-3">
                    <span className={`chip ${ST[n.status]?.[1] ?? "bg-black/5"}`}>{ST[n.status]?.[0] ?? n.status}</span>
                    {n.hiddenAt && <span className="chip ml-1 bg-slate-200 text-ink-600">Đã ẩn</span>}
                    {n.error && <div className="text-xs text-red-700">{n.error}</div>}
                    {n.hiddenReason && <div className="text-xs text-ink-600">Lý do ẩn: {n.hiddenReason}</div>}
                    {n.status === "failed" && !n.hiddenAt && <Retry id={n.id} />}
                    {d.canHide && <HideNotification id={n.id} hidden={!!n.hiddenAt} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/notifications" params={sp} page={d.page} pageSize={50} total={d.counts?.total ?? 0} />
    </div>
  );
}
