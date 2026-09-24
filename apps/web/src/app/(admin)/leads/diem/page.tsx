import Link from "next/link";
import { hasPermission, LEAD_TEMPS, LEAD_TEMP_VI, LEAD_TEMP_MO_TA, LEAD_TEMP_CHIP, type Actor, type LeadTemp } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm & trạng thái khách" };

/** Bảng này chỉ xếp khách CHƯA ghi danh, nên không có nhóm "đã ghi danh" (vo_dich) */
type TempBan = Exclude<LeadTemp, "vo_dich">;
type View = "tat_ca" | TempBan | "dinh_tre";
const VIEWS: View[] = ["tat_ca", "nong", "am", "lanh", "nguoi", "rui_ro", "ngu_dong", "dinh_tre"];
const NHAN_VIEW: Record<View, string> = {
  tat_ca: "Tất cả",
  ...Object.fromEntries(LEAD_TEMPS.filter((t) => t !== "vo_dich").map((t) => [t, LEAD_TEMP_VI[t]])) as Record<TempBan, string>,
  dinh_tre: "Đình trệ",
};

/**
 * ĐIỂM & TRẠNG THÁI — bảng xếp ai đáng gọi trước.
 * Điểm cộng từ tín hiệu thật (khách nhắn, có SĐT, đã hẹn, đã học thử) và **tụt dần theo ngày im lặng**,
 * nên danh sách "nóng" luôn là người của hôm nay chứ không phải của tháng trước.
 */
export default async function DiemLeadPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "lead:read")) return <NoAccess title="Điểm & trạng thái khách" perm="lead:read" />;
  const view = (VIEWS.includes(sp.view as View) ? sp.view : "tat_ca") as View;
  const d = await caller.admissions.score.table({ view });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Điểm & trạng thái khách"
        desc="Chấm điểm từ tín hiệu thật: khách nhắn bao nhiêu, có số điện thoại chưa, đã hẹn, đã cho bé học thử. Càng lâu im lặng điểm càng tụt — nên danh sách nóng luôn là việc của hôm nay."
        actions={<Link href="/leads" className="btn-ghost">Danh sách lead →</Link>}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {VIEWS.map((v) => (
          <Link key={v} href={`/leads/diem?view=${v}`} title={v === "tat_ca" || v === "dinh_tre" ? undefined : LEAD_TEMP_MO_TA[v as TempBan]}
            className={`chip ${view === v ? "bg-brand-600 text-white" : v === "dinh_tre" ? "bg-orange-100 text-orange-800" : v === "tat_ca" ? "bg-slate-100" : LEAD_TEMP_CHIP[v as TempBan]}`}>
            {NHAN_VIEW[v]} {v === "tat_ca" ? d.tong : v === "dinh_tre" ? d.dem.dinh_tre : d.dem[v as TempBan]}
          </Link>
        ))}
      </div>

      <section className="card overflow-x-auto">
        {d.items.length === 0 ? (
          <div className="p-6"><Empty>Không có khách nào trong nhóm này.</Empty></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="p-3">Điểm</th><th className="p-3">Khách</th><th className="p-3">Vì sao có điểm này</th>
                <th className="p-3">Im lặng</th><th className="p-3">Bậc phễu</th><th className="p-3">Phụ trách</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((r) => (
                <tr key={r.id} className={r.dinhTre ? "bg-orange-50/50" : undefined}>
                  <td className="p-3">
                    <div className="text-lg font-semibold tabular-nums">{r.diem}</div>
                    <span className={`chip ${LEAD_TEMP_CHIP[r.temp as LeadTemp]}`}>{r.tempLabel}</span>
                  </td>
                  <td className="p-3">
                    <Link href={`/leads/${r.id}`} className="font-medium text-brand-600">{r.ten}</Link>
                    <div className="text-[11px] text-ink-400">
                      {r.soTinKhachGui} tin khách · {r.soCuocHen} hẹn{r.daHocThu ? " · đã học thử" : ""}
                    </div>
                  </td>
                  <td className="p-3 text-[11px] text-ink-600">
                    {r.lyDo.length === 0 ? "—" : r.lyDo.map((l, i) => (
                      <span key={i} className="mr-2 whitespace-nowrap">
                        {l.khoan} <b className={l.diem < 0 ? "text-red-700" : "text-green-700"}>{l.diem > 0 ? `+${l.diem}` : l.diem}</b>
                      </span>
                    ))}
                  </td>
                  <td className="p-3 text-xs tabular-nums">{r.imLangNgay} ngày</td>
                  <td className="p-3 text-xs">
                    {r.statusLabel}
                    {r.dinhTre && <div className="text-[11px] font-semibold text-orange-700">Đình trệ {r.dinhTreNgay}/{r.dinhTreNguong} ngày</div>}
                  </td>
                  <td className="p-3 text-xs">{r.nguoiPhuTrach ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
