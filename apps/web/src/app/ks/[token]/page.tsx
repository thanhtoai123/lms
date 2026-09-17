import { getDb } from "@satarobo/db";
import { publicSurvey } from "@satarobo/api";
import { SurveyForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát — Sata Robo", robots: { index: false } };

export default async function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = /^[A-Za-z0-9_-]{8,80}$/.test(token) ? await publicSurvey(getDb(), token) : { state: "not_found" as const };
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <div className="mb-6 text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-600">Sata Robo</div>
        {"title" in s && <h1 className="mt-1 text-xl font-bold">{s.title}</h1>}
        {"description" in s && s.description && <p className="mt-1 text-sm text-ink-600">{s.description}</p>}
      </div>
      {s.state === "not_found" && <div className="card p-6 text-center">Liên kết khảo sát không đúng. Anh/chị vui lòng kiểm tra lại tin nhắn từ trung tâm.</div>}
      {s.state === "answered" && <div className="card p-6 text-center">Anh/chị đã gửi khảo sát này. Sata Robo cảm ơn anh/chị! 💙</div>}
      {s.state === "expired" && <div className="card p-6 text-center">Khảo sát đã kết thúc. Cảm ơn anh/chị đã quan tâm.</div>}
      {s.state === "open" && (
        <>
          <p className="mb-4 text-center text-sm text-ink-600">Ý kiến về việc học của bé <b>{s.studentFirstName}</b> tại {s.centerName}. Mất khoảng 1 phút.</p>
          <SurveyForm token={token} questions={s.questions} />
        </>
      )}
    </main>
  );
}
