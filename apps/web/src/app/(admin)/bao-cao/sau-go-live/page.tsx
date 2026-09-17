import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo sau go-live" };
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
const dm = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

export default async function AdoptionPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "report:read")) return <NoAccess title="Báo cáo sau go-live" perm="report:read" />;
  const weeks = [4, 8, 12].includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const d = await caller.pilot.adoption({ weeks });
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo sau go-live" desc="Mức độ dùng hệ mới theo tuần ở từng cơ sở, so với mục tiêu. Tuần tính từ thứ Hai. Chỉ số OTP / tin nhắn tính theo phụ huynh có con đang học ở cơ sở." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[4, 8, 12].map((w) => <Link key={w} href={`/bao-cao/sau-go-live?weeks=${w}`} className={`chip ${w === weeks ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>{w} tuần</Link>)}
        <span className="text-ink-600">Thông báo đẩy: {d.push.configured ? `${d.push.devices} thiết bị / ${d.push.parents} phụ huynh` : "chưa cấu hình khoá VAPID"}</span>
        {!d.einvoiceOn && <span className="text-ink-400">Hoá đơn điện tử chưa bật — bỏ qua chỉ số hoá đơn</span>}
      </div>
      {d.centers.map((c) => (
        <Section key={c.id} title={`${c.code} — ${c.name}`} desc={`${c.stageLabel}${c.liveAt ? ` từ ${new Date(c.liveAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""} · Phản hồi pilot mở: ${c.feedback.open} (chặn việc ${c.feedback.high})`}
          actions={<CsvButton filename={`sau-go-live-${c.code}`} headers={["Tuần", ...c.summary.map((x) => x.label)]} rows={c.weeks.map((w) => [w.week, ...w.checks.map((x) => (x.rate === null ? "" : Math.round(x.rate * 1000) / 10))])} />}>
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
            {c.summary.map((x) => (
              <Kpi key={x.key} label={x.label} value={pct(x.rate)} tone={x.ok === null ? "default" : x.ok ? "good" : "bad"}
                hint={`Mục tiêu ${Math.round(x.target * 100)}% · ${x.num}/${x.den}${x.prev !== null && x.rate !== null ? ` · tuần trước ${pct(x.prev)}` : ""}`} />
            ))}
          </div>
          <div className="overflow-x-auto border-t border-black/5">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Chỉ số</th>{c.weeks.map((w) => <th key={w.week} className={th}>{dm(w.week)}</th>)}</tr></thead>
              <tbody className="divide-y divide-black/5">
                {c.summary.map((x) => (
                  <tr key={x.key}><td className="p-3">{x.label}</td>
                    {c.weeks.map((w) => { const v = w.checks.find((y) => y.key === x.key)!; return <td key={w.week} className={`p-3 tabular-nums ${v.ok === false ? "text-red-700" : v.ok ? "text-green-700" : "text-ink-400"}`} title={`${v.num}/${v.den}`}>{pct(v.rate)}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}
