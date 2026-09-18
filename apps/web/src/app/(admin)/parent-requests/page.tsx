import Link from "next/link";
import { hasPermission, PARENT_REQUEST_TYPES, PARENT_REQUEST_TYPE_VI, CONTACT_CHANNEL_VI, type Actor, type ParentRequestType, type ParentRequestStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { PReqChip, SlaBadge, dtVN } from "@/components/care-ui";
import { NewParentRequest } from "./new-request";
import { RememberFilters } from "@/components/remember-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu phụ huynh" };

const TABS = ["open", "overdue", "new", "in_progress", "approved", "done", "rejected", "cancelled"] as const;
const LABEL: Record<(typeof TABS)[number], string> = { open: "Đang mở", overdue: "Quá hạn", new: "Mới", in_progress: "Đang xử lý", approved: "Đã duyệt", done: "Hoàn tất", rejected: "Từ chối", cancelled: "Đã huỷ" };

export default async function ParentRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; q?: string; mine?: string; student?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Yêu cầu phụ huynh" perm="care:read" />;
  const status = (TABS as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof TABS)[number]) : sp.status === "all" ? undefined : "open";
  const type = PARENT_REQUEST_TYPES.includes(sp.type as ParentRequestType) ? (sp.type as ParentRequestType) : undefined;
  const d = await caller.care.requests({ status: status as ParentRequestStatus | "open" | "overdue" | undefined, type, q: sp.q || undefined, mine: sp.mine === "1" });
  return (
    <div className="space-y-4">
      <RememberFilters storageKey="parent-requests" ignore={["page"]} />
      <PageHeader title="Yêu cầu phụ huynh" desc="Ghi nhận yêu cầu từ Zalo / điện thoại / tại quầy: xin nghỉ, bảo lưu, đổi lịch, học bù, hoàn phí, góp ý. Mỗi loại có hạn xử lý; duyệt xin nghỉ sẽ ghi sẵn 'vắng có phép' cho giáo viên, duyệt học bù tạo yêu cầu xếp buổi." />
      {d.canCreate && <NewParentRequest />}
      <form className="flex flex-wrap items-end gap-2" action="/parent-requests">
        <input type="hidden" name="status" value={status ?? "all"} />
        <input name="q" defaultValue={sp.q} placeholder="Mã, học viên, phụ huynh, nội dung…" className="input w-64" />
        <select name="type" defaultValue={type ?? ""} className="input w-auto"><option value="">Mọi loại</option>{PARENT_REQUEST_TYPES.map((t) => <option key={t} value={t}>{PARENT_REQUEST_TYPE_VI[t]}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Giao cho tôi</label>
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/parent-requests" params={sp} active={status ?? "all"} tabs={[...TABS.map((t) => ({ key: t, label: LABEL[t], count: d.counts?.[t] })), { key: "all", label: "Tất cả" }]} />
      {d.items.length === 0 ? <Empty>Không có yêu cầu.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Yêu cầu</th><th className="p-3">Học viên / PH</th><th className="p-3">Nội dung</th><th className="p-3">Phụ trách</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {d.items.map((r) => (
                <tr key={r.id} className={r.sla.overdue ? "bg-red-50/50" : ""}>
                  <td className="p-3"><Link href={`/parent-requests/${r.id}`} className="font-mono text-xs text-brand-700">{r.code}</Link><div className="font-medium">{PARENT_REQUEST_TYPE_VI[r.type]}</div><div className="text-xs text-ink-400">{CONTACT_CHANNEL_VI[r.channel]} · {dtVN(r.createdAt)}</div></td>
                  <td className="p-3">{r.studentName}<div className="text-xs text-ink-400">{r.classCode ?? r.centerCode}{r.parentName ? ` · PH ${r.parentName}` : ""}</div></td>
                  <td className="p-3 text-xs"><div className="line-clamp-2 max-w-sm">{r.content}</div>{r.sessionDate && <div className="text-ink-600">Buổi {r.sessionDate.split("-").reverse().join("/")}</div>}{r.dateFrom && <div className="text-ink-600">{r.dateFrom.split("-").reverse().join("/")} → {r.dateTo?.split("-").reverse().join("/")}</div>}</td>
                  <td className="p-3 text-xs">{r.assigneeName ?? <span className="text-amber-700">Chưa giao</span>}</td>
                  <td className="p-3"><PReqChip status={r.status} /><div className="mt-1"><SlaBadge sla={r.sla} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
