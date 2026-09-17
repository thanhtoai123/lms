import { getDb } from "@satarobo/db";
import { portalThread } from "@satarobo/api";
import { ChatBox } from "./chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn — Sata Robo", robots: { index: false } };

export default async function ParentChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await portalThread(getDb(), token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6">
      <div className="mb-4 text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-600">Sata Robo · Tin nhắn</div>
        {t && <h1 className="mt-1 text-lg font-bold">{t.subject}</h1>}
        {t && <p className="text-xs text-ink-600">{[t.center, t.teacher ? `GV ${t.teacher}` : null].filter(Boolean).join(" · ")}</p>}
      </div>
      {!t ? <div className="card p-6 text-center text-sm">Liên kết không đúng hoặc đã được trung tâm cấp lại. Anh/chị vui lòng dùng liên kết mới nhất trong tin nhắn của Sata Robo.</div> : (
        <ChatBox token={token} initial={t.messages.map((m) => ({ ...m, at: new Date(m.at).toISOString() }))} closed={t.closed} />
      )}
      <p className="mt-4 text-center text-[11px] text-ink-400">Không chia sẻ liên kết này cho người khác. Trung tâm không bao giờ yêu cầu chuyển khoản vào tài khoản cá nhân.</p>
    </main>
  );
}
