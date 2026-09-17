import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, Section, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";
import { vnd, fmtD } from "@/components/finance-ui";
import { TrackingSettings, UtmBuilder, CampaignForm, SpendForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracking marketing" };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

type SP = { from?: string; to?: string; center?: string; tab?: string };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "marketing:read")) return <NoAccess title="Tracking" perm="marketing:read" />;
  const d = await caller.marketing.overview({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  const cp = await caller.marketing.campaigns({ from: d.range.from, to: d.range.to });
  const t = d.totals;
  const ev = (k: string) => d.events[k]?.uniq ?? 0;
  const maxCh = Math.max(1, ...d.byChannel.map((c) => c.leads));
  const tab = sp.tab === "campaigns" ? "campaigns" : sp.tab === "setup" ? "setup" : "overview";
  const q = (tabKey: string) => `/marketing?${new URLSearchParams({ from: d.range.from, to: d.range.to, ...(d.centerId ? { center: d.centerId } : {}), ...(tabKey !== "overview" ? { tab: tabKey } : {}) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Tracking marketing" desc="Lead theo kênh / nguồn / chiến dịch (UTM) → học thử → đăng ký → doanh thu; sự kiện website first-party; chi phí và hiệu quả chiến dịch." actions={<Link href={`/marketing/funnel?from=${d.range.from}&to=${d.range.to}`} className="btn-ghost">Phễu marketing →</Link>} />
      <ReportFilter basePath="/marketing" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Người truy cập" value={ev("page_view")} hint={`${ev("form_view")} xem form`} />
        <Kpi label="Lead mới" value={t.leads} tone="brand" hint={`${t.trackedShare}% có UTM`} />
        <Kpi label="Đăng ký" value={t.enrolled} tone="good" hint={t.leads ? `${Math.round((t.enrolled / t.leads) * 100)}% lead` : undefined} />
        <Kpi label="Doanh thu từ lead" value={vnd(t.revenue)} tone="good" />
        <Kpi label="Lead không UTM" value={t.untracked} tone={t.untracked ? "warn" : "default"} />
        <Kpi label="Từ chối tiếp thị" value={t.optedOut} hint="không gửi quảng cáo" />
      </div>
      <div className="flex gap-1 border-b border-black/10 text-sm">
        {([["overview", "Tổng quan"], ["campaigns", `Chiến dịch (${cp.items.length})`], ["setup", "Cài đặt & UTM"]] as const).map(([k, l]) => (
          <Link key={k} href={q(k)} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600"}`}>{l}</Link>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Theo kênh">
              {d.byChannel.length === 0 ? <div className="p-4"><Empty>Chưa có lead trong kỳ.</Empty></div> : (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Kênh</th><th className={`${th} w-1/3`}>Lead</th><th className={th}>Học thử</th><th className={th}>Đăng ký</th><th className={th}>Doanh thu</th></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {d.byChannel.map((c) => (
                      <tr key={c.key}><td className="p-3 font-medium">{c.label}</td><td className={td}><div className="flex items-center gap-2"><span className="w-8">{c.leads}</span><HBar value={c.leads} max={maxCh} /></div></td><td className={td}>{c.trials}</td><td className={td}>{c.enrolled} <span className="text-xs text-ink-400">({c.closeRate}%)</span></td><td className={td}>{vnd(c.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
            <Section title="Trang được xem nhiều" desc="Sự kiện website first-party">
              {d.topPages.length === 0 ? <div className="p-4"><Empty>Chưa có dữ liệu truy cập — gắn script tracking (tab Cài đặt).</Empty></div> : (
                <table className="w-full text-sm"><tbody className="divide-y divide-black/5">{d.topPages.map((p) => <tr key={p.path}><td className="p-3 font-mono text-xs">{p.path}</td><td className={td}>{p.views} lượt</td><td className={td}>{p.visitors} người</td></tr>)}</tbody></table>
              )}
            </Section>
          </div>
          <Section title="Theo nguồn (utm_source / nguồn lead)" actions={<CsvButton filename={`marketing-nguon_${d.range.from}_${d.range.to}`} headers={["Nguồn", "Lead", "Đã liên hệ", "Học thử", "Đăng ký", "Doanh thu"]} rows={d.bySource.map((x) => [x.key, x.leads, x.contacted, x.trials, x.enrolled, x.revenue])} />}>
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Nguồn</th><th className={th}>Lead</th><th className={th}>Đã liên hệ</th><th className={th}>Học thử</th><th className={th}>Đăng ký</th><th className={th}>Doanh thu</th></tr></thead>
              <tbody className="divide-y divide-black/5">{d.bySource.map((x) => <tr key={x.key ?? "-"}><td className="p-3">{x.key}</td><td className={td}>{x.leads}</td><td className={td}>{x.contacted}</td><td className={td}>{x.trials}</td><td className={td}>{x.enrolled}</td><td className={td}>{vnd(x.revenue)}</td></tr>)}</tbody>
            </table>
          </Section>
          <Section title="Theo utm_medium">
            <table className="w-full text-sm"><tbody className="divide-y divide-black/5">{d.byMedium.map((x) => <tr key={x.key ?? "-"}><td className="p-3">{x.key}</td><td className={td}>{x.leads} lead</td><td className={td}>{x.enrolled} đăng ký</td></tr>)}</tbody></table>
          </Section>
        </>
      )}

      {tab === "campaigns" && (
        <Section title={`Chiến dịch · ${fmtD(cp.range.from)} → ${fmtD(cp.range.to)}`} actions={<div className="flex gap-2">{cp.canEdit && <CampaignForm centers={d.centers} />}<CsvButton filename="chien-dich" headers={["Chiến dịch", "utm", "Kênh", "Chi", "Người truy cập", "Lead", "Học thử", "Đăng ký", "Doanh thu", "CPL", "CPA", "ROAS"]} rows={cp.items.map((c) => [c.name, c.utmCampaign, c.channelLabel, c.spend, c.visits, c.leads, c.trials, c.enrolled, c.revenue, c.cpl, c.cpa, c.roas])} /></div>}>
          {cp.items.length === 0 ? <div className="p-4"><Empty>Chưa có chiến dịch.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Chiến dịch</th><th className={th}>Chi / ngân sách</th><th className={th}>Truy cập → lead</th><th className={th}>Học thử / ĐK</th><th className={th}>Doanh thu</th><th className={th}>CPL / CPA</th><th className={th}>ROAS</th></tr></thead>
              <tbody className="divide-y divide-black/5 align-top">
                {cp.items.map((c) => (
                  <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                    <td className="p-3"><div className="font-medium">{c.name}</div><div className="font-mono text-xs text-ink-400">{c.utmCampaign}</div><div className="text-xs text-ink-400">{c.channelLabel}{c.centerCode ? ` · ${c.centerCode}` : ""} · {fmtD(c.startDate)}{c.endDate ? ` → ${fmtD(c.endDate)}` : ""}</div>
                      {cp.canEdit && <div className="flex gap-2"><CampaignForm centers={d.centers} camp={{ id: c.id, name: c.name, utmCampaign: c.utmCampaign, channel: c.channel, centerId: c.centerId, budget: c.budget, startDate: c.startDate, endDate: c.endDate, landingUrl: c.landingUrl, notes: c.notes, isActive: c.isActive }} /><SpendForm campaignId={c.id} /></div>}
                      <Link href={`/marketing/funnel?utm=${c.utmCampaign}&from=${cp.range.from}&to=${cp.range.to}`} className="text-xs text-brand-600">Xem phễu</Link>
                    </td>
                    <td className={td}>{vnd(c.spend)}<div className={`text-xs ${c.budgetUsed !== null && c.budgetUsed > 100 ? "font-semibold text-red-700" : "text-ink-400"}`}>/ {vnd(c.budget)}{c.budgetUsed !== null ? ` (${c.budgetUsed}%)` : ""}</div>{c.clicks > 0 && <div className="text-xs text-ink-400">{c.clicks} click</div>}</td>
                    <td className={td}>{c.visits} → {c.leads}{c.cvr !== null && <div className="text-xs text-ink-400">{c.cvr}%</div>}</td>
                    <td className={td}>{c.trials} / <b>{c.enrolled}</b>{c.closeRate !== null && <div className="text-xs text-ink-400">chốt {c.closeRate}%</div>}</td>
                    <td className={td}>{vnd(c.revenue)}</td>
                    <td className={td}>{c.cpl !== null ? vnd(c.cpl) : "—"}<div className="text-xs text-ink-400">{c.cpa !== null ? vnd(c.cpa) : "—"}</div></td>
                    <td className={`${td} font-semibold ${c.roas !== null && c.roas < 1 ? "text-red-700" : "text-green-700"}`}>{c.roas ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {tab === "setup" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Cấu hình tracking">
            <div className="space-y-3 p-4">
              <ul className="space-y-1 text-sm">
                <li>{d.settings.metaPixelId ? "✅" : "⚪"} Meta Pixel {d.settings.metaPixelId ? `(${d.settings.metaPixelId})` : "chưa gắn"}</li>
                <li>{d.settings.capiConfigured ? "✅" : "⚪"} Meta Conversions API {d.settings.capiConfigured ? "đã có token" : "— đặt biến môi trường META_CAPI_TOKEN"}</li>
                <li>{d.settings.ga4MeasurementId ? "✅" : "⚪"} GA4 {d.settings.ga4MeasurementId || "chưa gắn"}{d.settings.ga4ApiConfigured ? " · Measurement Protocol đã cấu hình" : ""}</li>
                <li>{d.settings.trackingEnabled ? "✅" : "⛔"} Sự kiện first-party ({Object.values(d.events).reduce((a, e) => a + e.n, 0)} sự kiện trong kỳ)</li>
              </ul>
              <TrackingSettings canEdit={d.settings.canConfigure} initial={{ metaPixelId: d.settings.metaPixelId, ga4MeasurementId: d.settings.ga4MeasurementId, trackingEnabled: d.settings.trackingEnabled, leadRetentionMonths: d.settings.leadRetentionMonths }} />
            </div>
          </Section>
          <Section title="Tạo link UTM">
            <div className="p-4"><UtmBuilder campaigns={cp.items.filter((c) => c.isActive).map((c) => ({ utmCampaign: c.utmCampaign, name: c.name, landingUrl: c.landingUrl }))} /></div>
          </Section>
          <Section title="Gắn tracking vào satarobo.vn">
            <div className="space-y-2 p-4 text-sm">
              <p>Website gửi sự kiện về <code>/api/public/track</code> (POST JSON). Mã ẩn danh sinh ngẫu nhiên trong trình duyệt, không chứa số điện thoại / email.</p>
              <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs">{`fetch("${"https://<he-thong>"}/api/public/track", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event: "page_view", anonId, path: location.pathname,
    referrer: document.referrer, utm_source, utm_medium, utm_campaign })
})`}</pre>
              <p className="text-xs text-ink-400">Sự kiện: page_view, form_view, form_start, form_submit, cta_click. Form gửi kèm <code>anonId</code> tới <code>/api/public/leads</code> để nối lượt truy cập với lead. Nội dung trang: <code>/api/public/site/home</code>; tin tức: <code>/api/public/news</code>.</p>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
