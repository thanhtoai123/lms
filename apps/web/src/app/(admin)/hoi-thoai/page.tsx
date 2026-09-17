import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, Section, RateChip, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { MessagingSettingsForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản trị hội thoại" };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const UUID = /^[0-9a-f-]{36}$/i;
const Ok = ({ on }: { on: boolean }) => <span className={`chip ${on ? "bg-green-100 text-green-800" : "bg-slate-100 text-ink-600"}`}>{on ? "đã cấu hình" : "chưa"}</span>;

export default async function ConversationAdminPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || (!hasPermission(actor, "message:audit") && !actor.assignments.some((a) => a.role === "AUDITOR"))) return <NoAccess title="Quản trị hội thoại" perm="message:audit" />;
  const [d, st] = await Promise.all([
    caller.messaging.supervision({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center && UUID.test(sp.center) ? sp.center : undefined }),
    caller.messaging.settings(),
  ]);
  const t = d.totals;
  return (
    <div className="space-y-4">
      <PageHeader title="Quản trị hội thoại" desc={`Giám sát tốc độ phản hồi (chỉ tiêu ${d.slaMin} phút cho tin đầu tiên chưa trả lời), hội thoại gắn cờ (khiếu nại, hoàn tiền, muốn nghỉ, lời lẽ không phù hợp, nhân viên xin chuyển khoản cá nhân), tin gửi lỗi và cấu hình kênh.`} actions={<Link href="/tin-nhan" className="btn-ghost">Hộp thư →</Link>} />
      <ReportFilter basePath="/hoi-thoai" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Hội thoại có tin" value={t.conversations} />
        <Kpi label="Lượt chờ trả lời" value={t.total} hint={`${t.answered} đã trả lời`} />
        <Kpi label="Thời gian phản hồi (trung vị)" value={t.medianMin === null ? "—" : `${t.medianMin}′`} tone={t.medianMin !== null && t.medianMin > d.slaMin ? "warn" : "good"} />
        <Kpi label="Đúng hạn" value={t.withinSla === null ? "—" : `${t.withinSla}%`} tone={t.withinSla !== null && t.withinSla < 80 ? "bad" : "good"} />
        <Kpi label="Đang chờ quá hạn" value={t.waitingOverSla} tone={t.waitingOverSla ? "bad" : "default"} />
        <Kpi label="Tin gửi lỗi / chưa gửi" value={`${d.delivery.failed} / ${d.delivery.skipped}`} tone={d.delivery.failed ? "bad" : "default"} hint={`${d.delivery.sent} tin đã gửi`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Theo nhân viên" actions={<CsvButton filename={`phan-hoi_${d.range.from}_${d.range.to}`} headers={["Nhân viên", "Lượt trả lời", "Trung vị (phút)", "Đúng hạn %", "Tin gửi", "Lỗi"]} rows={d.byStaff.map((s) => [s.name, s.answered, s.medianMin ?? "", s.withinSla ?? "", s.sent, s.failed])} />}>
          {d.byStaff.length === 0 ? <div className="p-4"><Empty>Chưa có dữ liệu.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Nhân viên</th><th className={th}>Trả lời</th><th className={th}>Trung vị</th><th className={th}>Đúng hạn</th><th className={th}>Lỗi</th></tr></thead>
              <tbody className="divide-y divide-black/5">{d.byStaff.map((s) => <tr key={s.uid}><td className="p-3">{s.name}</td><td className={td}>{s.answered}</td><td className={td}>{s.medianMin ?? "—"}′</td><td className={td}>{s.withinSla === null ? "—" : <RateChip value={s.withinSla} />}</td><td className={`${td} ${s.failed ? "text-red-700" : ""}`}>{s.failed}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
        <Section title="Theo kênh">
          {d.byChannel.length === 0 ? <div className="p-4"><Empty>Chưa có dữ liệu.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Kênh</th><th className={th}>Lượt</th><th className={th}>Trung vị</th><th className={th}>Đúng hạn</th><th className={th}>Đang chờ</th></tr></thead>
              <tbody className="divide-y divide-black/5">{d.byChannel.map((c) => <tr key={c.key}><td className="p-3">{c.label}</td><td className={td}>{c.total}</td><td className={td}>{c.medianMin ?? "—"}′</td><td className={td}>{c.withinSla === null ? "—" : <RateChip value={c.withinSla} />}</td><td className={td}>{c.waiting}</td></tr>)}</tbody>
            </table>
          )}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Đang chờ quá hạn">
          {d.waiting.length === 0 ? <div className="p-4"><Empty>Không có.</Empty></div> : <ul className="divide-y divide-black/5 text-sm">{d.waiting.map((w) => <li key={w.id} className="p-3"><Link href={`/tin-nhan?id=${w.id}`} className="font-medium text-brand-600">{w.name ?? "Khách"}</Link> <span className="chip bg-red-100 text-red-700">{w.waitingMin}′</span><div className="truncate text-xs text-ink-600">{w.assignee ?? "Chưa giao"} · {w.preview}</div></li>)}</ul>}
        </Section>
        <Section title="Hội thoại gắn cờ">
          {d.flagged.length === 0 ? <div className="p-4"><Empty>Không có.</Empty></div> : <ul className="divide-y divide-black/5 text-sm">{d.flagged.map((f) => <li key={f.id} className="p-3"><Link href={`/tin-nhan?id=${f.id}`} className="font-medium text-brand-600">{f.name ?? "Khách"}</Link> {f.flags.map((x) => <span key={x} className="chip ml-1 bg-red-100 text-red-700">{x}</span>)}<div className="truncate text-xs text-ink-600">{f.centerCode ?? "—"} · {dtVN(f.at)} · {f.preview}</div></li>)}</ul>}
        </Section>
      </div>
      <Section title="Kênh kết nối" desc="Khoá đặt trong biến môi trường máy chủ, không lưu trong cơ sở dữ liệu. Webhook: /api/webhooks/messenger và /api/webhooks/zalo.">
        <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
          <div className="space-y-1">
            <div className="font-semibold">Facebook Messenger</div>
            <div>Mã xác minh (META_VERIFY_TOKEN) <Ok on={st.channels.messenger.verifyToken} /></div>
            <div>App secret — kiểm tra chữ ký (META_APP_SECRET) <Ok on={st.channels.messenger.appSecret} /></div>
            <div>Page token — gửi trả lời (META_PAGE_TOKEN) <Ok on={st.channels.messenger.pageToken} /></div>
            <div className="font-semibold pt-2">Zalo OA</div>
            <div>App ID (ZALO_APP_ID) <Ok on={st.channels.zalo.appId} /></div>
            <div>OA secret — kiểm tra chữ ký (ZALO_OA_SECRET) <Ok on={st.channels.zalo.oaSecret} /></div>
            <div>Access token — gửi tin tư vấn (ZALO_OA_ACCESS_TOKEN) <Ok on={st.channels.zalo.accessToken} /></div>
            <p className="pt-1 text-xs text-ink-600">Chưa có token gửi: tin trả lời vẫn được lưu và đánh dấu “chưa gửi ra kênh” để nhân viên nhắn tay.</p>
          </div>
          <div>{st.canEdit ? <MessagingSettingsForm initial={{ defaultCenterId: st.defaultCenterId, autoReply: st.autoReply }} centers={d.centers} /> : <p className="text-xs text-ink-600">Cấu hình do Hội sở quản lý.</p>}</div>
        </div>
      </Section>
    </div>
  );
}
