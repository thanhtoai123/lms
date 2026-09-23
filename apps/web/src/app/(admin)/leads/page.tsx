import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { hasPermission, type Actor, LEAD_STATUSES, LEAD_STATUS_VI, OPEN_LEAD_STATUSES, LEAD_SHARE_LABEL, type LeadStatus } from "@satarobo/core";
import { Pager, fmtDate } from "@/components/admin-ui";
import { CsvButton } from "@/components/csv-button";
import { ColumnChooser, type ColumnDef } from "@/components/column-chooser";
import { ExportAllButton } from "@/components/export-all-button";
import { LeadChip, SlaChip, fmtDateTime } from "@/components/lead-ui";
import { LeadKanban } from "@/components/lead-kanban";
import { LeadDeleteButton, LeadTouchButton } from "@/components/lead-status";
import { RememberFilters } from "@/components/remember-filters";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

type SP = { scope?: string; status?: string; q?: string; view?: string; center?: string; owner?: string; source?: string; from?: string; to?: string; page?: string; size?: string };

/** Cột của bảng lead — người dùng tự chọn hiện/ẩn, lưu theo máy (nút "Cột hiển thị") */
const LEAD_COLUMNS: ColumnDef[] = [
  { key: "sla", label: "SLA" },
  { key: "parent", label: "Phụ huynh / con", locked: true },
  { key: "phone", label: "SĐT" },
  { key: "course", label: "Quan tâm" },
  { key: "status", label: "Trạng thái" },
  { key: "source", label: "Nguồn" },
  { key: "owner", label: "Sale phụ trách" },
  { key: "created", label: "Ngày nhận lead" },
  { key: "touched", label: "Chạm cuối" },
  { key: "tasks", label: "Việc" },
  { key: "actions", label: "Hành động", locked: true },
];

