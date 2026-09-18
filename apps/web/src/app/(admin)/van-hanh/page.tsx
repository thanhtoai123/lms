import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vận hành & sao lưu" };

const STATE: Record<string, { cls: string; label: string }> = {
  ok: { cls: "bg-green-100 text-green-800", label: "Đạt" },
  missing: { cls: "bg-red-100 text-red-700", label: "Thiếu" },
  weak: { cls: "bg-amber-100 text-amber-800", label: "Cần sửa" },
  danger: { cls: "bg-red-600 text-white", label: "Nguy hiểm" },
  stale: { cls: "bg-amber-100 text-amber-800", label: "Quá hạn" },
};
const LEVEL: Record<string, string> = { required: "Bắt buộc", recommended: "Nên có", optional: "Tuỳ chọn" };
const Chip = ({ s }: { s: string }) => <span className={`chip ${STATE[s]?.cls ?? "bg-slate-100"}`}>{STATE[s]?.label ?? s}</span>;

export default async function OpsPage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "system:read")) return <NoAccess title="Vận hành" perm="system:read" />;
  const d = await caller.system.ops();
  const q = d.queues as Record<string, number>;
  const v = d.volume as Record<string, number | string> | null;
  return (
    <div className="space-y-4">
      <PageHeader title="Vận hành & sao lưu" desc={`Môi trường: ${d.production ? "PRODUCTION" : "phát triển / thử nghiệm"} · phiên bản ${d.health.version}. Giám sát ngoài gọi /api/health (tiến trình còn sống — luôn 200 khi web còn chạy) và /api/ready (200 = nhận được lưu lượng, 503 = CSDL hỏng hoặc việc nền tồn đọng). Sao lưu chạy hằng đêm bằng scripts/ops/backup; thử khôi phục định kỳ.`}
        actions={<div className="flex gap-2"><Link href="/tich-hop" className="btn-ghost">Tích hợp</Link><a href="/api/health" target="_blank" className="btn-ghost">/api/health ↗</a><a href="/api/ready" target="_blank" className="btn-ghost">/api/ready ↗</a></div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sẵn sàng go-live" value={`${d.readyScore}%`} tone={d.readyScore === 100 ? "good" : d.readyScore >= 75 ? "warn" : "bad"} />
        <Kpi label="CSDL / lưu trữ" value={d.health.ok ? "Hoạt động" : "LỖI"} tone={d.health.ok ? "good" : "bad"} hint={d.health.checks.filter((c) => c.ms !== undefined).map((c) => `${c.key} ${c.ms}ms`).join(" · ")} />
        <Kpi label="Worker / cron" value={STATE[d.heartbeats.overall]?.label ?? "—"} tone={d.heartbeats.overall === "ok" ? "good" : "warn"} hint={d.heartbeats.worker ? `worker ${dtVN(d.heartbeats.worker.at)}` : d.heartbeats.cron ? `cron ${dtVN(d.heartbeats.cron.at)}` : "chưa có nhịp"} />
        <Kpi label="Sao lưu gần nhất" value={d.backups.latestAt ? dtVN(d.backups.latestAt) : "Chưa có"} tone={d.backups.freshness === "ok" ? "good" : "bad"} hint={d.backups.configured ? undefined : "BACKUP_DIR chưa cấu hình"} />
        <Kpi label="Biến môi trường" value={d.envSummary.ready ? "Đủ" : `${d.envSummary.blocking} lỗi`} tone={d.envSummary.ready ? "good" : "bad"} hint={`${d.envSummary.warnings} cảnh báo`} />
        <Kpi label="Dung lượng CSDL" value={v ? String(v.dbSize) : "—"} />
      </div>
      <Section title="Danh mục go-live">
        <ul className="divide-y divide-black/5 text-sm">{d.checklist.map((c) => <li key={c.key} className="flex items-center justify-between gap-2 p-3"><span>{c.label}</span><Chip s={c.ok ? "ok" : "missing"} /></li>)}</ul>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Hàng đợi & cảnh báo">
          <table className="w-full text-sm"><tbody className="divide-y divide-black/5">
            {[
              ["Outbox chờ xử lý", q.outbox_pending, q.outbox_oldest_min ? `cũ nhất ${q.outbox_oldest_min} phút` : ""],
              ["Outbox kẹt (≥ 3 lần lỗi)", q.outbox_stuck, ""],
              ["Email lỗi 24h", q.email_failed_24h, ""],
              ["Webhook lỗi / bị từ chối 24h", q.webhook_bad_24h, ""],
              ["Tin nhắn gửi lỗi 24h", q.msg_failed_24h, ""],
              ["Buổi học quá hạn chưa chốt", q.sessions_unclosed, ""],
              ["Yêu cầu dữ liệu quá hạn", q.dsr_overdue, ""],
              ["Sự cố dữ liệu quá hạn thông báo", q.incident_overdue, ""],
            ].map(([label, n, hint]) => <tr key={String(label)}><td className="p-3">{label}{hint ? <span className="ml-1 text-xs text-ink-400">({hint})</span> : null}</td><td className={`${td} text-right ${Number(n) ? "font-semibold text-red-700" : "text-ink-400"}`}>{n ?? 0}</td></tr>)}
          </tbody></table>
        </Section>
        <Section title="Khối lượng dữ liệu">
          {!v ? <div className="p-4"><Empty>—</Empty></div> : (
            <table className="w-full text-sm"><tbody className="divide-y divide-black/5">
              {[["Học viên", v.students], ["Lead", v.leads], ["Ghi danh", v.enrollments], ["Buổi học", v.sessions], ["Điểm danh", v.attendance], ["Đơn hàng", v.orders], ["Thanh toán", v.payments], ["Tin nhắn", v.messages], ["Nhật ký thao tác", v.audit]].map(([k, n]) => <tr key={String(k)}><td className="p-3">{k}</td><td className={`${td} text-right`}>{Number(n).toLocaleString("vi-VN")}</td></tr>)}
            </tbody></table>
          )}
        </Section>
      </div>
      <Section title="Biến môi trường" desc="Chỉ hiển thị trạng thái — không bao giờ hiển thị giá trị.">
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Nhóm</th><th className={th}>Biến</th><th className={th}>Mức</th><th className={th}>Trạng thái</th><th className={th}>Ghi chú</th></tr></thead>
          <tbody className="divide-y divide-black/5">{d.env.map((e) => <tr key={e.key}><td className="p-3 text-xs">{e.group}</td><td className="p-3 font-mono text-xs">{e.key}</td><td className="p-3 text-xs">{LEVEL[e.level]}</td><td className="p-3"><Chip s={e.status} /></td><td className="p-3 text-xs text-ink-600">{e.note}</td></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Bản sao lưu" desc={d.backups.configured ? "Tệp trong BACKUP_DIR (30 bản mới nhất). Giữ tối thiểu 14 bản hằng ngày + 1 bản ngoài máy chủ (ổ khác / đám mây)." : "Đặt BACKUP_DIR trỏ tới thư mục chứa bản sao lưu để theo dõi tại đây."}>
        {d.backups.files.length === 0 ? <div className="p-4"><Empty>Chưa thấy bản sao lưu nào.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Tệp</th><th className={th}>Dung lượng</th><th className={th}>Thời điểm</th></tr></thead>
            <tbody className="divide-y divide-black/5">{d.backups.files.map((f) => <tr key={f.name}><td className="p-3 font-mono text-xs">{f.name}</td><td className={td}>{f.sizeLabel}</td><td className="p-3 text-xs">{dtVN(f.at)}</td></tr>)}</tbody>
          </table>
        )}
        {d.backups.latest && <p className="border-t border-black/5 p-3 text-xs text-ink-600">LATEST.json: {JSON.stringify(d.backups.latest)}</p>}
      </Section>
    </div>
  );
}
