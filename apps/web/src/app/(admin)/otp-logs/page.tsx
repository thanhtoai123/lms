import Link from "next/link";
import { hasPermission, OTP_STATUSES, OTP_STATUS_VI, OTP_PURPOSES, OTP_PURPOSE_VI, type Actor, type OtpStatus, type OtpPurpose } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhật ký OTP" };
const CHIP: Record<OtpStatus, string> = { sent: "bg-sky-100 text-sky-800", queued: "bg-amber-100 text-amber-800", verified: "bg-green-100 text-green-800", expired: "bg-slate-100 text-slate-600", failed: "bg-red-100 text-red-700", blocked: "bg-red-100 text-red-700" };

export default async function OtpLogsPage({ searchParams }: { searchParams: Promise<{ status?: string; purpose?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Nhật ký OTP" perm="system:read" />;
  const status = OTP_STATUSES.includes(sp.status as OtpStatus) ? (sp.status as OtpStatus) : undefined;
  const purpose = OTP_PURPOSES.includes(sp.purpose as OtpPurpose) ? (sp.purpose as OtpPurpose) : undefined;
  const d = await caller.admin.otpLogs({ status, purpose, q: sp.q || undefined, page: Math.max(1, Number(sp.page) || 1) });
  const p = d.policy;
  return (
    <div className="space-y-4">
      <PageHeader title="Nhật ký OTP" desc={`Mã chỉ lưu dạng băm, hết hạn sau ${p.ttlMinutes} phút, sai ${p.maxAttempts} lần là khoá. Giới hạn ${p.perPhoneMax} mã/${p.perPhoneWindowMin} phút mỗi SĐT, ${p.perIpMax} mã/giờ mỗi IP.${d.znsConfigured ? "" : " Zalo ZNS chưa cấu hình — mã đang ở trạng thái Chờ gửi."}`} />
      {/* Thẻ số theo NGÀY LỊCH (giờ Việt Nam) như bản gốc */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-ink-400">Tin đã gửi hôm nay</div><b className="text-2xl">{d.daily.sent}</b><div className="text-[11px] text-ink-400">trong đó {d.daily.zns} tin ZNS</div></div>
        <div className="card p-3">
          <div className="text-xs text-ink-400">Ngưỡng tự ngắt</div>
          <b className={`text-2xl ${d.daily.hit ? "text-red-700" : ""}`}>{d.daily.cutoff}</b>
          <div className="text-[11px] text-ink-400">{d.daily.hit ? "Đã chạm ngưỡng — tạm ngừng gửi" : `Đang dùng ${d.daily.pct}% · suy từ ${p.perIpMax} mã/${p.perIpWindowMin} phút mỗi IP`}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-ink-400">Chi phí ZNS hôm nay (ước)</div>
          <b className="text-2xl">{d.daily.estimatedCostVnd.toLocaleString("vi-VN")}đ</b>
          <div className="text-[11px] text-ink-400">
            {d.daily.unitCostVnd > 0
              ? `${d.daily.zns} tin × ${d.daily.unitCostVnd.toLocaleString("vi-VN")}đ`
              : <>Chưa khai đơn giá — đặt ở <Link href="/cau-hinh-van-hanh?tab=otp" className="text-brand-600">Cấu hình vận hành</Link></>}
          </div>
        </div>
        <div className="card p-3"><div className="text-xs text-ink-400">ZNS lỗi người nhận hôm nay</div><b className="text-2xl text-red-700">{d.daily.znsRecipientErrors}</b></div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-ink-400">24 giờ qua (trượt)</div><b className="text-xl">{d.counts?.last24h ?? 0}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Đã xác minh (bộ lọc)</div><b className="text-xl text-green-700">{d.counts?.verified ?? 0}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Bị chặn hôm nay</div><b className="text-xl text-red-700">{d.counts?.blockedToday ?? 0}</b><div className="text-[11px] text-ink-400">24h trượt: {d.counts?.blocked24h ?? 0}</div></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Nhập sai quá lần hôm nay</div><b className="text-xl text-amber-700">{d.counts?.failedToday ?? 0}</b><div className="text-[11px] text-ink-400">24h trượt: {d.counts?.failed24h ?? 0}</div></div>
      </div>
      <form className="flex flex-wrap gap-2" action="/otp-logs">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={sp.q} placeholder="Số điện thoại" className="input w-48" />
        <select name="purpose" defaultValue={purpose ?? ""} className="input w-auto"><option value="">Mọi mục đích</option>{OTP_PURPOSES.map((x) => <option key={x} value={x}>{OTP_PURPOSE_VI[x]}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/otp-logs" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả", count: d.counts?.total }, ...OTP_STATUSES.map((s) => ({ key: s, label: OTP_STATUS_VI[s] }))]} />
      {d.items.length === 0 ? <Empty>Chưa có OTP.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Thời gian</th><th className="p-3">SĐT</th><th className="p-3">Mục đích</th><th className="p-3">Kênh</th><th className="p-3">Lần nhập</th><th className="p-3">IP</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((o) => (
                <tr key={o.id}>
                  <td className="p-3 text-xs">{dtVN(o.createdAt)}</td>
                  <td className="p-3 font-mono text-xs">{o.phone}</td>
                  <td className="p-3 text-xs">{OTP_PURPOSE_VI[o.purpose as OtpPurpose] ?? o.purpose}</td>
                  <td className="p-3 text-xs">{o.channel}</td>
                  <td className="p-3 text-xs">{o.attempts}</td>
                  <td className="p-3 font-mono text-xs">{o.ip ?? "—"}</td>
                  <td className="p-3"><span className={`chip ${CHIP[o.status as OtpStatus] ?? "bg-black/5"}`}>{OTP_STATUS_VI[o.status as OtpStatus] ?? o.status}</span>{o.note && <div className="text-xs text-ink-400">{o.note}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/otp-logs" params={sp} page={d.page} pageSize={d.pageSize} total={d.counts?.total ?? 0} />
    </div>
  );
}
