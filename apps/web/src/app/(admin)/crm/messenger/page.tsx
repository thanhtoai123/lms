import Link from "next/link";
import { hasPermission, LEAD_STATUS_VI, type Actor, type LeadStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messenger CRM" };

export default async function MessengerCrmPage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "message:read") || !hasPermission(actor, "lead:read")) return <NoAccess title="Messenger CRM" perm="message:read + lead:read" />;
  const d = await caller.messaging.crm();
  const s = d.stats;
  const cfg = d.channels;
  return (
    <div className="space-y-4">
      <PageHeader title="Messenger CRM" desc="Hội thoại Facebook Messenger / Zalo OA gắn với lead: tin mới vào hộp thư, nhân viên trả lời trong cửa sổ cho phép, tạo lead từ hội thoại khi khách để lại số điện thoại (kèm xác nhận đồng ý). Chưa gắn lead quá lâu là mất khách." actions={<Link href="/tin-nhan?channel=messenger" className="btn-ghost">Mở hộp thư →</Link>} />
      {(!cfg.messenger.appSecret || !cfg.messenger.pageToken) && <div className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Messenger chưa kết nối đủ (cần META_VERIFY_TOKEN, META_APP_SECRET, META_PAGE_TOKEN). Xem Quản trị hội thoại → Kênh kết nối.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Hội thoại 90 ngày" value={s.total} />
        <Kpi label="Đã gắn lead" value={s.linked} tone="good" hint={s.total ? `${Math.round((s.linked / s.total) * 100)}%` : undefined} />
        <Kpi label="Đang mở, chưa gắn lead" value={s.unlinked} tone={s.unlinked ? "warn" : "default"} />
        <Kpi label="Lead đã đăng ký" value={s.enrolled} tone="brand" />
      </div>
      <Section title="Hội thoại từ mạng xã hội">
        {d.items.length === 0 ? <div className="p-4"><Empty>Chưa có hội thoại.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Khách</th><th className={th}>Kênh</th><th className={th}>Tin gần nhất</th><th className={th}>Lead</th><th className={th}>Phụ trách</th><th className={th}>Chờ</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((c) => (
                <tr key={c.id}>
                  <td className="p-3"><Link href={`/tin-nhan?id=${c.id}`} className="font-medium text-brand-600">{c.name}</Link><div className="text-[11px] text-ink-400">{dtVN(c.lastMessageAt)}</div></td>
                  <td className="p-3 text-xs">{c.channelLabel}</td>
                  <td className="max-w-xs truncate p-3 text-xs">{c.preview}</td>
                  <td className="p-3 text-xs">{c.leadId ? <Link href={`/leads/${c.leadId}`} className="text-brand-600">{LEAD_STATUS_VI[c.leadStatus as LeadStatus] ?? c.leadStatus}</Link> : <span className="chip bg-amber-100 text-amber-800">chưa gắn</span>}</td>
                  <td className="p-3 text-xs">{c.assignee ?? "—"}</td>
                  <td className="p-3 text-xs">{c.waitingMin !== null ? <span className={c.waitingMin > 60 ? "font-semibold text-red-700" : ""}>{c.waitingMin}′</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
