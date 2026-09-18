import Link from "next/link";
import { hasPermission, SURVEY_TRIGGER_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { SurveyChip } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát / NPS" };

export default async function SurveysPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Khảo sát / NPS" perm="care:read" />;
  const d = await caller.care.surveys();
  const all = d.items.flatMap((s) => (s.nps.count ? [s.nps] : []));
  const tot = all.reduce((a, n) => ({ p: a.p + n.promoters, d: a.d + n.detractors, c: a.c + n.count }), { p: 0, d: 0, c: 0 });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Khảo sát / NPS"
        desc="Phụ huynh nhận liên kết khảo sát (không cần đăng nhập, hết hạn sau 14 ngày). NPS = % giới thiệu (9–10) − % không hài lòng (0–6). Điểm 0–6 tự tạo việc chăm sóc. Khảo sát theo mốc (sau buổi N, hoàn thành khoá) được gửi tự động."
        actions={<>
          <Link href="/evaluations" className="btn-ghost">Đánh giá &amp; Khảo sát v2 →</Link>
          {d.canCreate && <Link href="/khao-sat/new" className="btn-primary">+ Tạo khảo sát</Link>}
        </>}
      />
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        NPS bên dưới là bản cũ, đang được thay dần bằng <Link href="/evaluations" className="font-semibold underline">Đánh giá &amp; Khảo sát v2</Link> (trình dựng phiếu, nhóm tiêu chí, đợt mở–đóng–lưu trữ). Khảo sát đang chạy vẫn nhận phản hồi bình thường.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-3"><div className="text-xs text-ink-400">NPS tổng</div><b className="text-2xl">{tot.c ? Math.round(((tot.p - tot.d) / tot.c) * 100) : "—"}</b><span className="text-xs text-ink-400"> · {tot.c} phản hồi</span></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Giới thiệu / Không hài lòng</div><b className="text-2xl text-green-700">{tot.p}</b> / <b className="text-2xl text-red-700">{tot.d}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Khảo sát đang chạy</div><b className="text-2xl">{d.items.filter((s) => s.status === "active").length}</b></div>
      </div>
      {d.items.length === 0 ? <Empty>Chưa có khảo sát.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Khảo sát</th><th className="p-3">Gửi khi</th><th className="p-3">Phạm vi</th><th className="p-3 text-right">Đã gửi</th><th className="p-3 text-right">Trả lời</th><th className="p-3 text-right">NPS</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((s) => (
                <tr key={s.id}>
                  <td className="p-3"><Link href={`/khao-sat/${s.id}`} className="font-medium text-brand-700">{s.title}</Link><div className="text-xs text-ink-400">{s.questions.length} câu hỏi</div></td>
                  <td className="p-3 text-xs">{SURVEY_TRIGGER_VI[s.trigger]}{s.trigger === "session_n" ? ` (${s.triggerValue})` : ""}</td>
                  <td className="p-3 text-xs">{s.centerCode ?? "Toàn hệ thống"}</td>
                  <td className="p-3 text-right tabular-nums">{s.sent}</td>
                  <td className="p-3 text-right tabular-nums">{s.answered}{s.rate != null ? <span className="text-xs text-ink-400"> ({s.rate}%)</span> : ""}</td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${s.nps.nps == null ? "" : s.nps.nps >= 30 ? "text-green-700" : s.nps.nps < 0 ? "text-red-700" : "text-amber-700"}`}>{s.nps.nps ?? "—"}</td>
                  <td className="p-3"><SurveyChip status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
