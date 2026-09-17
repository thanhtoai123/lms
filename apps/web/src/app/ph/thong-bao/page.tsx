import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, dtPh } from "@/components/ph-ui";

export const dynamic = "force-dynamic";

export default async function ParentNotifications() {
  const p = await requireParent();
  const items = await ParentPortal.portalNotifications(getDb(), p.id, true);
  return (
    <>
      <PhHeader title="Thông báo" name={p.fullName} />
      <main className="flex-1 px-4 py-4 pb-24">
        {items.length === 0 ? <div className="card p-4 text-sm">Chưa có thông báo.</div> : (
          <ul className="card divide-y divide-black/5">{items.map((n) => (
            <li key={n.id} className={`p-3 text-sm ${n.readAt ? "" : "bg-brand-50/50"}`}>
              <div className="flex justify-between gap-2"><b>{n.title}</b><span className="shrink-0 text-[11px] text-ink-400">{dtPh(n.createdAt)}</span></div>
              <div className="whitespace-pre-wrap text-ink-600">{n.body}</div>
              {n.link && <a href={n.link} className="text-xs text-brand-600 underline">Mở</a>}
            </li>
          ))}</ul>
        )}
      </main>
      <PhNav />
    </>
  );
}
