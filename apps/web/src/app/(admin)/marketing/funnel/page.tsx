import Link from "next/link";
import { hasPermission, CHANNELS, CHANNEL_VI, type Actor, type Channel } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { HBar, Section } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funnel marketing" };

type SP = { from?: string; to?: string; utm?: string; channel?: string };

export default async function FunnelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "marketing:read")) return <NoAccess title="Funnel marketing" perm="marketing:read" />;
  const channel = CHANNELS.includes(sp.channel as Channel) ? (sp.channel as Channel) : undefined;
  const d = await caller.marketing.funnel({ from: sp.from || undefined, to: sp.to || undefined, utmCampaign: sp.utm || undefined, channel });
  const max = Math.max(1, ...d.steps.map((s) => s.n));
  return (
    <div className="space-y-4">
      <PageHeader title="Funnel marketing" desc="Từ lượt truy cập website đến thanh toán, lọc theo chiến dịch hoặc kênh. Bước website đếm người (mã ẩn danh) — bước lead đếm hồ sơ." actions={<Link href={`/marketing?from=${d.range.from}&to=${d.range.to}&tab=campaigns`} className="btn-ghost">← Chiến dịch</Link>} />
      <form className="card flex flex-wrap items-end gap-2 p-3" action="/marketing/funnel">
        <label className="text-xs">Từ ngày<input type="date" name="from" defaultValue={d.range.from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs">Đến ngày<input type="date" name="to" defaultValue={d.range.to} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs">Chiến dịch<select name="utm" defaultValue={d.utmCampaign ?? ""} className="input mt-1 !py-1.5"><option value="">Tất cả</option>{d.campaigns.map((c) => <option key={c.utmCampaign} value={c.utmCampaign}>{c.name}</option>)}</select></label>
        <label className="text-xs">Kênh<select name="channel" defaultValue={channel ?? ""} className="input mt-1 !py-1.5"><option value="">Tất cả</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_VI[c]}</option>)}</select></label>
        <button className="btn-primary !py-1.5">Xem</button>
      </form>
      {d.biggestDrop && d.biggestDrop.fromPrev !== null && d.biggestDrop.fromPrev < 100 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Rơi nhiều nhất ở bước <b>{d.biggestDrop.label}</b>: chỉ {d.biggestDrop.fromPrev}% chuyển tiếp từ bước trước.</p>
      )}
      <Section title="Phễu" actions={<CsvButton filename={`pheu-marketing_${d.range.from}_${d.range.to}`} headers={["Bước", "Số lượng", "% so với bước trước", "% so với lead"]} rows={d.steps.map((s) => [s.label, s.n, s.fromPrev ?? "", s.fromLeads ?? ""])} />}>
        <div className="space-y-3 p-4">
          {d.steps.map((s, i) => (
            <div key={s.key} className={i === 4 ? "border-t border-dashed border-black/10 pt-3" : ""}>
              <div className="flex justify-between text-sm"><span>{s.label}{s.web && <span className="ml-1 text-xs text-ink-400">(website)</span>}</span><span className="tabular-nums"><b>{s.n}</b>{s.fromPrev !== null && <span className="ml-2 text-xs text-ink-400">{s.fromPrev}% bước trước</span>}{s.fromLeads !== null && s.key !== "leads" && <span className="ml-2 text-xs text-ink-400">{s.fromLeads}% lead</span>}</span></div>
              <HBar value={s.n} max={max} tone={s.web ? "muted" : s.key === "paid" || s.key === "enrolled" ? "good" : "brand"} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
