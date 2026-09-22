import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader, PhNav, dtPh } from "@/components/ph-ui";
import { ConsentToggle, RevokeSession, PushToggle } from "./client";
import { pushStatus } from "@satarobo/api";

export const dynamic = "force-dynamic";

export default async function ParentAccount() {
  const p = await requireParent();
  const db = getDb();
  const [consents, sessions, push] = await Promise.all([ParentPortal.portalConsents(db, p.id), ParentPortal.parentSessionsList(db, p.id, p.sessionId), pushStatus(db, p.id)]);
  return (
    <>
      <PhHeader title="Tài khoản" name={p.fullName} />
      <main className="flex-1 space-y-4 px-4 py-4 pb-28">
        <section className="card space-y-1 p-4 text-[15px]"><div className="font-semibold">{p.fullName}</div><div className="text-ink-600">{p.phone}{p.email ? ` · ${p.email}` : ""}</div><p className="text-[13px] text-ink-600">Đổi thông tin liên hệ: nhắn trung tâm.</p></section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Thông báo trên điện thoại</h2>
          <PushToggle publicKey={push.publicKey} devices={push.devices} />
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Quyền riêng tư</h2>
          <ul className="divide-y divide-black/5 text-[15px]">{consents.map((c) => <li key={c.purpose} className="flex items-center justify-between gap-2 py-2"><span>{c.label}<div className="text-[13px] text-ink-600">{c.at ? `Cập nhật ${dtPh(c.at)}` : ""}</div></span><ConsentToggle purpose={c.purpose} granted={c.granted} editable={c.editable} /></li>)}</ul>
          <p className="mt-2 text-[13px] text-ink-600">Yêu cầu xem, sửa, xoá dữ liệu cá nhân: nhắn trung tâm — hạn xử lý theo quy định bảo vệ dữ liệu cá nhân.</p>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Thiết bị đang đăng nhập</h2>
          <ul className="divide-y divide-black/5 text-[15px]">{sessions.map((s) => <li key={s.id} className="py-2"><div className="truncate text-[13px]">{s.userAgent ?? "Thiết bị"}</div><div className="flex justify-between text-[13px] text-ink-600"><span>{s.current ? "Thiết bị này · " : ""}hoạt động {dtPh(s.lastSeenAt)}</span>{!s.current && <RevokeSession id={s.id} />}</div></li>)}</ul>
        </section>
        <form action="/api/ph/logout" method="post"><button className="btn-ghost w-full">Đăng xuất</button></form>
        <form action="/api/ph/logout?all=1" method="post"><button className="w-full text-[13px] text-red-700 underline">Đăng xuất khỏi tất cả thiết bị</button></form>
      </main>
      <PhNav />
    </>
  );
}
