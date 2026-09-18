import Link from "next/link";
import { hasPermission, ENROLLMENT_STATUS_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { Kpi } from "@/components/report-ui";
import { OrderChip, vnd } from "@/components/finance-ui";
import { CsvButton } from "@/components/csv-button";
import { BackfillTuition } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thiếu học phí" };

export default async function MissingTuitionPage({ searchParams }: { searchParams: Promise<{ center?: string; kind?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "finance:read")) return <NoAccess title="Thiếu học phí" perm="finance:read" />;
  const canCreate = hasPermission(ctx.actor as Actor, "finance:create");
  const kind = sp.kind === "no_order" || sp.kind === "unpaid" ? sp.kind : undefined;
  const [ref, d] = await Promise.all([caller.academics.classes.referenceData(), caller.finance.missingTuition({ centerId: sp.center || undefined, kind })]);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const link = (k?: string) => { const u = new URLSearchParams(); if (sp.center) u.set("center", sp.center); if (k) u.set("kind", k); return `/thieu-hoc-phi${u.toString() ? `?${u}` : ""}`; };
  return (
    <div className="space-y-4">
      <PageHeader title="Thiếu học phí" desc="Học viên đang học / học thử / bảo lưu nhưng chưa lập đơn học phí, hoặc đơn chưa được kế toán xác nhận đủ tiền." />
      <form className="flex gap-2">
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[200px]">
          <option value="">Mọi cơ sở</option>
          {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
        {kind && <input type="hidden" name="kind" value={kind} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="grid grid-cols-3 gap-3">
        <Link href={link("no_order")}><Kpi label="Chưa lập đơn" value={d.totals.noOrder} tone={d.totals.noOrder ? "bad" : "default"} /></Link>
        <Link href={link("unpaid")}><Kpi label="Đơn chưa đóng đủ" value={d.totals.unpaid} tone="warn" /></Link>
        <Link href={link()}><Kpi label="Ước tính còn thiếu" value={vnd(d.totals.amount)} hint="đơn chưa lập tính theo giá gói niêm yết" /></Link>
      </div>
      <div className="flex justify-end">
        <CsvButton filename="thieu-hoc-phi" headers={["Cơ sở", "Lớp", "Mã HV", "Học viên", "Phụ huynh", "Trạng thái học", "Đã học / gói", "Đơn", "Tổng đơn", "Đã thu", "Còn thiếu"]}
          rows={d.items.map((i) => [i.centerCode, i.classCode, i.studentCode, i.studentName, i.parentName, ENROLLMENT_STATUS_VI[i.enrollmentStatus], `${i.consumed}/${i.packageSessions}`, i.order?.code ?? "chưa lập", i.order?.total ?? i.expected, i.order?.confirmed ?? 0, i.outstanding])} />
      </div>
      {d.items.length === 0 ? <Empty>Không có học viên thiếu học phí.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Đã học</th><th className="p-3">Đơn</th><th className="p-3 text-right">Đã thu</th><th className="p-3 text-right">Còn thiếu</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((i) => (
                <tr key={i.enrollmentId} className={i.kind === "no_order" && i.consumed > 0 ? "bg-red-50/40" : ""}>
                  <td className="p-3"><Link href={`/students/${i.studentId}`} className="font-medium text-brand-600">{i.studentName}</Link><div className="text-xs text-ink-400">{i.studentCode} · PH {i.parentName ?? "—"}</div></td>
                  <td className="p-3">{i.classCode}<div className="text-xs text-ink-400">{i.centerCode} · {ENROLLMENT_STATUS_VI[i.enrollmentStatus]}</div></td>
                  <td className="p-3 tabular-nums">{i.consumed}/{i.packageSessions}</td>
                  <td className="p-3">{i.order ? <><Link href={`/orders/${i.order.id}`} className="font-mono text-xs text-brand-600">{i.order.code}</Link> <OrderChip status={i.order.status} /><div className="text-xs text-ink-400">{vnd(i.order.total)} · đã đóng {i.paidRatio}%</div></> : <span className="chip bg-red-100 text-red-700">Chưa lập đơn</span>}</td>
                  <td className="p-3 text-right tabular-nums">{vnd(i.order?.confirmed ?? 0)}{i.order && i.order.pending > 0 && <div className="text-[11px] text-amber-700">+{vnd(i.order.pending)} chờ</div>}</td>
                  <td className="p-3 text-right font-semibold tabular-nums text-red-700">{vnd(i.outstanding)}</td>
                  <td className="p-3">
                    {canCreate && (
                      <div className="space-y-1">
                        <BackfillTuition enrollmentId={i.enrollmentId} studentName={i.studentName} expected={i.expected} hasOrder={!!i.order} maxMore={i.outstanding} today={today} maxDiscountPercent={i.maxDiscountPercent} />
                        {!i.order && <Link href={`/orders/new?enrollmentId=${i.enrollmentId}`} className="block text-xs text-brand-600 hover:underline">Tạo đơn đầy đủ</Link>}
                      </div>
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
