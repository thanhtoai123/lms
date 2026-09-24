import Link from "next/link";
import { hasPermission, APPOINTMENT_STATUS_VI, type Actor, type AppointmentStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { LichHenForm, DoiTrangThai } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch hẹn" };

const VIEWS = [
  { key: "sap_toi", label: "24 giờ tới" },
  { key: "qua_han", label: "Quá hạn" },
  { key: "hom_nay", label: "Hôm nay" },
  { key: "cua_toi", label: "Của tôi" },
  { key: "tat_ca", label: "Tất cả" },
] as const;

/**
 * LỊCH HẸN — chỗ ghi mọi cuộc hẹn của tư vấn viên: gọi lại, hẹn tư vấn, hẹn học thử.
 * Hẹn mà quên là mất khách, nên "Quá hạn" luôn đứng đầu và có màu đỏ.
 */
export default async function LichHenPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "lead:read")) return <NoAccess title="Lịch hẹn" perm="lead:read" />;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? "sap_toi") as "sap_toi" | "qua_han" | "hom_nay" | "cua_toi" | "tat_ca";
  const d = await caller.admissions.appointments.list({ view, q: sp.q || undefined });
  const canEdit = hasPermission(actor, "lead:update");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch hẹn"
        desc="Gọi lại, hẹn tư vấn, hẹn học thử — mọi cuộc hẹn với khách nằm một chỗ. Quá giờ mà chưa xử lý sẽ hiện đỏ ở đây và cạnh hộp thư."
        actions={canEdit ? <LichHenForm /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Quá hạn" value={d.dem.quaHan} tone={d.dem.quaHan ? "bad" : "good"} hint="Đã qua giờ hẹn mà chưa đánh dấu xong / huỷ" />
        <Kpi label="24 giờ tới" value={d.dem.sapToi} tone={d.dem.sapToi ? "warn" : "default"} />
        <Kpi label="Hôm nay" value={d.dem.homNay} />
        <Kpi label="Của tôi (chưa xong)" value={d.dem.cuaToi} tone="brand" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/lich-hen?view=${v.key}`} className={`chip ${view === v.key ? "bg-brand-600 text-white" : "bg-slate-100"}`}>{v.label}</Link>
        ))}
        <form className="ml-auto flex gap-1" action="/lich-hen">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={sp.q} placeholder="Tìm nội dung hẹn…" className="input !w-52 !py-1 !text-xs" />
          <button className="btn-ghost !py-1 !text-xs">Tìm</button>
        </form>
      </div>

      <section className="card overflow-x-auto">
        {d.items.length === 0 ? (
          <div className="p-6"><Empty>Không có lịch hẹn nào trong mục này.</Empty></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr><th className="p-3">Thời điểm</th><th className="p-3">Nội dung</th><th className="p-3">Khách</th><th className="p-3">Phụ trách</th><th className="p-3">Trạng thái</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((h) => (
                <tr key={h.id} className={h.nhan.key === "qua_han" ? "bg-red-50/60" : undefined}>
                  <td className="whitespace-nowrap p-3">
                    <div className="font-medium">{dtVN(h.at)}</div>
                    <div className={`text-[11px] ${h.nhan.gap ? "font-semibold text-red-700" : "text-ink-400"}`}>{h.nhan.label} · {h.durationMin}′</div>
                  </td>
                  <td className="p-3">
                    <div>{h.title}</div>
                    <div className="text-[11px] text-ink-400">{h.kindLabel}{h.note ? ` · ${h.note.split("\n")[0]}` : ""}</div>
                  </td>
                  <td className="p-3 text-xs">
                    {h.leadId ? <Link href={`/leads/${h.leadId}`} className="text-brand-600">{h.leadTen ?? "Lead"}</Link> : "—"}
                    {h.conversationId && <Link href={`/tin-nhan?id=${h.conversationId}`} className="ml-2 text-brand-600">hội thoại →</Link>}
                  </td>
                  <td className="p-3 text-xs">{h.nguoiPhuTrach ?? "—"}</td>
                  <td className="p-3 text-xs">
                    <span className={`chip ${h.status === "dat" ? "bg-slate-100" : h.status === "xong" ? "bg-green-100 text-green-800" : h.status === "vang" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-ink-400"}`}>
                      {APPOINTMENT_STATUS_VI[h.status as AppointmentStatus]}
                    </span>
                  </td>
                  <td className="p-3 text-right">{canEdit && h.status === "dat" && <DoiTrangThai id={h.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
