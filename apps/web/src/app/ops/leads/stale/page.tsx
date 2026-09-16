import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { LeadChip, LeadSubnav, fmtDateTime } from "@/components/lead-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StalePage({ searchParams }: { searchParams: Promise<{ days?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const { items, days } = await caller.admissions.leads.stale({ sinceDays: sp.days ? Number(sp.days) : undefined, centerId: sp.center || null });
  return (
    <div className="space-y-4">
      <LeadSubnav active="/ops/leads/stale" />
      <div>
        <h1 className="text-2xl font-bold">Lead lâu ngày chưa chăm</h1>
        <p className="text-sm text-ink-600">Lead còn mở nhưng không ai chạm từ {days} ngày trở lên. Bàn giao hoặc chia lại ở trang "Bàn giao" / "Chia lead".</p>
      </div>
      <form className="flex flex-wrap gap-2 items-center">
        <label className="text-sm">Không ai chăm từ</label>
        <input name="days" type="number" min={1} className="input !w-24" defaultValue={days} />
        <span className="text-sm">ngày</span>
        <select name="center" className="input max-w-xs" defaultValue={sp.center ?? ""}><option value="">Mọi cơ sở (kể cả Hội sở)</option>{ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {items.length === 0 ? <Empty>Không có lead nào bị bỏ quên. Tốt!</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Phụ huynh</th><th className="p-3">SĐT</th><th className="p-3">Trạng thái</th><th className="p-3">Cơ sở</th><th className="p-3">Đang giữ</th><th className="p-3">Im bao lâu</th><th className="p-3">Chạm cuối</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {items.map((l) => (
                <tr key={l.id} className={l.silentDays >= days * 2 ? "bg-red-50/50" : ""}>
                  <td className="p-3"><Link href={`/ops/leads/${l.id}`} className="font-medium text-brand-700">{l.parentName}</Link></td>
                  <td className="p-3 font-mono text-xs">{l.phone}</td>
                  <td className="p-3"><LeadChip status={l.status} /></td>
                  <td className="p-3">{l.centerCode ?? "HO"}</td>
                  <td className="p-3">{l.assigneeName ?? <span className="text-ink-400">Chưa phân</span>}</td>
                  <td className="p-3 font-bold text-red-700">{l.silentDays} ngày</td>
                  <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(l.lastTouchAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
