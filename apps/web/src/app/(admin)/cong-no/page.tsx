import Link from "next/link";
import { hasPermission, AGING_BUCKETS, AGING_BUCKET_VI, type Actor, type AgingBucket } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { OrderChip, vnd, fmtD } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Công nợ" };

const BUCKET_CHIP: Record<AgingBucket, string> = { current: "bg-slate-100 text-slate-700", d1_30: "bg-amber-100 text-amber-800", d31_60: "bg-orange-100 text-orange-800", d61_90: "bg-red-100 text-red-700", d90_plus: "bg-red-200 text-red-800" };

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ center?: string; bucket?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Công nợ" perm="finance:read" />;
  const bucket = AGING_BUCKETS.includes(sp.bucket as AgingBucket) ? (sp.bucket as AgingBucket) : undefined;
  const [ref, d] = await Promise.all([caller.academics.classes.referenceData(), caller.finance.debts({ centerId: sp.center || undefined, bucket, q: sp.q || undefined })]);
  const t = d.totals;
  const q = (b?: string) => { const u = new URLSearchParams(); if (sp.center) u.set("center", sp.center); if (sp.q) u.set("q", sp.q); if (b) u.set("bucket", b); return `/cong-no${u.toString() ? `?${u}` : ""}`; };
  return (
    <div className="space-y-4">
      <PageHeader title="Công nợ" desc="Nợ = tổng đơn − khoản kế toán ĐÃ xác nhận (khoản chờ xác nhận hiển thị riêng, không trừ). Tuổi nợ tính theo đợt của kế hoạch thanh toán: đợt quá hạn lâu nhất quyết định nhóm." />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Mã đơn / tên khách…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[180px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        {bucket && <input type="hidden" name="bucket" value={bucket} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Đơn còn nợ" value={t.orders} />
        <Kpi label="Tổng còn phải thu" value={vnd(t.outstanding)} tone="brand" />
        <Kpi label="Trong đó quá hạn" value={vnd(t.overdue)} tone={t.overdue ? "bad" : "default"} />
        <Kpi label="Chờ kế toán xác nhận" value={vnd(t.pending)} tone="warn" />
        <Kpi label="Sắp đến hạn (nhắc)" value={t.dueSoon} hint="theo số ngày nhắc của từng đơn" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={q()} className={`chip ${!bucket ? "bg-brand-500 text-white" : "bg-black/5"}`}>Tất cả</Link>
        {d.buckets.map((b) => <Link key={b.bucket} href={q(b.bucket)} className={`chip ${bucket === b.bucket ? "bg-brand-500 text-white" : BUCKET_CHIP[b.bucket]}`}>{AGING_BUCKET_VI[b.bucket]}: {b.count} · {vnd(b.amount)}</Link>)}
      </div>
      {d.byCenter.length > 1 && (
        <Section title="Theo cơ sở">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Cơ sở</th><th className={th}>Đơn</th><th className={th}>Còn phải thu</th><th className={th}>Quá hạn</th><th className={th}>Chờ xác nhận</th></tr></thead>
            <tbody className="divide-y divide-black/5">{d.byCenter.map((c) => <tr key={c.centerId}><td className="p-3">{c.centerCode}</td><td className={td}>{c.orders}</td><td className={td}>{vnd(c.outstanding)}</td><td className={`${td} text-red-700`}>{vnd(c.overdue)}</td><td className={td}>{vnd(c.pending)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}
      <Section
        title="Chi tiết"
        actions={<CsvButton filename={`cong-no_${d.today}`} headers={["Mã đơn", "Cơ sở", "Khách", "Học viên", "Lớp", "Tổng", "Đã thu", "Chờ xác nhận", "Còn nợ", "Quá hạn (đ)", "Số ngày quá hạn", "Nhóm tuổi nợ", "Đợt tới", "Hạn đợt tới"]}
          rows={d.items.map((i) => [i.code, i.centerCode, i.customerName, i.studentName, i.classCode, i.total, i.confirmed, i.pending, i.outstanding, i.overdueAmount, i.overdueDays, AGING_BUCKET_VI[i.bucket], i.nextDue?.remaining ?? null, i.nextDue?.dueDate ?? null])} />}
      >
        {d.items.length === 0 ? <div className="p-4"><Empty>Không có công nợ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Đơn</th><th className={th}>Khách / học viên</th><th className={`${th} text-right`}>Tổng</th><th className={`${th} text-right`}>Đã thu</th><th className={`${th} text-right`}>Còn nợ</th><th className={th}>Đợt tới</th><th className={th}>Tuổi nợ</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((i) => (
                <tr key={i.id} className={i.overdueDays > 30 ? "bg-red-50/40" : ""}>
                  <td className="p-3"><Link href={`/orders/${i.id}`} className="font-mono text-xs font-semibold text-brand-600">{i.code}</Link><div className="text-xs text-ink-400">{i.centerCode}</div></td>
                  <td className="p-3">{i.customerName}<div className="text-xs text-ink-400">{i.customerPhone}{i.studentName ? ` · ${i.studentName}` : ""}{i.classCode ? ` · ${i.classCode}` : ""}</div></td>
                  <td className="p-3 text-right tabular-nums">{vnd(i.total)}</td>
                  <td className="p-3 text-right tabular-nums text-green-700">{vnd(i.confirmed)}{i.pending > 0 && <div className="text-[11px] text-amber-700">+{vnd(i.pending)} chờ</div>}</td>
                  <td className="p-3 text-right font-semibold tabular-nums text-red-700">{vnd(i.outstanding)}</td>
                  <td className="p-3 text-xs">{i.nextDue ? <>{vnd(i.nextDue.remaining)} · {fmtD(i.nextDue.dueDate)}{i.dueSoon && <span className="chip ml-1 bg-amber-100 text-amber-800">sắp hạn</span>}</> : "—"}</td>
                  <td className="p-3"><span className={`chip ${BUCKET_CHIP[i.bucket]}`}>{i.overdueDays > 0 ? `${i.overdueDays} ngày · ${vnd(i.overdueAmount)}` : AGING_BUCKET_VI[i.bucket]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <p className="text-xs text-ink-400">Trạng thái đơn trong danh sách: <OrderChip status="pending_payment" /> <OrderChip status="partially_paid" /></p>
    </div>
  );
}
