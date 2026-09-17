import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, RateChip, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";
import { PilotConfig } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đo pilot chat" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ChatPilotPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "report:read")) return <NoAccess title="Đo pilot chat" perm="report:read" />;
  const d = await caller.messaging.pilot({ from: sp.from && ISO.test(sp.from) ? sp.from : undefined, to: sp.to && ISO.test(sp.to) ? sp.to : undefined });
  const t = d.totals;
  const tg = d.targets;
  return (
    <div className="space-y-4">
      <PageHeader title="Đo pilot chat" desc={`Pilot tin nhắn phụ huynh trên các lớp chọn: tỉ lệ kích hoạt tài khoản, phụ huynh có mở / trả lời tin, thông báo được đọc trong ${d.readHours ?? 48} giờ, tốc độ trả lời của trung tâm. Đạt đủ ngưỡng thì mở rộng toàn hệ thống.`} />
      <form className="card flex flex-wrap items-end gap-2 p-3 text-xs">
        <label>Từ ngày<input type="date" name="from" defaultValue={d.range.from} className="input mt-1 !py-1.5" /></label>
        <label>Đến ngày<input type="date" name="to" defaultValue={d.range.to} className="input mt-1 !py-1.5" /></label>
        <button className="btn-primary !py-1.5">Xem</button>
      </form>
      {d.canConfigure && <PilotConfig classes={d.classes} initial={d.settings} />}
      {!t ? <div className="card p-6"><Empty>Chưa chọn lớp pilot{d.canConfigure ? " — chọn lớp ở trên." : " — quản lý cơ sở cấu hình lớp tham gia."}</Empty></div> : (
        <>
          <div className={`card p-4 text-sm ${d.verdict?.pass ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <b>{d.verdict?.pass ? "Đạt ngưỡng mở rộng" : "Chưa đạt ngưỡng mở rộng"}</b>
            {d.verdict && d.verdict.misses.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{d.verdict.misses.map((m) => <li key={m}>{m}</li>)}</ul>}
            {d.settings.note && <p className="mt-1 text-xs text-ink-600">{d.settings.note}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Phụ huynh trong nhóm" value={t.parents} />
            <Kpi label="Đã kích hoạt" value={`${t.activation}%`} tone={t.activation >= tg.activation ? "good" : "warn"} hint={`${t.activated} PH · mục tiêu ${tg.activation}%`} />
            <Kpi label="Đăng nhập trong kỳ" value={t.loggedIn} />
            <Kpi label="Mở / trả lời tin" value={`${t.engagedPct}%`} tone={t.engagedPct >= tg.engaged ? "good" : "warn"} hint={`${t.opened} mở · ${t.engaged} trả lời`} />
            <Kpi label="Đọc ≤ 48h" value={t.notifications ? `${t.read48Pct}%` : "—"} tone={t.read48Pct >= tg.read48h ? "good" : "warn"} hint={`${t.read48}/${t.notifications} thông báo`} />
            <Kpi label="Trả lời PH (trung vị)" value={t.medianReplyMin === null ? "—" : `${t.medianReplyMin}′`} hint={t.withinSla === null ? undefined : `${t.withinSla}% đúng hạn`} />
          </div>
          <Section title="Theo lớp" actions={<CsvButton filename={`pilot-chat_${d.range.from}_${d.range.to}`} headers={["Lớp", "PH", "Kích hoạt %", "Đăng nhập", "Mở", "Trả lời", "Thông báo", "Đọc ≤48h %", "Trung vị phản hồi (phút)", "Đúng hạn %"]} rows={d.rows.map((r) => [r.code, r.parents, r.activation, r.loggedIn, r.opened, r.engaged, r.notifications, r.read48Pct, r.medianReplyMin ?? "", r.withinSla ?? ""])} />}>
            {d.rows.length === 0 ? <div className="p-4"><Empty>Không có lớp.</Empty></div> : (
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Lớp</th><th className={th}>PH</th><th className={th}>Kích hoạt</th><th className={th}>Đăng nhập</th><th className={th}>Mở / trả lời</th><th className={th}>Đọc ≤48h</th><th className={th}>Phản hồi</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="p-3"><span className="font-mono text-xs font-semibold">{r.code}</span><div className="text-xs text-ink-400">{r.name}</div></td>
                      <td className={td}>{r.parents}</td>
                      <td className={td}><RateChip value={r.activation} good={tg.activation} warn={50} /></td>
                      <td className={td}>{r.loggedIn}</td>
                      <td className={td}>{r.opened} / {r.engaged}</td>
                      <td className={td}>{r.notifications ? <RateChip value={r.read48Pct} good={tg.read48h} warn={60} /> : "—"}</td>
                      <td className={td}>{r.medianReplyMin === null ? "—" : `${r.medianReplyMin}′`}{r.waiting ? <span className="ml-1 text-xs text-red-700">({r.waiting} chờ)</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
