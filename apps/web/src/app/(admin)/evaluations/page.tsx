import Link from "next/link";
import { hasPermission, EVAL_FORM_TYPE_VI, EVAL_ROUND_STATUS_VI, SURVEY_TRIGGER_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { SurveyChip } from "@/components/care-ui";
import { Empty } from "@/components/ui";
import { EvalWorkbench } from "./workbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đánh giá & Khảo sát" };

/**
 * Đánh giá & Khảo sát v2 — trình dựng phiếu + đợt khảo sát.
 * NPS cũ vẫn hiển thị bên dưới và đang được thay dần (giữ nguyên như bản gốc).
 */
export default async function EvaluationsPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Đánh giá & Khảo sát" perm="care:read" />;
  const [d, nps, ref] = await Promise.all([
    caller.care.evaluations(),
    caller.care.surveys(),
    caller.academics.classes.referenceData(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đánh giá & Khảo sát"
        desc="Dựng phiếu bằng 5 loại câu hỏi (chấm sao 1–5, một lựa chọn, nhiều lựa chọn, nhập văn bản, tải ảnh), gắn nhóm tiêu chí cho từng câu, rồi mở đợt khảo sát theo phạm vi cơ sở và thời gian. Câu “Tải ảnh” chỉ dùng cho phiếu Đánh giá buổi học."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Phiếu đánh giá" value={d.stats.forms} />
        <Stat label="Đợt đang mở" value={d.stats.openRounds} tone={d.stats.openRounds ? "ok" : undefined} />
        <Stat label="Lượt trả lời" value={d.stats.responses} />
        <Stat label="Điểm sao trung bình" value={d.stats.avgRating ?? "—"} />
      </div>

      <EvalWorkbench
        forms={d.forms.items.map((f) => ({
          id: f.id, title: f.title, description: f.description, type: f.type, typeLabel: f.typeLabel, centerId: f.centerId, centerCode: f.centerCode,
          isActive: f.isActive, questionCount: f.questionCount, roundCount: f.roundCount, responseCount: f.responseCount, canEdit: f.canEdit,
        }))}
        rounds={d.rounds.items.map((r) => ({
          id: r.id, title: r.title, formId: r.formId, formTitle: r.formTitle, formTypeLabel: r.formTypeLabel, centerId: r.centerId, centerCode: r.centerCode,
          startDate: r.startDate, endDate: r.endDate, status: r.status, statusLabel: r.statusLabel, responses: r.responses, avgRating: r.avgRating,
          running: r.running, canEdit: r.canEdit,
        }))}
        centers={ref.centers}
        canCreateForm={d.forms.canCreate}
        canCreateRound={d.rounds.canCreate}
        canCreateGlobal={d.forms.canCreateGlobal}
      />

      {/* NPS cũ — giữ nguyên, đang được thay dần */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold">Khảo sát / NPS (bản cũ)</h2>
          <Link href="/khao-sat" className="text-sm text-brand-600 hover:underline">Mở trang NPS →</Link>
        </div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          NPS bên dưới là bản cũ, đang được thay dần bằng Đánh giá &amp; Khảo sát v2 ở trên. Khảo sát NPS đang chạy vẫn nhận phản hồi bình thường.
        </p>
        {nps.items.length === 0 ? <Empty>Chưa có khảo sát NPS nào.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-3">Khảo sát</th><th className="p-3">Gửi khi</th><th className="p-3">Phạm vi</th><th className="p-3 text-right">Đã gửi</th><th className="p-3 text-right">Trả lời</th><th className="p-3 text-right">NPS</th><th className="p-3">Trạng thái</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {nps.items.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3"><Link href={`/khao-sat/${s.id}`} className="font-medium text-brand-700">{s.title}</Link><div className="text-xs text-ink-400">{s.questions.length} câu hỏi</div></td>
                    <td className="p-3 text-xs">{SURVEY_TRIGGER_VI[s.trigger]}{s.trigger === "session_n" ? ` (${s.triggerValue})` : ""}</td>
                    <td className="p-3 text-xs">{s.centerCode ?? "Toàn hệ thống"}</td>
                    <td className="p-3 text-right tabular-nums">{s.sent}</td>
                    <td className="p-3 text-right tabular-nums">{s.answered}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{s.nps.nps ?? "—"}</td>
                    <td className="p-3"><SurveyChip status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="px-1 text-xs text-ink-400">
        Loại phiếu: {Object.values(EVAL_FORM_TYPE_VI).join(" · ")}. Trạng thái đợt: {Object.values(EVAL_ROUND_STATUS_VI).join(" → ")}.
        Đợt lưu trữ không thao tác được nữa; số liệu đã ghi vẫn giữ nguyên.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-2xl font-bold ${tone === "ok" ? "text-green-700" : ""}`}>{value}</div>
    </div>
  );
}
