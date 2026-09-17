import Link from "next/link";
import {
  REQUEST_KINDS, REQUEST_KIND_VI, REQUEST_STATUSES, REQUEST_STATUS_VI, REQUEST_GROUPS, REQUEST_GROUP_VI, REQUEST_KIND_GROUP,
  LEAVE_TYPE_VI, LATE_EARLY_KIND_VI, type RequestKind, type RequestStatus, type RequestGroup,
} from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { RequestChip, dmy, units } from "@/components/hr-ui";
import { RequestForm } from "@/components/request-form";
import { TimesheetTabs } from "../cham-cong/tabs";
import { DecideRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyệt đơn từ" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string; group?: string; apply?: string; mine?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const status = REQUEST_STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : undefined;
  const kind = REQUEST_KINDS.includes(sp.kind as RequestKind) ? (sp.kind as RequestKind) : undefined;
  const group = REQUEST_GROUPS.includes(sp.group as RequestGroup) ? (sp.group as RequestGroup) : undefined;
  const d = await caller.hr.requests({ status, kind, mine: sp.mine === "1" || undefined, applyFailed: sp.apply === "failed" || undefined });
  const items = group ? d.items.filter((r) => REQUEST_KIND_GROUP[r.kind] === group) : d.items;
  const kpi: { label: string; value: number; href: string; warn?: boolean }[] = [
    { label: "Chờ duyệt", value: d.counts?.pending ?? 0, href: "/don-tu?status=pending" },
    { label: "Nộp muộn", value: d.counts?.late ?? 0, href: "/don-tu?status=pending", warn: (d.counts?.late ?? 0) > 0 },
    { label: `Chờ > ${d.slaDays} ngày`, value: d.counts?.overdue ?? 0, href: "/don-tu?status=pending", warn: (d.counts?.overdue ?? 0) > 0 },
    { label: "Áp thất bại", value: d.counts?.failed ?? 0, href: "/don-tu?status=pending&apply=failed", warn: (d.counts?.failed ?? 0) > 0 },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Duyệt đơn từ"
        desc="Đơn của nhân sự gửi tới cơ sở chịu công. Duyệt là áp ngay lên lịch ca và công: đổi mã ca trên lưới, ghi mã nghỉ, thêm mốc giờ chỉnh tay, huỷ buổi dạy hoặc gán người dạy thay. Áp không được thì đơn tự quay lại Chờ duyệt kèm lý do. Từ chối bắt buộc nhập lý do."
        actions={<Link href="/cham-cong/lich-ca" className="btn-ghost">Của tôi</Link>}
      />
      <TimesheetTabs active="don-tu" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpi.map((k) => (
          <Link key={k.label} href={k.href} className={`card p-3 ${k.warn ? "ring-1 ring-amber-300" : ""}`}>
            <div className="text-xs text-ink-500">{k.label}</div>
            <div className={`text-xl font-semibold ${k.warn ? "text-amber-700" : ""}`}>{k.value}</div>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        <Link href={`/don-tu${status ? `?status=${status}` : ""}`} className={`chip ${!group && !kind ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>Mọi loại</Link>
        {REQUEST_GROUPS.map((g) => <Link key={g} href={`/don-tu?group=${g}${status ? `&status=${status}` : ""}`} className={`chip ${group === g ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>{REQUEST_GROUP_VI[g]}</Link>)}
        {REQUEST_KINDS.filter((k) => !group || REQUEST_KIND_GROUP[k] === group).map((k) => (
          <Link key={k} href={`/don-tu?kind=${k}${status ? `&status=${status}` : ""}`} className={`chip ${kind === k ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>{REQUEST_KIND_VI[k]}</Link>
        ))}
      </div>
      <StatTabs basePath="/don-tu" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...REQUEST_STATUSES.map((s) => ({ key: s, label: REQUEST_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.hasProfile && <RequestForm />}
      {items.length === 0 ? <Empty>Không có đơn.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Người nộp</th><th className="p-3">Loại</th><th className="p-3">Áp dụng</th><th className="p-3">Thay đổi</th><th className="p-3">Lý do</th><th className="p-3">Tuổi đơn</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-black/5 align-top">
              {items.map((r) => (
                <tr key={r.id} className={r.mine ? "bg-brand-50/40" : ""}>
                  <td className="p-3">{r.staffName}{r.mine && <span className="ml-1 text-xs text-brand-700">(tôi)</span>}<div className="text-xs text-ink-400">{r.staffCode} · {r.centerCode}</div></td>
                  <td className="p-3 text-xs">
                    {REQUEST_KIND_VI[r.kind]}
                    {r.lateSubmission && <div><span className="chip bg-amber-100 text-amber-800">Nộp muộn</span></div>}
                    {r.leaveType ? <div>{LEAVE_TYPE_VI[r.leaveType]}{r.leavePaid === false ? " (không lương)" : ""}</div> : null}
                    {r.lateEarlyKind ? <div>{LATE_EARLY_KIND_VI[r.lateEarlyKind]} {r.atTime}</div> : null}
                    {r.className ? <div>{r.className}</div> : null}
                  </td>
                  <td className="p-3 text-xs">
                    {dmy(r.dateFrom)}{r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}{r.portion && r.portion !== "full" ? (r.portion === "am" ? " (sáng)" : " (chiều)") : ""}
                    {r.days ? <div>{units(r.days)} ngày</div> : null}
                    {r.kind === "overtime" && <div>{r.startTime}–{r.endTime} ({r.minutes}′)</div>}
                    {r.kind === "timesheet_fix" && <div>{r.punchIn ? `vào ${r.punchIn} ` : ""}{r.punchOut ? `ra ${r.punchOut}` : ""}</div>}
                    {r.destination && <div>{r.destination}</div>}
                  </td>
                  <td className="p-3 text-xs">
                    <span className="font-mono">{r.effectPreview ?? "—"}</span>
                    {r.targetName && <div className="text-ink-500">{r.targetName}</div>}
                    {r.applyError && <div className="text-red-700">Áp thất bại: {r.applyError}</div>}
                    {r.appliedEffect ? <div className="text-green-700">Đã áp: {(r.appliedEffect as { label?: string }).label}</div> : null}
                  </td>
                  <td className="p-3 text-xs">{r.reason}{r.decisionNote && <div className="text-amber-800">{r.deciderName}: {r.decisionNote}</div>}</td>
                  <td className="p-3 text-xs tabular-nums">{r.status === "pending" ? <span className={r.overdue ? "text-amber-700" : ""}>{r.ageDays} ngày{r.overdue ? ` · quá ${d.slaDays} ngày` : ""}</span> : "—"}</td>
                  <td className="p-3"><RequestChip status={r.status} />{r.deciderName && !r.decisionNote && <div className="text-xs text-ink-400">{r.deciderName}</div>}</td>
                  <td className="p-3">
                    {(r.canDecide || r.canCancel) && (
                      <DecideRequest id={r.id} canDecide={r.canDecide} canCancel={r.canCancel} approved={r.status === "approved"} needsTarget={(r.kind === "sub_teach" || r.kind === "class_change") && !r.targetStaffId} centerId={r.centerId} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
