import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, dtPh } from "@/components/ph-ui";
import { ConsentToggle, RevokeSession } from "./client";

export const dynamic = "force-dynamic";

export default async function ParentAccount() {
  const p = await requireParent();
  const db = getDb();
  const [consents, sessions] = await Promise.all([ParentPortal.portalConsents(db, p.id), ParentPortal.parentSessionsList(db, p.id, p.sessionId)]);
  return (
    <>
      <PhHeader title="Tài khoản" name={p.fullName} />
      <main className="flex-1 space-y-4 px-4 py-4 pb-24">
        <section className="card space-y-1 p-4 text-sm"><div className="font-semibold">{p.fullName}</div><div className="text-ink-600">{p.phone}{p.email ? ` · ${p.email}` : ""}</div><p className="text-xs text-ink-400">Đổi thông tin liên hệ: nhắn trung tâm.</p></section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Quyền riêng tư</h2>
          <ul className="divide-y divide-black/5 text-sm">{consents.map((c) => <li key={c.purpose} className="flex items-center justify-between gap-2 py-2"><span>{c.label}<div className="text-[11px] text-ink-400">{c.at ? `Cập nhật ${dtPh(c.at)}` : ""}</div></span><ConsentToggle purpose={c.purpose} granted={c.granted} editable={c.editable} /></li>)}</ul>
          <p className="mt-2 text-[11px] text-ink-400">Yêu cầu xem, sửa, xoá dữ liệu cá nhân: nhắn trung tâm — hạn xử lý theo quy định bảo vệ dữ liệu cá nhân.</p>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Thiết bị đang đăng nhập</h2>
          <ul className="divide-y divide-black/5 text-sm">{sessions.map((s) => <li key={s.id} className="py-2"><div className="truncate text-xs">{s.userAgent ?? "Thiết bị"}</div><div className="flex justify-between text-[11px] text-ink-400"><span>{s.current ? "Thiết bị này · " : ""}hoạt động {dtPh(s.lastSeenAt)}</span>{!s.current && <RevokeSession id={s.id} />}</div></li>)}</ul>
        </section>
        <form action="/api/ph/logout" method="post"><button className="btn-ghost w-full">Đăng xuất</button></form>
        <form action="/api/ph/logout?all=1" method="post"><button className="w-full text-xs text-red-700 underline">Đăng xuất khỏi tất cả thiết bị</button></form>
      </main>
      <PhNav />
    </>
  );
}
