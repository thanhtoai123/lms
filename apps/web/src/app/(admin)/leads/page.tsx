import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { LEAD_STATUSES, LEAD_STATUS_VI, OPEN_LEAD_STATUSES, type LeadStatus } from "@satarobo/core";
import { LeadChip, SlaChip, fmtDateTime } from "@/components/lead-ui";
import { LeadKanban } from "@/components/lead-kanban";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

export default async function LeadsInbox({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string; q?: string; view?: string }> }) {
  const sp = await searchParams;
  const scope = sp.scope === "mine" ? "mine" : "all";
  const status = LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;
  const { caller } = await getServerCaller();
  const kanban = sp.view === "kanban";
  const { items, summary } = await caller.admissions.leads.inbox({ scope, status, q: sp.q || undefined, limit: kanban ? 500 : 200 });
  const qs = (view: string) => { const u = new URLSearchParams(); if (sp.q) u.set("q", sp.q); if (sp.status) u.set("status", sp.status); if (scope === "mine") u.set("scope", "mine"); if (view) u.set("view", view); const t = u.toString(); return t ? `/leads?${t}` : "/leads"; };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Danh sách Lead</h1>
          <p className="text-sm text-ink-600">Sắp xếp theo mức quá hạn SLA: lead mới phải gọi trong 15 phút, sau học thử gọi trong 24 giờ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl bg-black/5 p-1 text-sm">
            <Link href={qs("")} className={`rounded-lg px-3 py-1.5 ${!kanban ? "bg-white shadow-sm font-semibold" : "text-ink-600"}`}>Bảng</Link>
            <Link href={qs("kanban")} className={`rounded-lg px-3 py-1.5 ${kanban ? "bg-white shadow-sm font-semibold" : "text-ink-600"}`}>Kanban</Link>
          </div>
          <Link href="/leads/bulk-convert" className="btn-ghost">Chốt hàng loạt</Link>
          <Link href="/nhap-khach-hang" className="btn-primary">+ Nhập khách hàng</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Lead đang mở" value={summary.total} />
        <Stat label="Quá SLA" value={summary.overdue} tone={summary.overdue ? "danger" : "ok"} />
        <Stat label="Sắp đến hạn" value={summary.warning} tone={summary.warning ? "warn" : undefined} />
        <Stat label="Chờ quyết định" value={summary.byStatus.deciding ?? 0} />
      </div>

      <form className="flex flex-wrap gap-2 items-center">
        <input name="q" defaultValue={sp.q} placeholder="Tên PH / tên con / SĐT…" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[200px]">
          <option value="">Mọi trạng thái mở</option>
          {OPEN_LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_VI[s]}</option>)}
          <option value="enrolled">{LEAD_STATUS_VI.enrolled}</option>
          <option value="lost">{LEAD_STATUS_VI.lost}</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="scope" value="mine" defaultChecked={scope === "mine"} /> Chỉ lead của tôi</label>
        {kanban && <input type="hidden" name="view" value="kanban" />}
        <button className="btn-ghost" type="submit">Lọc</button>
      </form>

      {kanban ? (
        <LeadKanban items={items} />
      ) : items.length === 0 ? (
        <Empty>Không có lead nào. Thêm lead hoặc đợi form website gửi về.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">SLA</th><th className="p-3">Phụ huynh / con</th><th className="p-3">SĐT</th><th className="p-3">Quan tâm</th><th className="p-3">Trạng thái</th><th className="p-3">Nguồn</th><th className="p-3">Phụ trách</th><th className="p-3">Chạm cuối</th><th className="p-3">Việc</th></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {items.map((l) => (
                <tr key={l.id} className={l.sla.level === "overdue" ? "bg-red-50/50" : ""}>
                  <td className="p-3"><SlaChip sla={l.sla} /></td>
                  <td className="p-3"><Link href={`/leads/${l.id}`} className="font-medium text-brand-700">{l.parentName}</Link><div className="text-xs text-ink-400">{l.childName ?? "—"}{l.childGrade ? ` · lớp ${l.childGrade}` : ""}</div></td>
                  <td className="p-3 font-mono text-xs">{l.phone}</td>
                  <td className="p-3">{l.courseCode ?? "—"}{l.centerCode ? ` · ${l.centerCode}` : ""}</td>
                  <td className="p-3"><LeadChip status={l.status} /></td>
                  <td className="p-3 text-xs">{l.source ?? "—"}</td>
                  <td className="p-3">{l.assigneeName ?? <span className="text-ink-400">Chưa phân</span>}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{fmtDateTime(l.lastTouchAt)}</td>
                  <td className="p-3">{l.openTasks > 0 && <span className="chip bg-brand-100 text-brand-700">{l.openTasks}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "danger" | "warn" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-2xl font-bold ${tone === "danger" ? "text-red-700" : tone === "ok" ? "text-green-700" : tone === "warn" ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}
