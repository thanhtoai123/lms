import Link from "next/link";
import { notFound } from "next/navigation";
import { SURVEY_TRIGGER_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { SurveyChip, Stars, dtVN } from "@/components/care-ui";
import { CsvButton } from "@/components/csv-button";
import { SurveyEditor } from "../editor";
import { SurveyStatusActions, SendSurvey, CopyLink } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát" };

const INV: Record<string, string> = { sent: "Đã gửi", opened: "Đã mở", answered: "Đã trả lời", expired: "Hết hạn" };

export default async function SurveyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const s = /^[0-9a-f-]{36}$/.test(id) ? await caller.care.survey({ id }).catch(() => null) : null;
  if (!s) notFound();
  const ref = await caller.academics.classes.referenceData();
  if (sp.edit === "1" && s.canEdit) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link href={`/khao-sat/${s.id}`} className="text-sm text-ink-600">← {s.title}</Link>
        <SurveyEditor locked={s.status !== "draft"} centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} initial={{ id: s.id, title: s.title, description: s.description ?? "", centerId: s.centerId ?? "", trigger: s.trigger, triggerValue: s.triggerValue ?? 4, questions: s.questions }} />
      </div>
    );
  }
  const answered = s.invites.filter((i) => i.status === "answered").length;
  return (
    <div className="space-y-4">
      <Link href="/khao-sat" className="text-sm text-ink-600">← Khảo sát</Link>
      <PageHeader
        title={s.title}
        desc={`${SURVEY_TRIGGER_VI[s.trigger]}${s.trigger === "session_n" ? ` ${s.triggerValue}` : ""} · ${s.invites.length} đã gửi · ${answered} trả lời`}
        actions={<div className="flex flex-wrap items-center gap-2"><SurveyChip status={s.status} />{s.canEdit && <Link href={`/khao-sat/${s.id}?edit=1`} className="btn-ghost">Sửa</Link>}{s.canEdit && <SurveyStatusActions id={s.id} status={s.status} />}</div>}
      />
      {s.canSend && <SendSurvey id={s.id} centers={ref.centers.map((c) => ({ id: c.id, code: c.code }))} />}
      <section className="grid gap-3 md:grid-cols-2">
        {s.results.map((r, i) => (
          <div key={r.q.id} className="card p-4 text-sm">
            <div className="mb-2 font-medium">{i + 1}. {r.q.label}</div>
            {"nps" in r && r.nps && (
              <div>
                <div className="text-3xl font-bold">{r.nps.nps ?? "—"}</div>
                <div className="text-xs text-ink-600">{r.nps.count} trả lời · giới thiệu {r.nps.promoters} · trung lập {r.nps.passives} · không hài lòng {r.nps.detractors}</div>
                {r.nps.count > 0 && <div className="mt-2 flex h-3 overflow-hidden rounded"><div className="bg-green-500" style={{ width: `${(r.nps.promoters / r.nps.count) * 100}%` }} /><div className="bg-slate-300" style={{ width: `${(r.nps.passives / r.nps.count) * 100}%` }} /><div className="bg-red-400" style={{ width: `${(r.nps.detractors / r.nps.count) * 100}%` }} /></div>}
              </div>
            )}
            {"rating" in r && r.rating && <div><b className="text-2xl">{r.rating.avg ?? "—"}</b> / 5 · {r.rating.count} trả lời <div className="text-xs">{r.rating.dist.map((n, k) => `${k + 1}★: ${n}`).join(" · ")}</div></div>}
            {"choices" in r && r.choices && r.choices.map((c) => <div key={c.option} className="flex justify-between text-xs"><span>{c.option}</span><b>{c.n}</b></div>)}
            {"texts" in r && r.texts && (r.texts.length ? <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">{r.texts.map((t, k) => <li key={k} className="rounded bg-black/[0.03] p-1.5">“{t.text}”</li>)}</ul> : <div className="text-xs text-ink-400">Chưa có ý kiến</div>)}
          </div>
        ))}
      </section>
      <section className="card overflow-x-auto p-2">
        <div className="flex items-center justify-between p-2"><h2 className="font-semibold">Người nhận</h2><CsvButton filename="khao-sat-nguoi-nhan" headers={["Học viên", "Phụ huynh", "Lớp", "Gửi lúc", "Trạng thái", "NPS", ...s.questions.map((q) => q.label)]} rows={s.invites.map((i) => [i.studentName, i.parentName, i.classCode, dtVN(i.sentAt), INV[i.status] ?? i.status, i.npsScore, ...s.questions.map((q) => (i.answers ? (i.answers[q.id] as string | number | null) : null))])} /></div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Học viên / PH</th><th className="p-2">Lớp</th><th className="p-2">Gửi</th><th className="p-2">Trạng thái</th><th className="p-2">NPS</th><th className="p-2">Liên kết</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {s.invites.map((i) => (
              <tr key={i.id}>
                <td className="p-2">{i.studentName}<div className="text-xs text-ink-400">{i.parentName}</div></td>
                <td className="p-2 text-xs">{i.classCode ?? i.centerCode}</td>
                <td className="p-2 text-xs">{dtVN(i.sentAt)}<div className="text-ink-400">{i.source === "manual" ? "thủ công" : "tự động"}</div></td>
                <td className="p-2 text-xs">{INV[i.status] ?? i.status}</td>
                <td className={`p-2 font-semibold ${i.group === "promoter" ? "text-green-700" : i.group === "detractor" ? "text-red-700" : ""}`}>{i.npsScore ?? "—"}{i.answers && typeof i.answers.gv === "number" ? <div className="font-normal"><Stars n={i.answers.gv} /></div> : null}</td>
                <td className="p-2">{i.status !== "answered" && i.status !== "expired" && <CopyLink token={i.token} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
