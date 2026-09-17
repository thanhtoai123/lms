import { getServerCaller } from "@/lib/trpc/server";
import { Empty } from "@/components/ui";
import { StaleLeadsTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead lâu ngày chưa chăm" };

export default async function StalePage({ searchParams }: { searchParams: Promise<{ days?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const [{ items, days }, assignees] = await Promise.all([
    caller.admissions.leads.stale({ sinceDays: sp.days ? Number(sp.days) : undefined, centerId: sp.center || null }),
    caller.admissions.leads.assigneeOptions({ centerId: sp.center || null }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lead lâu ngày chưa chăm</h1>
        <p className="text-sm text-ink-600">Lead còn mở nhưng không ai chạm từ {days} ngày trở lên. Chọn nhiều dòng để phân bổ lại kèm lý do — lead đã chốt được bỏ qua.</p>
      </div>
      <form className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Không ai chăm từ</label>
        <input name="days" type="number" min={7} max={730} className="input !w-24" defaultValue={days} />
        <span className="text-sm">ngày</span>
        <select name="center" className="input max-w-xs" defaultValue={sp.center ?? ""}>
          <option value="">Mọi cơ sở (kể cả Hội sở)</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <button className="btn-ghost">Lọc lại</button>
        <span className="text-sm text-ink-600">Tìm thấy {items.length} lead</span>
      </form>
      {items.length === 0 ? <Empty>Không có lead nào bị bỏ quên. Tốt!</Empty> : (
        <StaleLeadsTable
          days={days}
          items={items.map((l) => ({ id: l.id, parentName: l.parentName, phone: l.phone, status: l.status, centerCode: l.centerCode, assigneeName: l.assigneeName, silentDays: l.silentDays, lastTouchAt: l.lastTouchAt.toISOString(), canReassign: l.canReassign }))}
          assignees={[...new Map(assignees.map((a) => [a.id, { id: a.id, fullName: a.fullName }] as const)).values()]}
        />
      )}
    </div>
  );
}
