import Link from "next/link";
import { getDb } from "@satarobo/db";
import { parentConversations, parentThread } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, PhMain, dtPh } from "@/components/ph-ui";
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
      {/* Khổ chữ đọc thoải mái: không để dòng tin nhắn kéo dài hết 960px trên máy tính */}
      <PhMain className="space-y-3 md:max-w-[760px]">
        {t ? (
          <>
            <Link href="/ph/tin-nhan" className="text-[15px] text-brand-600">← Tất cả tin nhắn</Link>
            <Thread id={t.id} initial={t.messages.map((m) => ({ ...m, at: new Date(m.at).toISOString() }))} />
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-600">Muốn hỏi về con? Mở mục <a href="/ph/yeu-cau#hoi-dap" className="font-semibold text-primary underline">Yêu cầu → Hỏi đáp</a>.</p>
            {list.length === 0 ? <div className="card p-4 text-[15px]">Chưa có tin nhắn.</div> : (
              <ul className="card divide-y divide-black/5">{list.map((c) => (
                <li key={c.id}><Link href={`/ph/tin-nhan?id=${c.id}`} className="block p-3">
                  <div className="flex justify-between gap-2"><span className={`truncate ${c.unread ? "font-bold" : "font-medium"}`}>{c.subject ?? "Tin nhắn"}</span><span className="shrink-0 text-[13px] text-ink-600">{dtPh(c.lastMessageAt)}</span></div>
                  <div className="truncate text-[13px] text-ink-600">{c.teacher ? `GV ${c.teacher} · ` : ""}{c.lastPreview}</div>
                </Link></li>
              ))}</ul>
            )}
          </>
        )}
      </PhMain>
      <PhNav />
    </>
  );
}
