import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, datePh, dtPh } from "@/components/ph-ui";
import { AskForm } from "../../tin-nhan/client";
import { scoreLabel } from "@satarobo/core";

export const dynamic = "force-dynamic";

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireParent();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await ParentPortal.portalChild(getDb(), p.id, id);
  if (!c) notFound();
  return (
    <>
      <PhHeader title={c.fullName} name={p.fullName} />
      <main className="flex-1 space-y-4 px-4 py-4 pb-24">
        <section className="card space-y-1 p-4 text-sm">
          <div className="font-mono text-xs text-ink-400">{c.code}</div>
          {c.enrollments.map((e) => <div key={e.id}><b>{e.classCode}</b> · {e.course} · {e.center}{e.teacher ? ` · GV ${e.teacher}` : ""} <span className="text-xs text-ink-400">({e.status === "paused" ? "bảo lưu" : e.status === "completed" ? "đã hoàn thành" : `${e.attended}/${e.packageSessions} buổi gần đây`})</span></div>)}
          <div>SataCoin: <b>{c.coins}</b> xu</div>
        </section>
        {c.card && (
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Thẻ điểm danh QR của con</summary>
            <div className="mx-auto mt-2 w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.card.svg }} />
            <p className="text-center text-xs text-ink-600">Đưa thẻ (hoặc màn hình này) cho giáo viên quét khi đến lớp.</p>
          </details>
        )}
        <Link href={`/ph/be/${c.id}/ho-so`} className="card flex items-center justify-between gap-3 bg-gradient-to-r from-brand-50 to-white p-4">
          <span>
            <span className="block font-semibold text-brand-700">Hồ sơ học tập của con</span>
            <span className="block text-xs text-ink-600">Phiếu nhận xét sau mỗi buổi, học bạ, chứng chỉ, sản phẩm — xem và lưu PDF</span>
          </span>
          <span className="text-brand-600" aria-hidden>›</span>
        </Link>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Lịch sắp tới</h2>
          {c.upcoming.length === 0 ? <p className="text-sm text-ink-400">Chưa có.</p> : <ul className="divide-y divide-black/5 text-sm">{c.upcoming.map((s, i) => <li key={i} className="flex justify-between py-2"><span>{s.classCode} · buổi {s.seq}{s.room ? ` · ${s.room}` : ""}</span><span>{datePh(s.date)} {s.start.slice(0, 5)}</span></li>)}</ul>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Điểm danh gần đây</h2>
          {c.history.length === 0 ? <p className="text-sm text-ink-400">Chưa có.</p> : <ul className="divide-y divide-black/5 text-sm">{c.history.map((s, i) => <li key={i} className="py-2"><div className="flex justify-between"><span>{datePh(s.date)} · buổi {s.seq}</span><span className={s.att?.startsWith("absent") ? "text-red-700" : s.att ? "text-green-700" : "text-ink-400"}>{s.attLabel ?? "chưa điểm danh"}</span></div>{s.remark && <div className="text-xs text-ink-600">GV nhận xét: {s.remark}</div>}</li>)}</ul>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Bài tập</h2>
          {c.homework.length === 0 ? <p className="text-sm text-ink-400">Chưa có.</p> : <ul className="divide-y divide-black/5 text-sm">{c.homework.map((h, i) => <li key={i} className="py-2"><div className="flex justify-between gap-2">{h.link ? <a href={h.link} className="text-brand-600 underline">{h.title}</a> : <span>{h.title}</span>}<span className="text-xs text-ink-600">{h.score !== null ? `${h.score}/${h.maxScore}` : `hạn ${dtPh(h.dueAt)}`}</span></div>{h.feedback && <div className="text-xs text-ink-600">{h.feedback}</div>}</li>)}</ul>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Học bạ</h2>
          {c.reportCards.length === 0 ? <p className="text-sm text-ink-400">Chưa có học bạ được phát hành.</p> : c.reportCards.map((r) => (
            <div key={r.id} className="mb-3 space-y-1 border-b border-black/5 pb-3 text-sm last:border-0">
              <div className="font-semibold">{r.classCode} · mốc buổi {r.milestone}{r.avg ? ` · điểm TB ${r.avg}/${r.scale}` : ""}</div>
              <ul className="text-xs">{r.scores.map((s, i) => <li key={i}>{s.name}: <b>{s.score != null ? scoreLabel(s.score, r.scale) : "—"}</b>{s.comment ? ` — ${s.comment}` : ""}</li>)}</ul>
              {r.strengths && <div className="text-xs"><b>Điểm mạnh:</b> {r.strengths}</div>}
              {r.improvements && <div className="text-xs"><b>Cần cải thiện:</b> {r.improvements}</div>}
              {r.comment && <div className="text-xs"><b>Nhận xét:</b> {r.comment}</div>}
            </div>
          ))}
        </section>
        <section className="card p-4"><h2 className="mb-2 font-semibold">Hỏi trung tâm về con</h2><AskForm studentId={c.id} /></section>
      </main>
      <PhNav />
    </>
  );
}
