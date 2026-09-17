import Link from "next/link";
import { REQUEST_KINDS, REQUEST_KIND_VI, REQUEST_STATUSES, REQUEST_STATUS_VI, LEAVE_TYPE_VI, type RequestKind, type RequestStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { RequestChip, dmy, units } from "@/components/hr-ui";
import { DecideRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyệt đơn từ" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const status = REQUEST_STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : undefined;
  const kind = REQUEST_KINDS.includes(sp.kind as RequestKind) ? (sp.kind as RequestKind) : undefined;
  const d = await caller.hr.requests({ status, kind });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Duyệt đơn từ"
        desc={d.isApprover ? "Đơn nghỉ phép, đi muộn / về sớm, làm thêm, quên chấm công của nhân sự trong cơ sở. Người làm đơn không tự duyệt; từ chối cần lý do. Đơn quên chấm công khi duyệt sẽ thêm lượt chấm vào bảng công." : "Đơn của bạn. Làm đơn mới ở mục Của tôi."}
        actions={<Link href="/cham-cong/lich-ca" className="btn-ghost">Của tôi / làm đơn</Link>}
      />
      <div className="flex flex-wrap gap-1 text-xs">
        <Link href={`/don-tu${status ? `?status=${status}` : ""}`} className={`chip ${!kind ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>Mọi loại</Link>
        {REQUEST_KINDS.map((k) => <Link key={k} href={`/don-tu?kind=${k}${status ? `&status=${status}` : ""}`} className={`chip ${kind === k ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>{REQUEST_KIND_VI[k]}</Link>)}
      </div>
      <StatTabs basePath="/don-tu" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...REQUEST_STATUSES.map((s) => ({ key: s, label: REQUEST_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Không có đơn.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Nhân sự</th><th className="p-3">Loại</th><th className="p-3">Thời gian</th><th className="p-3">Lý do</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((r) => (
                <tr key={r.id} className={r.mine ? "bg-brand-50/40" : ""}>
                  <td className="p-3">{r.staffName}{r.mine && <span className="ml-1 text-xs text-brand-700">(tôi)</span>}<div className="text-xs text-ink-400">{r.staffCode} · {r.centerCode}</div></td>
                  <td className="p-3 text-xs">{REQUEST_KIND_VI[r.kind]}{r.leaveType ? <div>{LEAVE_TYPE_VI[r.leaveType]}</div> : null}</td>
                  <td className="p-3 text-xs">
                    {dmy(r.dateFrom)}{r.dateTo !== r.dateFrom ? ` → ${dmy(r.dateTo)}` : ""}{r.portion && r.portion !== "full" ? (r.portion === "am" ? " (sáng)" : " (chiều)") : ""}
                    {r.days ? <div>{units(r.days)} ngày</div> : null}
                    {r.kind === "late_early" && <div>{r.lateMin ? `muộn ${r.lateMin}′ ` : ""}{r.earlyMin ? `sớm ${r.earlyMin}′` : ""}</div>}
                    {r.kind === "overtime" && <div>{r.otStart}–{r.otEnd} ({r.minutes}′)</div>}
                    {r.kind === "missing_punch" && <div>{r.punchIn ? `vào ${r.punchIn} ` : ""}{r.punchOut ? `ra ${r.punchOut}` : ""}</div>}
                  </td>
                  <td className="p-3 text-xs">{r.reason}{r.decisionNote && <div className="text-amber-800">{r.deciderName}: {r.decisionNote}</div>}</td>
                  <td className="p-3"><RequestChip status={r.status} />{r.deciderName && !r.decisionNote && <div className="text-xs text-ink-400">{r.deciderName}</div>}</td>
                  <td className="p-3">{(r.canDecide || r.canCancel) && <DecideRequest id={r.id} canDecide={r.canDecide} canCancel={r.canCancel} approved={r.status === "approved"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
