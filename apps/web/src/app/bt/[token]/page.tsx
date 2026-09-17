import { getDb } from "@satarobo/db";
import { publicHomework } from "@satarobo/api";
import { HomeworkForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài tập về nhà — Sata Robo", robots: { index: false } };

export default async function PublicHomeworkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = /^[A-Za-z0-9_-]{16,80}$/.test(token) ? await publicHomework(getDb(), token) : { state: "not_found" as const };
  const due = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <div className="mb-6 text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-600">Sata Robo · Bài tập về nhà</div>
        {h.state === "open" && <h1 className="mt-1 text-xl font-bold">{h.title}</h1>}
      </div>
      {h.state === "not_found" ? <div className="card p-6 text-center">Liên kết bài tập không đúng. Anh/chị vui lòng kiểm tra lại tin nhắn từ trung tâm.</div> : (
        <div className="space-y-4">
          <div className="card space-y-2 p-4 text-sm">
            <p>Bài của bé <b>{h.studentFirstName}</b> · {h.classLabel} · {h.centerName}</p>
            <p className={h.late ? "font-semibold text-red-700" : ""}>Hạn nộp: {due(h.dueAt)}{h.late ? (h.allowLate && !h.closed ? " (đã quá hạn — vẫn nhận, ghi nhận nộp muộn)" : " (đã hết hạn)") : ""}</p>
            <p className="whitespace-pre-line rounded bg-black/5 p-3">{h.instructions}</p>
            <p className="text-xs text-ink-600">Hình thức: {h.typeLabel} · thang điểm {h.maxScore}</p>
            {h.docs.length > 0 && <ul className="text-sm">{h.docs.map((d, i) => <li key={i}><a href={d.url!} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{d.title}</a></li>)}</ul>}
          </div>
          <div className="card space-y-1 p-4 text-sm">
            <p>Trạng thái: <b>{h.statusLabel}</b></p>
            {h.submittedAt && <p className="text-xs text-ink-600">Đã nộp lúc {due(h.submittedAt)}{h.fileNames.length ? ` · ${h.fileNames.length} tệp` : ""}{h.link ? " · có đường link" : ""}</p>}
            {h.score !== null && <p className="text-lg font-bold text-green-700">Điểm: {h.score}/{h.maxScore}</p>}
            {h.feedback && <p className="whitespace-pre-line">Nhận xét của giáo viên: {h.feedback}</p>}
          </div>
          {h.canSubmit ? <HomeworkForm token={token} type={h.submissionType} accept={h.accept} again={h.status === "returned"} /> : (
            h.submissionType === "offline" && h.status === "assigned" ? <div className="card p-4 text-center text-sm">Bài này con nộp trực tiếp tại lớp.</div> : null
          )}
        </div>
      )}
    </main>
  );
}
