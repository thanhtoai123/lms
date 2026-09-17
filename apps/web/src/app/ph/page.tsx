import Link from "next/link";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, vndPh, datePh, dtPh } from "@/components/ph-ui";

export const dynamic = "force-dynamic";

export default async function ParentHome() {
  const p = await requireParent();
  const d = await ParentPortal.portalHome(getDb(), p.id);
  return (
    <>
      <PhHeader title="Trang chủ" name={p.fullName} />
      <main className="flex-1 space-y-4 px-4 py-4 pb-24">
        {d.debt > 0 && <Link href="/ph/hoc-phi" className="card block border-amber-200 bg-amber-50 p-3 text-sm">Học phí cần đóng: <b>{vndPh(d.debt)}</b> → xem & chuyển khoản</Link>}
        {d.children.map((k) => (
          <section key={k.id} className="card space-y-2 p-4">
            <div className="flex items-center justify-between"><Link href={`/ph/be/${k.id}`} className="text-lg font-bold">{k.nickname || k.fullName}</Link><Link href={`/ph/be/${k.id}`} className="text-xs text-brand-600">Chi tiết →</Link></div>
            <div className="text-sm">{k.next ? <>Buổi tới: <b>{datePh(k.next.date)} {k.next.start.slice(0, 5)}</b> · {k.next.classCode}{k.next.room ? ` · ${k.next.room}` : ""} · {k.next.center}</> : <span className="text-ink-400">Chưa có buổi học sắp tới</span>}</div>
            <div className="text-xs text-ink-600">Chuyên cần 30 ngày: {k.attendance30.rate === null ? "—" : `${k.attendance30.present}/${k.attendance30.total} buổi (${k.attendance30.rate}%)`}</div>
            {k.homework.length > 0 && (
              <ul className="space-y-1 text-sm">{k.homework.map((h, i) => <li key={i}><a href={h.link} className="text-brand-600 underline">{h.title}</a> <span className="text-xs text-ink-400">hạn {dtPh(h.dueAt)}{h.status === "returned" ? " · cần làm lại" : ""}</span></li>)}</ul>
            )}
          </section>
        ))}
        {d.children.length === 0 && <div className="card p-4 text-sm">Chưa có học viên gắn với tài khoản này.</div>}
        {d.upcoming.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Lịch học sắp tới</h2>
            <ul className="divide-y divide-black/5 text-sm">{d.upcoming.map((u, i) => <li key={i} className="flex justify-between py-2"><span>{u.student} · {u.classCode}</span><span className="text-ink-600">{datePh(u.date)} {u.start.slice(0, 5)}</span></li>)}</ul>
          </section>
        )}
      </main>
      <PhNav unread={d.unread} />
    </>
  );
}
