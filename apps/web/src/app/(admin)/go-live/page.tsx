import { hasPermission, PARALLEL_METRICS, PARALLEL_METRIC_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th } from "@/components/report-ui";
import { vnd } from "@/components/finance-ui";
import Link from "next/link";
import { PILOT_FB_CATEGORIES, PILOT_FB_CATEGORY_VI, PILOT_FB_SEVERITIES, PILOT_FB_SEVERITY_VI, PILOT_FB_STATUSES, PILOT_FB_STATUS_VI, type PilotFbStatus } from "@satarobo/core";
import { ChecklistToggle, LogDayForm, ExplainForm, StageButton, FeedbackForm, FeedbackAction } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Go-live cơ sở" };
const STAGE_CLS: Record<string, string> = { preparing: "bg-slate-100 text-ink-600", parallel: "bg-sky-100 text-sky-800", live: "bg-green-100 text-green-800", legacy_readonly: "bg-emerald-200 text-emerald-900" };
const val = (m: string, v: number | undefined) => (v === undefined ? "—" : m === "collected" ? vnd(v) : v.toLocaleString("vi-VN"));
const dmy = (d: string) => d.split("-").reverse().join("/");

export default async function GoLivePage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "cutover:read")) return <NoAccess title="Go-live cơ sở" perm="cutover:read" />;
  const d = await caller.cutover.overview();
  const tab = sp.tab === "phan-hoi" ? "phan-hoi" : "co-so";
  const nav = (
    <nav className="flex gap-1 border-b border-black/10 text-sm">
      {([["co-so", "Cơ sở"], ["phan-hoi", "Phản hồi pilot"]] as const).map(([k, l]) => <Link key={k} href={k === "co-so" ? "/go-live" : `/go-live?tab=${k}`} className={`px-3 py-2 ${tab === k ? "border-b-2 border-brand-500 font-semibold" : "text-ink-600"}`}>{l}</Link>)}
    </nav>
  );
  if (tab === "phan-hoi") {
    const status = PILOT_FB_STATUSES.includes(sp.status as PilotFbStatus) ? (sp.status as PilotFbStatus) : null;
    const fb = await caller.pilot.feedback({ status });
    return (
      <div className="space-y-4">
        <PageHeader title="Go-live cơ sở" desc="Sổ phản hồi trong thời gian pilot: nhân viên ghi lỗi, sai dữ liệu, chỗ chưa biết thao tác; Hội sở xử lý. Mức “chặn công việc” phải xử lý trong 4 giờ và chặn việc khoá hệ cũ." />
        {nav}
        <FeedbackForm centers={d.centers.map((c) => ({ id: c.id, code: c.code }))} categories={PILOT_FB_CATEGORIES.map((k) => ({ key: k, label: PILOT_FB_CATEGORY_VI[k] }))} severities={PILOT_FB_SEVERITIES.map((k) => ({ key: k, label: PILOT_FB_SEVERITY_VI[k] }))} />
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/go-live?tab=phan-hoi" className={`chip ${!status ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>Tất cả</Link>
          {PILOT_FB_STATUSES.map((k) => <Link key={k} href={`/go-live?tab=phan-hoi&status=${k}`} className={`chip ${status === k ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>{PILOT_FB_STATUS_VI[k]}</Link>)}
        </div>
        <Section title={`Phản hồi (${fb.items.length})`}>
          {fb.items.length === 0 ? <p className="p-4 text-sm text-ink-600">Chưa có phản hồi.</p> : (
            <ul className="divide-y divide-black/5">{fb.items.map((f) => (
              <li key={f.id} className={`space-y-1 p-4 text-sm ${f.overdue ? "bg-red-50/60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${f.severity === "high" ? "bg-red-100 text-red-700" : f.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}>{f.severityLabel}</span>
                  <span className="chip bg-slate-100">{f.categoryLabel}</span>
                  <span className="font-semibold">{f.title}</span>
                  <span className="text-xs text-ink-400">{f.centerCode} · {f.by ?? "—"} · {new Date(f.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
                  <span className="chip bg-sky-50 text-sky-800">{f.statusLabel}</span>
                  {f.overdue && <span className="chip bg-red-100 text-red-700">Quá hạn xử lý</span>}
                </div>
                {f.detail && <p className="whitespace-pre-line text-ink-600">{f.detail}</p>}
                {f.pageUrl && <div className="text-xs">Trang: <Link href={f.pageUrl} className="text-brand-600">{f.pageUrl}</Link></div>}
                {f.resolution && <p className="text-xs text-green-800">Xử lý: {f.resolution}{f.handler ? ` — ${f.handler}` : ""}</p>}
                {fb.canHandle && <FeedbackAction id={f.id} status={f.status as PilotFbStatus} />}
              </li>
            ))}</ul>
          )}
        </Section>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Go-live cơ sở" desc={`Mỗi cơ sở: Chuẩn bị → Chạy song song (nhập cả hai hệ, cuối ngày quản lý ghi sổ đối chiếu) → Chính thức trên hệ mới (cần ${d.minDays} ngày khớp liên tiếp + đủ danh mục) → Hệ cũ chỉ đọc. Hội sở quyết định chuyển giai đoạn.`} />
      {nav}
      {d.centers.map((c) => (
        <Section key={c.id} title={`${c.code} — ${c.name}`} actions={<span className={`chip ${STAGE_CLS[c.stage]}`}>{c.stageLabel}</span>}>
          <div className="grid gap-4 p-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Kpi label="Khớp liên tiếp" value={`${c.streak}/${d.minDays}`} tone={c.streak >= d.minDays ? "good" : "default"} />
                <Kpi label="Ngày đã ghi" value={c.parallelDays} />
                <Kpi label="Lệch chưa giải thích" value={c.openIssues} tone={c.openIssues ? "bad" : "good"} />
                <Kpi label="Sự cố chặn việc" value={c.openHighFeedback} tone={c.openHighFeedback ? "bad" : "good"} />
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
          <Readiness centerId={c.id} />
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

async function Readiness({ centerId }: { centerId: string }) {
  const { caller } = await getServerCaller();
  const r = await caller.readiness.center({ centerId });
  const title = new Map(r.modules.map((m) => [m.key, m.title]));
  return (
    <details className="border-t border-black/5 px-4 py-3 text-sm" open={!r.preflight.ok}>
      <summary className="cursor-pointer font-semibold">
        Kiểm tra trước pilot: {r.preflight.ok ? <span className="text-green-700">không có mục chặn</span> : <span className="text-red-700">{r.preflight.blocks} mục chặn</span>}
        {r.preflight.warns > 0 && <span className="text-amber-700"> · {r.preflight.warns} cảnh báo</span>}
        {" · "}Đào tạo {r.training.trained}/{r.training.total} nhân sự
      </summary>
      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <ul className="space-y-1">
          {r.preflight.rows.map((x) => (
            <li key={x.key} className="flex items-center justify-between gap-2">
              <span className={x.ok ? "text-ink-400" : x.level === "block" ? "text-red-700" : "text-amber-700"}>{x.ok ? "✓" : x.level === "block" ? "✗" : "!"} {x.label}</span>
              {!x.ok && <Link href={x.href} className="text-xs text-brand-600">{x.key.startsWith("no") ? "" : `${x.count} · `}Xử lý</Link>}
            </li>
          ))}
        </ul>
        <div>
          {r.training.rows.length === 0 ? <p className="text-ink-600">Chưa có tài khoản nhân sự gắn với cơ sở.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-400"><th className="p-1">Nhân sự</th><th className="p-1">Còn thiếu bài</th></tr></thead>
              <tbody className="divide-y divide-black/5">{r.training.rows.filter((x) => x.required.length).map((x) => (
                <tr key={x.userId}><td className="p-1">{x.name}</td><td className="p-1">{x.missing.length ? <span className="text-amber-700">{x.missing.map((k) => title.get(k) ?? k).join(", ")}</span> : <span className="text-green-700">Đã xong</span>}</td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="mt-1 text-[11px] text-ink-400">Nhân sự học tại <Link href="/huong-dan" className="text-brand-600">Hướng dẫn & đào tạo</Link>.</p>
        </div>
      </div>
    </details>
  );
}
