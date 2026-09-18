import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { TRIAL_STATUSES, TRIAL_STATUS_VI, type TrialStatus } from "@satarobo/core";
import { TrialBoard } from "../board";
import { BookTrial } from "../book";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học thử buổi lẻ" };

type SP = { from?: string; to?: string; center?: string; status?: string; q?: string; mine?: string; lead?: string };

export default async function TrialBookingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = TRIAL_STATUSES.includes(sp.status as TrialStatus) ? (sp.status as TrialStatus) : undefined;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "lead:read")) return <NoAccess title="Học thử buổi lẻ" perm="lead:read" />;
  const [ref, data] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.admissions.trials.list({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined, status, q: sp.q || undefined, mine: sp.mine === "1" || undefined }),
  ]);
  const s = data.stats;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Học thử buổi lẻ (lớp chính quy)"
        desc="Xếp khách vào một buổi của lớp chính quy để học thử. Đổi lịch / huỷ phải ghi lý do và giáo viên được báo; kết quả buổi thử tự cập nhật trạng thái lead và tạo việc gọi chốt."
        actions={<Link href="/lop-trial" className="btn-ghost">← Lớp trải nghiệm</Link>}
      />
      <BookTrial centers={ref.centers} courses={ref.courses} initialLeadId={sp.lead} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-4"><div className="text-xs text-ink-400">Sắp diễn ra</div><div className="text-2xl font-bold text-brand-600">{s.upcoming}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Chưa ghi kết quả</div><div className={`text-2xl font-bold ${s.needsResult ? "text-red-700" : ""}`}>{s.needsResult}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Đã học thử</div><div className="text-2xl font-bold text-green-700">{s.attended}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Không đến</div><div className="text-2xl font-bold text-red-700">{s.noShow}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Huỷ / đổi lịch</div><div className="text-2xl font-bold">{s.cancelled} / {s.rescheduled}</div></div>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Từ ngày<input type="date" name="from" defaultValue={data.from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Đến ngày<input type="date" name="to" defaultValue={data.to} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Cơ sở
          <select name="center" defaultValue={sp.center ?? ""} className="input mt-1 !py-1.5">
            <option value="">Mọi cơ sở</option>
            {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Tìm<input name="q" defaultValue={sp.q} placeholder="PH / bé / SĐT / mã lớp" className="input mt-1 !py-1.5" /></label>
        {status && <input type="hidden" name="status" value={status} />}
        <label className="flex items-center gap-1 pb-2 text-xs text-ink-600"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Lead của tôi</label>
        <button className="btn-ghost !py-1.5">Lọc</button>
      </form>
      <StatTabs
        basePath="/lop-trial/buoi-le"
        params={sp}
        active={status ?? ""}
        tabs={[{ key: "", label: "Tất cả" }, ...TRIAL_STATUSES.map((k) => ({ key: k, label: TRIAL_STATUS_VI[k] }))]}
      />
      <TrialBoard items={data.items} today={data.today} centers={ref.centers} />
    </div>
  );
}
