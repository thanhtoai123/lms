import Link from "next/link";
import { getDb } from "@satarobo/db";
import { parentConversations, parentThread } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, dtPh } from "@/components/ph-ui";
import { Thread } from "./client";

export const dynamic = "force-dynamic";

export default async function ParentMessages({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const db = getDb();
  const t = sp.id && /^[0-9a-f-]{36}$/i.test(sp.id) ? await parentThread(db, p.id, sp.id) : null;
  const list = t ? [] : await parentConversations(db, p.id);
  return (
    <>
      <PhHeader title={t ? t.subject ?? "Tin nhắn" : "Tin nhắn"} name={p.fullName} />
      <main className="flex-1 space-y-3 px-4 py-4 pb-24">
        {t ? (
          <>
            <Link href="/ph/tin-nhan" className="text-sm text-brand-600">← Tất cả tin nhắn</Link>
            <Thread id={t.id} initial={t.messages.map((m) => ({ ...m, at: new Date(m.at).toISOString() }))} />
          </>
        ) : (
          <>
            <p className="text-xs text-ink-600">Muốn hỏi về con? Mở trang của con → “Hỏi trung tâm về con”.</p>
            {list.length === 0 ? <div className="card p-4 text-sm">Chưa có tin nhắn.</div> : (
              <ul className="card divide-y divide-black/5">{list.map((c) => (
                <li key={c.id}><Link href={`/ph/tin-nhan?id=${c.id}`} className="block p-3">
                  <div className="flex justify-between gap-2"><span className={`truncate ${c.unread ? "font-bold" : "font-medium"}`}>{c.subject ?? "Tin nhắn"}</span><span className="shrink-0 text-[11px] text-ink-400">{dtPh(c.lastMessageAt)}</span></div>
                  <div className="truncate text-xs text-ink-600">{c.teacher ? `GV ${c.teacher} · ` : ""}{c.lastPreview}</div>
                </Link></li>
              ))}</ul>
            )}
          </>
        )}
      </main>
      <PhNav />
    </>
  );
}
