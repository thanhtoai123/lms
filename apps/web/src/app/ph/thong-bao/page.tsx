import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhMain, dtPh } from "@/components/ph-ui";

export const dynamic = "force-dynamic";

export default async function ParentNotifications() {
  const p = await requireParent();
  const items = await ParentPortal.portalNotifications(getDb(), p.id, true);
  return (
    <>
      <PhMain>
        {items.length === 0 ? <div className="card p-4 text-[15px]">Chưa có thông báo.</div> : (
          <ul className="card divide-y divide-black/5">{items.map((n) => (
            <li key={n.id} className={`p-3 text-[15px] ${n.readAt ? "" : "bg-brand-50/50"}`}>
              <div className="flex justify-between gap-2"><b>{n.title}</b><span className="shrink-0 text-[13px] text-ink-600">{dtPh(n.createdAt)}</span></div>
              <div className="whitespace-pre-wrap text-ink-600">{n.body}</div>
              {n.link && <a href={n.link} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary underline">Mở</a>}
            </li>
          ))}</ul>
        )}
      </PhMain>
    </>
  );
}
