import { getDb } from "@satarobo/db";
import { ParentPortal, pushStatus } from "@satarobo/api";
import { PH_CACH_DANG_NHAP_VI, PH_NGUNG_NGAY } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, dtPh } from "@/components/ph-ui";
import { ConsentToggle, RevokeSession, PushToggle } from "./client";

export const dynamic = "force-dynamic";

export default async function ParentAccount() {
  const p = await requireParent();
  const db = getDb();
  const [consents, sessions, push] = await Promise.all([
    ParentPortal.portalConsents(db, p.id),
    ParentPortal.parentSessionsList(db, p.id, p.sessionId),
    pushStatus(db, p.id),
  ]);
  return (
    <>
      <PhMain className="space-y-4">
        <section className="card space-y-1 p-4 text-[15px]">
          <div className="font-semibold">{p.fullName}</div>
          <div className="text-ink-600">{p.phone}{p.email ? ` · ${p.email}` : ""}</div>
          <p className="text-[13px] text-ink-600">Đổi thông tin liên hệ: nhắn trung tâm.</p>
        </section>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Thông báo trên điện thoại</h2>
              <PushToggle publicKey={push.publicKey} devices={push.devices} />
            </section>

            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Quyền riêng tư</h2>
              <ul className="divide-y divide-black/5 text-[15px]">
                {consents.map((c) => (
                  <li key={c.purpose} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {c.label}
                      <span className="block text-[13px] text-ink-600">{c.at ? `Cập nhật ${dtPh(c.at)}` : ""}</span>
                    </span>
                    <ConsentToggle purpose={c.purpose} granted={c.granted} editable={c.editable} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-ink-600">
                Yêu cầu xem, sửa, xoá dữ liệu cá nhân: nhắn trung tâm — hạn xử lý theo quy định bảo vệ dữ liệu cá nhân.
              </p>
            </section>
          </div>

          <div className="space-y-4">
            <section className="card p-4">
              <h2 className="font-semibold">Thiết bị đang đăng nhập</h2>
              <p className="mb-2 text-[13px] text-ink-600">
                Không mở cổng trong {PH_NGUNG_NGAY} ngày thì thiết bị tự đăng xuất. Thấy thiết bị lạ, anh/chị đăng xuất nó ngay và báo trung tâm.
              </p>
              <ul className="divide-y divide-black/5 text-[15px]">
                {sessions.map((s) => (
                  <li key={s.id} className="py-2">
                    <div className="font-medium">
                      {s.device}
                      {s.current && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-semibold text-primary">Thiết bị này</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[13px] text-ink-600">
                      <span>
                        hoạt động {dtPh(s.lastSeenAt)} · vào bằng {PH_CACH_DANG_NHAP_VI[s.method] ?? s.method}
                        {s.conLaiNgay <= 3 && <span className="text-amber-700"> · tự đăng xuất sau {s.conLaiNgay} ngày</span>}
                      </span>
                      {!s.current && <RevokeSession id={s.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card space-y-2 p-4">
              <h2 className="font-semibold">Đăng xuất</h2>
              <form action="/api/ph/logout" method="post"><button className="btn-ghost w-full">Đăng xuất thiết bị này</button></form>
              <form action="/api/ph/logout?all=1" method="post"><button className="w-full py-2 text-[13px] text-red-700 underline">Đăng xuất khỏi tất cả thiết bị</button></form>
              <p className="text-[13px] text-ink-600">Trung tâm không bao giờ hỏi mã đăng nhập của anh/chị — ai hỏi mã đều là giả mạo.</p>
            </section>
          </div>
        </div>
      </PhMain>
    </>
  );
}