export default async function LeadsInbox({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const scope = sp.scope === "mine" ? "mine" : "all";
  const status = LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;
  const allStatuses = sp.status === "all";
  const uuidOr = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const dateOr = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const owner = sp.owner === "none" ? "none" : uuidOr(sp.owner);
  const size = [20, 50, 100].includes(Number(sp.size)) ? Number(sp.size) : 50;
  const { caller, ctx } = await getServerCaller();
  // Xuất danh sách khách kèm liên hệ ra tệp cần quyền riêng (lead:export)
  const canExport = !!ctx.actor && hasPermission(ctx.actor as Actor, "lead:export");
  const kanban = sp.view === "kanban";
  const filters = { scope, status, allStatuses, q: sp.q || undefined, centerId: uuidOr(sp.center), assignedToId: owner, source: sp.source || undefined, from: dateOr(sp.from), to: dateOr(sp.to) } as const;
  const [{ items, summary, total, page, pageSize, facets }, ref] = await Promise.all([
    caller.admissions.leads.inbox(kanban ? { ...filters, limit: 500 } : { ...filters, page: Math.max(1, Number(sp.page) || 1), pageSize: size }),
    caller.academics.classes.referenceData(),
  ]);
  const qs = (view: string) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (v && k !== "view" && k !== "page") u.set(k, v); if (view) u.set("view", view); const t = u.toString(); return t ? `/leads?${t}` : "/leads"; };
  const filtered = !!(sp.q || sp.status || sp.center || sp.owner || sp.source || sp.from || sp.to || scope === "mine");

  return (
    <div className="space-y-4">
      <RememberFilters storageKey="leads" ignore={["page"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Danh sách Lead</h1>
          <p className="text-sm text-ink-600">Lead đang mở sắp theo mức quá hạn SLA: lead mới phải gọi trong 15 phút, sau học thử gọi trong 24 giờ. Chọn “Mọi trạng thái” để xem cả lead đã đăng ký / đã mất (mới nhận trước).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-border bg-muted p-1 text-sm">
            <Link href={qs("")} className={`rounded-lg px-3 py-1.5 ${!kanban ? "bg-card font-semibold text-primary shadow-sm" : "text-muted-foreground"}`}>Bảng</Link>
            <Link href={qs("kanban")} className={`rounded-lg px-3 py-1.5 ${kanban ? "bg-card font-semibold text-primary shadow-sm" : "text-muted-foreground"}`}>Kanban</Link>
          </div>
          <Link href="/leads/import" className="btn-ghost">Nhập từ file</Link>
          <Link href="/leads/import/registered" className="btn-ghost">Nhập khách đã đăng ký</Link>
          <Link href="/leads/bulk-convert" className="btn-ghost">Chốt hàng loạt</Link>
          <Link href="/nhap-khach-hang" className="btn-primary">+ Nhập khách hàng</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={allStatuses || (status && !OPEN_LEAD_STATUSES.includes(status as never)) ? "Lead theo bộ lọc" : "Lead đang mở"} value={total} />
        <Stat label="Quá SLA" value={summary.overdue} tone={summary.overdue ? "danger" : "ok"} />
        <Stat label="Sắp đến hạn" value={summary.warning} tone={summary.warning ? "warn" : undefined} />
        <Stat label={allStatuses ? "Đã đăng ký" : "Chờ quyết định"} value={allStatuses ? summary.byStatus.enrolled ?? 0 : summary.byStatus.deciding ?? 0} />
      </div>

      <form className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Tên PH / tên con / SĐT…" className="input" aria-label="Tìm lead" />
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Trạng thái">
          <option value="">Mọi trạng thái mở</option>
          <option value="all">Mọi trạng thái (kể cả đã đóng)</option>
          {OPEN_LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_VI[s]}</option>)}
          <option value="enrolled">{LEAD_STATUS_VI.enrolled}</option>
          <option value="lost">{LEAD_STATUS_VI.lost}</option>
        </select>
        <select name="center" defaultValue={sp.center ?? ""} className="input" aria-label="Cơ sở">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""} className="input" aria-label="Người phụ trách">
          <option value="">Mọi người phụ trách</option>
          <option value="none">Chưa phân</option>
          {facets.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="input" aria-label="Nguồn">
          <option value="">Mọi nguồn</option>
          {facets.sources.map((x) => <option key={x.source} value={x.source}>{x.source} ({x.n})</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Nhận từ ngày" title="Nhận từ ngày" />
          <span className="text-ink-400">–</span>
          <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Nhận đến ngày" title="Nhận đến ngày" />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4 xl:col-span-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="scope" value="mine" defaultChecked={scope === "mine"} /> Chỉ lead của tôi</label>
          {!kanban && (
            <label className="flex items-center gap-2 text-sm">Mỗi trang
              <select name="size" defaultValue={String(size)} className="input !w-auto !py-1">{[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
          )}
          {kanban && <input type="hidden" name="view" value="kanban" />}
          <button className="btn-primary !py-1.5" type="submit">Lọc</button>
          {filtered && <Link href={kanban ? "/leads?view=kanban" : "/leads"} className="btn-ghost !py-1.5">Xoá lọc</Link>}
          {!kanban && (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <ColumnChooser tableKey="leads" columns={LEAD_COLUMNS} />
              {canExport && <ExportAllButton kind="leads" filename="leads-theo-bo-loc" filters={filters} />}
              {canExport && <CsvButton
                filename={`leads-trang-${page}`}
                label="Xuất CSV (trang này)"
                headers={["Ngày nhận", "Phụ huynh", "Con", "Lớp", "SĐT", "Quan tâm", "Cơ sở", "Trạng thái", "Nguồn", "Phụ trách", "Chạm cuối"]}
                rows={items.map((l) => [fmtDate(l.createdAt), l.parentName, l.childName, l.childGrade, l.phone, l.courseCode, l.centerCode, LEAD_STATUS_VI[l.status], l.source, l.assigneeName, fmtDateTime(l.lastTouchAt)])}
              />}
            </span>
          )}
        </div>
      </form>

      {kanban ? (
        <LeadKanban items={items.map((l) => ({
          id: l.id, status: l.status, parentName: l.parentName, phone: l.phone, childName: l.childName, childGrade: l.childGrade, courseCode: l.courseCode, source: l.source,
          assignedToId: l.assignedToId, assigneeName: l.assigneeName, createdAt: l.createdAt.toISOString(), canAssign: l.canAssign, sla: l.sla,
        }))} />
      ) : items.length === 0 ? (
        <Empty>{filtered ? "Không có lead khớp bộ lọc." : "Không có lead nào. Thêm lead hoặc đợi form website gửi về."}</Empty>
      ) : (
        <div className="card overflow-x-auto" data-table="leads">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="p-3" data-col="sla">SLA</th><th className="p-3" data-col="parent">Phụ huynh / con</th><th className="p-3" data-col="phone">SĐT</th>
                <th className="p-3" data-col="course">Quan tâm</th><th className="p-3" data-col="status">Trạng thái</th><th className="p-3" data-col="source">Nguồn</th>
                <th className="p-3" data-col="owner">Phụ trách</th><th className="p-3" data-col="created">Nhận lead</th><th className="p-3" data-col="touched">Chạm cuối</th>
                <th className="p-3" data-col="tasks">Việc</th><th className="p-3" data-col="actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {items.map((l) => (
                <tr key={l.id} className={l.sla.level === "overdue" ? "bg-red-50/50" : ""}>
                  <td className="p-3" data-col="sla"><SlaChip sla={l.sla} /></td>
                  <td className="p-3" data-col="parent">
                    <Link href={`/leads/${l.id}`} className="font-medium text-brand-700">{l.parentName}</Link>
                    {l.sharedWithCenter && <span className="ml-1 chip bg-sky-100 text-sky-800" title={l.visibility === "owner" ? LEAD_SHARE_LABEL.mineShared : LEAD_SHARE_LABEL.toggle}>{LEAD_SHARE_LABEL.chip}</span>}
                    <div className="text-xs text-ink-400">{l.childName ?? "—"}{l.childGrade ? ` · lớp ${l.childGrade}` : ""}</div>
                  </td>
                  <td className="p-3 font-mono text-xs" data-col="phone">{l.phone}</td>
                  <td className="p-3" data-col="course">{l.courseCode ?? "—"}{l.centerCode ? ` · ${l.centerCode}` : ""}</td>
                  <td className="p-3" data-col="status"><LeadChip status={l.status} /></td>
                  <td className="p-3 text-xs" data-col="source">{l.source ?? "—"}</td>
                  <td className="p-3" data-col="owner">{l.assigneeName ?? <span className="text-ink-400">Chưa phân</span>}</td>
                  <td className="p-3 whitespace-nowrap text-xs" data-col="created" title={`Nhận lần đầu: ${fmtDateTime(l.createdAt)}${l.lastReentryAt ? ` · nhập lại gần nhất ${fmtDateTime(l.lastReentryAt)}` : ""}`}>
                    {fmtDateTime(l.createdAt)}{l.reentryCount > 0 && <span className="ml-1 chip bg-amber-100 text-amber-800">· nhập lại {l.reentryCount} lần</span>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs" data-col="touched">{fmtDateTime(l.lastTouchAt)}</td>
                  <td className="p-3" data-col="tasks">{l.openTasks > 0 && <span className="chip bg-brand-100 text-brand-700">{l.openTasks}</span>}</td>
                  <td className="p-3" data-col="actions">
                    <div className="flex items-center gap-1">
                      <LeadTouchButton leadId={l.id} name={l.parentName} />
                      {l.canDelete && <LeadDeleteButton leadId={l.id} name={l.parentName} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!kanban && total > 0 && <Pager basePath="/leads" params={sp} page={page} pageSize={pageSize} total={total} />}
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
