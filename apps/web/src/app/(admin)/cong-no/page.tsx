import Link from "next/link";
import { hasPermission, DEBT_CHIPS, DEBT_CHIP_VI, ENROLLMENT_STATUS_VI, type Actor, type DebtChip } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { DebtChipView, vnd, fmtD } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { EditEnrollmentFee } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Công nợ" };

const AGE_CLS: Record<string, string> = { current: "bg-slate-100 text-slate-700", b1: "bg-amber-100 text-amber-800", b2: "bg-orange-100 text-orange-800", b3: "bg-red-200 text-red-800" };

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ center?: string; chip?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Công nợ" perm="finance:read" />;
  const chip = DEBT_CHIPS.includes(sp.chip as DebtChip) ? (sp.chip as DebtChip) : undefined;
  const [ref, d] = await Promise.all([
    caller.academics.classes.referenceData(),
    caller.finance.enrollmentDebts({ centerId: sp.center || undefined, chip, q: sp.q || undefined }),
  ]);
  const t = d.totals;
  const q = (c?: string) => { const u = new URLSearchParams(); if (sp.center) u.set("center", sp.center); if (sp.q) u.set("q", sp.q); if (c) u.set("chip", c); return `/cong-no${u.toString() ? `?${u}` : ""}`; };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Công nợ"
        desc="Nợ học phí theo từng ghi danh. “Thiếu — PH đang thấy” là con số thật hiện trên cổng phụ huynh (chỉ giảm khi kế toán xác nhận); “Thiếu thật” đã trừ khoản sale đã thu đang chờ kế toán. Ô tuổi nợ tính theo đợt thanh toán có hạn — hai phạm vi khác nhau."
      />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tìm học viên hoặc khoá…" className="input max-w-xs" />
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[180px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        {chip && <input type="hidden" name="chip" value={chip} />}
        <button className="btn-ghost">Lọc</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Tổng nợ (đăng ký)" value={vnd(t.outstanding)} tone="brand" hint="học phí − khoản kế toán ĐÃ xác nhận" />
        {d.buckets.map((b) => <Kpi key={b.bucket} label={b.label} value={vnd(b.amount)} tone={b.bucket === "b3" ? "bad" : b.bucket === "current" ? "default" : "warn"} hint={`${b.count} ghi danh`} />)}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={q()} className={`chip ${!chip ? "bg-brand-500 text-white" : "bg-black/5"}`}>Tất cả</Link>
        {d.chips.map((c) => (
          <Link key={c.chip} href={q(c.chip)} className={`chip ${chip === c.chip ? "bg-brand-500 text-white" : "bg-black/5"}`}>
            {DEBT_CHIP_VI[c.chip]}: {c.count}{c.amount > 0 ? ` · ${vnd(c.amount)}` : ""}
          </Link>
        ))}
      </div>

      {t.noFee > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{t.noFee} em chưa chốt học phí.</b> Hệ thống không biết các em phải đóng bao nhiêu, nên cổng phụ huynh không hiện nợ —
          {" "}<Link href={q("no_fee")} className="font-semibold underline">Xem {t.noFee} em</Link>.
        </div>
      )}

      <Section
        title="Chi tiết theo ghi danh"
        actions={<CsvButton filename={`cong-no_${d.today}`} headers={["Học viên", "Mã HV", "Lớp", "Khoá", "Cơ sở", "Phải đóng", "Đã thu", "Kế toán xác nhận", "Thiếu — PH đang thấy", "Thiếu thật", "Trạng thái", "Số ngày quá hạn", "Đơn"]}
          rows={d.items.map((i) => [i.studentName, i.studentCode, i.classCode, i.courseCode, i.centerCode, i.total, i.confirmed + i.recorded, i.confirmed, i.shortParent, i.shortReal, DEBT_CHIP_VI[i.chip], i.overdueDays, i.order?.code ?? "chưa có đơn"])} />}
      >
        {d.items.length === 0 ? <div className="p-4"><Empty>Không có công nợ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Học viên</th><th className={`${th} text-right`}>Phải đóng</th><th className={`${th} text-right`}>Đã thu</th><th className={`${th} text-right`}>Kế toán xác nhận</th><th className={`${th} text-right`}>Thiếu — PH đang thấy</th><th className={`${th} text-right`}>Thiếu thật</th><th className={th}>Trạng thái</th><th className={th}>Thao tác</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((i) => (
                <tr key={i.enrollmentId} className={i.ageBucket === "b3" ? "bg-red-50/40" : ""}>
                  <td className="p-3">
                    <Link href={`/students/${i.studentId}`} className="font-medium text-brand-600">{i.studentName}</Link>
                    <div className="text-xs text-ink-400">{i.classCode} · {i.courseCode} · {i.centerCode} · {ENROLLMENT_STATUS_VI[i.enrollmentStatus]}</div>
                    {i.order && <Link href={`/orders/${i.order.id}`} className="font-mono text-[11px] text-brand-600">{i.order.code}</Link>}
                  </td>
                  <td className={`${td} text-right`}>{i.hasFee ? vnd(i.total) : <span className="text-ink-400">chưa chốt</span>}</td>
                  <td className={`${td} text-right text-green-700`}>{vnd(i.confirmed + i.recorded)}</td>
                  <td className={`${td} text-right`}>{vnd(i.confirmed)}{i.recorded > 0 && <div className="text-[11px] text-amber-700">{vnd(i.recorded)} chờ xác nhận</div>}</td>
                  <td className={`${td} text-right font-semibold text-red-700`}>{vnd(i.shortParent)}</td>
                  <td className={`${td} text-right`}>{vnd(i.shortReal)}</td>
                  <td className="p-3">
                    <DebtChipView chip={i.chip} />
                    {i.nextDue && <div className={`chip mt-1 ${AGE_CLS[i.ageBucket] ?? ""}`}>{i.overdueDays > 0 ? `Quá hạn ${i.overdueDays} ngày` : `Đợt tới ${fmtD(i.nextDue.dueDate)}`}</div>}
                  </td>
                  <td className="p-3 text-xs">
                    <div className="space-y-1">
                      {i.canEditFee && i.order && <EditEnrollmentFee enrollmentId={i.enrollmentId} current={i.total} studentName={i.studentName} />}
                      {i.recorded > 0 && <Link href={`/payments?status=recorded&q=${encodeURIComponent(i.studentName)}`} className="block text-brand-600 hover:underline">Xác nhận {vnd(i.recorded)}</Link>}
                      {!i.hasFee && <Link href={`/thieu-hoc-phi?kind=no_order`} className="block text-brand-600 hover:underline">Ghi học phí</Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
