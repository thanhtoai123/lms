import Link from "next/link";
import { hasPermission, COMMISSION_STATUSES, COMMISSION_STATUS_VI, COMMISSION_KIND_VI, type Actor, type CommissionStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { CommissionTable, RulesPanel, AccrueMissing } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoa hồng" };

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ status?: string; period?: string; q?: string; tab?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Hoa hồng" perm="finance:read" />;
  const status = COMMISSION_STATUSES.includes(sp.status as CommissionStatus) ? (sp.status as CommissionStatus) : undefined;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period : undefined;
  if (sp.tab === "rules") {
    const rules = await caller.finance.commissionRules();
    const refs = await caller.academics.classes.referenceData();
    const configure = hasPermission(ctx.actor as Actor, "finance:configure");
    return (
      <div className="space-y-4">
        <PageHeader title="Hoa hồng — quy tắc" desc="Quy tắc riêng cơ sở ưu tiên hơn quy tắc dùng chung. Quy tắc đã dùng để tính thì không sửa mức — đặt ngày kết thúc và tạo quy tắc mới." actions={<Link href="/crm/commission" className="btn-ghost">← Danh sách hoa hồng</Link>} />
        <RulesPanel rules={rules} centers={refs.centers.map((c) => ({ id: c.id, code: c.code }))} canConfigure={configure} />
      </div>
    );
  }
  const d = await caller.finance.commissions({ status, period, q: sp.q || undefined });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Hoa hồng"
        desc={d.ownOnly
          ? "Hoa hồng của bạn: tạm tính khi đơn thu đủ → quản lý duyệt → kế toán chi. Đơn hoàn tiền sẽ giảm / thu hồi tương ứng."
          : "Tạm tính tự động khi đơn thu đủ (sale phụ trách lead, người giới thiệu). Quản lý duyệt → kế toán chi (người duyệt không tự chi). Hoàn tiền: chưa chi thì giảm, đã chi thì tạo dòng thu hồi trừ vào kỳ sau."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/crm/commission?tab=rules" className="btn-ghost">Quy tắc</Link>
            {!d.ownOnly && <AccrueMissing />}
            <CsvButton filename={`hoa-hong-${period ?? "tat-ca"}`} headers={["Kỳ", "Người hưởng", "Loại", "Đơn", "Học viên", "Cơ sở", "Giá trị tính", "Mức", "Hoa hồng", "Trạng thái", "Mã chi"]} rows={d.items.map((i) => [i.period, i.beneficiaryName, COMMISSION_KIND_VI[i.kind], i.orderCode, i.studentName ?? i.customerName, i.centerCode, i.baseAmount, i.rateLabel, i.amount, COMMISSION_STATUS_VI[i.status], i.payoutRef])} />
          </div>
        }
      />
      <form className="flex flex-wrap items-end gap-2" action="/crm/commission">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="text-xs text-ink-600">Kỳ
          <select name="period" defaultValue={period ?? ""} className="input mt-1">
            <option value="">Tất cả</option>
            {d.periods.map((p) => <option key={p} value={p}>{p.split("-").reverse().join("/")}</option>)}
          </select>
        </label>
        {!d.ownOnly && <input name="q" defaultValue={sp.q} placeholder="Người hưởng, mã đơn…" className="input w-56" />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-3"><div className="text-xs text-ink-400">Tạm tính</div><b className="text-lg tabular-nums">{vnd(d.totals.accrued)}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Đã duyệt — chờ chi</div><b className="text-lg tabular-nums text-sky-700">{vnd(d.totals.approved)}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Đã chi</div><b className="text-lg tabular-nums text-green-700">{vnd(d.totals.paid)}</b></div>
      </div>
      {!d.ownOnly && d.byBeneficiary.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Người hưởng</th><th className="p-3 text-right">Số dòng</th><th className="p-3 text-right">Tạm tính</th><th className="p-3 text-right">Chờ chi</th><th className="p-3 text-right">Đã chi</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byBeneficiary.map((g) => (
                <tr key={g.key}><td className="p-3">{g.name}<div className="text-xs text-ink-400">{COMMISSION_KIND_VI[g.kind]}</div></td><td className="p-3 text-right">{g.count}</td><td className="p-3 text-right tabular-nums">{vnd(g.accrued)}</td><td className="p-3 text-right tabular-nums">{vnd(g.approved)}</td><td className="p-3 text-right tabular-nums">{vnd(g.paid)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <StatTabs basePath="/crm/commission" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...COMMISSION_STATUSES.map((s) => ({ key: s, label: COMMISSION_STATUS_VI[s], count: d.counts?.[s] }))]} />
      {d.items.length === 0 ? <Empty>Chưa có hoa hồng.</Empty> : <CommissionTable items={d.items} />}
    </div>
  );
}
