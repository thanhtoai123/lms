import { hasPermission, PARALLEL_METRICS, PARALLEL_METRIC_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { vnd } from "@/components/finance-ui";
import { ChecklistToggle, LogDayForm, ExplainForm, StageButton } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Go-live cơ sở" };
const STAGE_CLS: Record<string, string> = { preparing: "bg-slate-100 text-ink-600", parallel: "bg-sky-100 text-sky-800", live: "bg-green-100 text-green-800", legacy_readonly: "bg-emerald-200 text-emerald-900" };
const val = (m: string, v: number | undefined) => (v === undefined ? "—" : m === "collected" ? vnd(v) : v.toLocaleString("vi-VN"));
const dmy = (d: string) => d.split("-").reverse().join("/");

export default async function GoLivePage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "cutover:read")) return <NoAccess title="Go-live cơ sở" perm="cutover:read" />;
  const d = await caller.cutover.overview();
  return (
    <div className="space-y-4">
      <PageHeader title="Go-live cơ sở" desc={`Mỗi cơ sở: Chuẩn bị → Chạy song song (nhập cả hai hệ, cuối ngày quản lý ghi sổ đối chiếu) → Chính thức trên hệ mới (cần ${d.minDays} ngày khớp liên tiếp + đủ danh mục) → Hệ cũ chỉ đọc. Hội sở quyết định chuyển giai đoạn.`} />
      {d.centers.map((c) => (
        <Section key={c.id} title={`${c.code} — ${c.name}`} actions={<span className={`chip ${STAGE_CLS[c.stage]}`}>{c.stageLabel}</span>}>
          <div className="grid gap-4 p-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Kpi label="Khớp liên tiếp" value={`${c.streak}/${d.minDays}`} tone={c.streak >= d.minDays ? "good" : "default"} />
                <Kpi label="Ngày đã ghi" value={c.parallelDays} />
                <Kpi label="Lệch chưa giải thích" value={c.openIssues} tone={c.openIssues ? "bad" : "good"} />
              </div>
              <div className="text-xs text-ink-600">
                {c.parallelFrom && <div>Chạy song song từ {dmy(c.parallelFrom)}</div>}
                {c.liveAt && <div>Chính thức từ {new Date(c.liveAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>}
                {c.readonlyAt && <div>Hệ cũ chỉ đọc từ {new Date(c.readonlyAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</div>}
                {c.note && <div>Quyết định gần nhất: {c.note}</div>}
              </div>
              <h3 className="pt-2 text-sm font-semibold">Danh mục sẵn sàng</h3>
              <ul className="space-y-1 text-sm">
                {c.checklist.map((k) => (
                  <li key={k.key}><ChecklistToggle centerId={c.id} k={k.key} label={k.label} done={k.done} auto={!!k.auto} required={k.required} disabled={!c.canLog} /></li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Ghi sổ chạy song song</h3>
              {c.stage === "parallel" && c.canLog ? <LogDayForm centerId={c.id} today={d.today} /> : <p className="text-sm text-ink-600">{c.stage === "parallel" ? "Chỉ quản lý cơ sở ghi sổ." : "Chỉ ghi khi cơ sở đang chạy song song."}</p>}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Chuyển giai đoạn</h3>
              {c.next.filter((n) => n.stage !== c.stage).map((n) => (
                <div key={n.stage} className="rounded-xl border border-black/10 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><span>{n.label}</span>{d.canApprove && <StageButton centerId={c.id} stage={n.stage} label={n.label} disabled={n.blockers.length > 0} />}</div>
                  {n.blockers.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-ink-600">{n.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
                </div>
              ))}
            </div>
          </div>
          {c.days.length > 0 && (
            <div className="overflow-x-auto border-t border-black/5">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Ngày</th>{PARALLEL_METRICS.map((m) => <th key={m} className={th}>{PARALLEL_METRIC_VI[m]} (cũ / mới)</th>)}<th className={th}>Kết quả</th></tr></thead>
                <tbody className="divide-y divide-black/5">{c.days.map((x) => {
                  const lg = x.legacy as Record<string, number>;
                  const cu = x.current as Record<string, number>;
                  return (
                    <tr key={x.id} className={x.ok ? "" : x.explanation ? "bg-amber-50/50" : "bg-red-50/60"}>
                      <td className="p-3 text-xs">{dmy(x.date)}</td>
                      {PARALLEL_METRICS.map((m) => <td key={m} className={`p-3 text-xs tabular-nums ${lg[m] !== cu[m] ? "font-semibold text-red-700" : ""}`}>{val(m, lg[m])} / {val(m, cu[m])}</td>)}
                      <td className="p-3 text-xs">
                        {x.ok ? <span className="text-green-700">Khớp</span> : x.explanation ? <span>Đã giải thích: {x.explanation}</span> : c.canLog ? <ExplainForm id={x.id} /> : <span className="text-red-700">Lệch {x.mismatches} chỉ số</span>}
                        {x.note && <div className="text-ink-400">{x.note}</div>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </Section>
      ))}
    </div>
  );
}
