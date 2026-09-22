import Link from "next/link";
import type { OpsGroup } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { SettingsForm } from "./form";
import { DeliverySettingsPanel } from "./delivery";
import { OpsForm } from "./ops-form";
import { CommissionPolicyPanel } from "./commission";
import { MethodEditor } from "../payment-methods/editor";
import { PAYMENT_METHOD_KIND_VI, PAYMENT_SCOPE_FLAGS, PAYMENT_SCOPE_FLAG_VI, type PaymentMethodKind } from "@satarobo/core";
import { NotificationTypesPanel } from "./notification-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu hình vận hành" };

type Tab =
  | { key: string; label: string; kind: "lead" }
  | { key: string; label: string; kind: "zalo" }
  | { key: string; label: string; kind: "notification-types"; desc: string }
  | { key: string; label: string; kind: "ops"; group: OpsGroup; desc: string }
  | { key: string; label: string; kind: "hoa-hong"; desc: string }
  | { key: string; label: string; kind: "phuong-thuc-tt"; desc: string }
  | { key: string; label: string; kind: "link"; desc: string; links: { href: string; label: string }[] };

/** Các nhóm như trang Cấu hình vận hành của bản gốc (ADMIN-SPEC §13.1 · KHAO-SAT-GOC-2 §5) */
const TABS: Tab[] = [
  { key: "thong-bao", label: "Thông báo đẩy", kind: "link", desc: "Thông báo đẩy tới phụ huynh dùng khoá VAPID và giờ yên lặng chung với tin Zalo. Thông báo nội bộ cho nhân sự hiện ở chuông góc trên, gửi theo vai trò.", links: [{ href: "/cau-hinh-van-hanh?tab=zalo", label: "Giờ yên lặng, trần tin mỗi phụ huynh" }, { href: "/tich-hop", label: "Trạng thái Web Push" }, { href: "/cau-hinh-van-hanh?tab=danh-muc-thong-bao", label: "Danh mục loại thông báo (chọn loại được đẩy)" }, { href: "/user-groups", label: "Nhóm nhận thông báo nội bộ" }] },
  { key: "danh-muc-thong-bao", label: "Danh mục thông báo", kind: "notification-types", desc: "Danh mục loại thông báo nội bộ: nhóm nghiệp vụ, mức ưu tiên (Khẩn / Thường / Tham khảo), người nhận và chọn loại nào được đẩy. Mọi thay đổi bắt buộc ghi lý do." },
  { key: "zalo", label: "Tin Zalo (ZNS) / SMS", kind: "zalo" },
  { key: "otp", label: "Đăng nhập/OTP", kind: "ops", group: "otp", desc: "Áp cho toàn hệ thống: đăng nhập nhân sự (tự đăng xuất, khoá tạm khi sai mật khẩu), đăng nhập cổng phụ huynh và kích hoạt tài khoản." },
  { key: "hoc-vien", label: "Học viên", kind: "ops", group: "hoc-vien", desc: "Ngưỡng sắp hết khoá, bảo lưu tối đa, hạn học bù, cảnh báo chuyên cần." },
  { key: "lop", label: "Lớp & GV", kind: "ops", group: "lop", desc: "Quy tắc điểm danh bằng thẻ QR." },
  { key: "ho-so-hoc-tap", label: "Hồ sơ học tập", kind: "ops", group: "ho-so-hoc-tap", desc: "Chuẩn thông tin hồ sơ học tập: điều kiện phát hành phiếu (mục tiêu bài, sản phẩm), chặn hoàn tất buổi khi thiếu phiếu, độ dài nhận xét tối thiểu, tỷ lệ bằng chứng, hạn hoàn thiện phiếu và học bạ mốc, ngưỡng hồ sơ đạt chuẩn. Theo dõi ở Học bạ & hồ sơ học tập." },
  { key: "cham-cong", label: "Chấm công", kind: "ops", group: "cham-cong", desc: "Dung sai tính đi muộn / về sớm. Bán kính chấm công đặt theo từng cơ sở ở trang Cơ sở." },
  { key: "lead", label: "Khách hàng (lead)", kind: "lead" },
  { key: "thanh-toan", label: "Thanh toán", kind: "ops", group: "thanh-toan", desc: "Mặc định nhắc đợt thanh toán cho đơn mới (sửa được trên từng đơn), trần giảm giá dòng, tuổi nợ, hạn dùng mã QR chuyển khoản và dạng mã đơn hàng." },
  { key: "phuong-thuc-tt", label: "Phương thức thanh toán", kind: "phuong-thuc-tt", desc: "Tiền mặt, chuyển khoản, cổng online, ví điện tử, COD — khai theo từng cơ sở hoặc dùng chung cho cả hệ thống. Phương thức gắn cơ sở chỉ hiện ở đơn của cơ sở đó; phương thức dùng chung (cột Cơ sở để trống) hiện ở mọi cơ sở, kể cả cơ sở mở sau này. Tài khoản ngân hàng dựng mã QR khai ngay trong từng phương thức." },
  { key: "hoa-hong", label: "Hoa hồng", kind: "hoa-hong", desc: "Chính sách hoa hồng 4 trục: chi khi nào · loại đơn · cách tính · ai nhận bao nhiêu." },
  { key: "cap-hoa-hong", label: "Trần hoa hồng", kind: "ops", group: "hoa-hong", desc: "Trần tổng tỉ lệ hoa hồng cho mỗi cặp (sự kiện + loại đơn). Mặc định 9% theo SR.QD.208 · PL04." },
  { key: "nhac", label: "Nhắc tự động", kind: "ops", group: "nhac", desc: "Nhắc hạn bài tập. Luật chăm sóc tự động (việc cần làm theo sự kiện) ở trang Tự động hoá." },
  { key: "cong-ty", label: "Công ty", kind: "link", desc: "Thông tin pháp nhân, hotline, email, chân phiếu thu và hoá đơn.", links: [{ href: "/settings", label: "Cài đặt chung" }, { href: "/hoa-don?tab=settings", label: "Thông tin người bán trên hoá đơn điện tử" }, { href: "/centers", label: "SĐT / địa chỉ theo cơ sở" }] },
  { key: "nang-cao", label: "Nâng cao", kind: "link", desc: "Cây tổ chức, sao lưu, biến môi trường, tích hợp.", links: [{ href: "/to-chuc", label: "Cây tổ chức" }, { href: "/van-hanh", label: "Vận hành & sao lưu" }, { href: "/tich-hop", label: "Tích hợp" }] },
];

export default async function OperationalSettings({ searchParams }: { searchParams: Promise<{ center?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS.find((t) => t.key === "lead")!;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center === "global" ? null : (sp.center ?? ref.centers[0]?.id ?? null);
  const methods = tab.kind === "phuong-thuc-tt" ? await caller.finance.methods({}) : [];
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const centerPicker = (
    <form className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab.key} />
      <select name="center" defaultValue={centerId ?? "global"} className="input max-w-xs">
        <option value="global">Mặc định toàn hệ thống</option>
        {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
      </select>
      <button className="btn-ghost">Xem</button>
    </form>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cấu hình vận hành</h1>
        <p className="text-sm text-ink-600">Bộ luật vận hành theo cơ sở. Cơ sở không cấu hình riêng sẽ kế thừa mặc định toàn hệ thống.</p>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-black/5 text-sm" aria-label="Nhóm cấu hình">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/cau-hinh-van-hanh?tab=${t.key}${sp.center ? `&center=${sp.center}` : ""}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 ${t.key === tab.key ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-600 hover:text-ink-900"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab.kind === "zalo" && <DeliverySettingsPanel />}
      {tab.kind === "notification-types" && (<><p className="text-sm text-ink-600">{tab.desc}</p><NotificationTypesPanel /></>)}
      {tab.kind === "lead" && (<>{centerPicker}<SettingsForm centerId={centerId} /></>)}
      {tab.kind === "ops" && (
        <>
          <p className="text-sm text-ink-600">{tab.desc}</p>
          {tab.group !== "otp" && tab.group !== "nhac" && tab.group !== "hoa-hong" && centerPicker}
          <OpsForm key={`${tab.group}-${centerId}`} group={tab.group} centerId={tab.group === "otp" || tab.group === "nhac" || tab.group === "hoa-hong" ? null : centerId} />
        </>
      )}
      {tab.kind === "hoa-hong" && (
        <>
          <p className="text-sm text-ink-600">{tab.desc}</p>
          <CommissionPolicyPanel centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} today={today} />
        </>
      )}
      {tab.kind === "phuong-thuc-tt" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{tab.desc}</p>
          <MethodEditor centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-3">Thứ tự</th><th className="p-3">Mã</th><th className="p-3">Tên</th><th className="p-3">Loại</th><th className="p-3">Cơ sở</th><th className="p-3">Cho phép</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/5 align-top">
                {methods.length === 0 && <tr><td className="p-4 text-ink-400" colSpan={8}>Chưa khai phương thức thanh toán nào.</td></tr>}
                {methods.map((m) => (
                  <tr key={m.id}>
                    <td className="p-3 tabular-nums">{m.sortOrder}</td>
                    <td className="p-3 font-mono text-xs">{m.code}</td>
                    <td className="p-3">{m.name}{m.description && <div className="text-xs text-ink-400">{m.description}</div>}{m.accountNo && <div className="text-xs text-ink-600">{m.bankName ?? ""} {m.accountNo}{m.bankBranch ? ` · ${m.bankBranch}` : ""}</div>}</td>
                    <td className="p-3">{PAYMENT_METHOD_KIND_VI[m.kind as PaymentMethodKind]}</td>
                    <td className="p-3">{m.centerCode ?? <span className="text-ink-400">Dùng chung</span>}</td>
                    <td className="p-3 text-xs">{PAYMENT_SCOPE_FLAGS.filter((k) => m.scope[k]).map((k) => PAYMENT_SCOPE_FLAG_VI[k]).join(" · ") || <span className="text-ink-400">—</span>}</td>
                    <td className="p-3">{m.isActive ? <span className="chip bg-green-100 text-green-800">Hoạt động</span> : <span className="chip bg-black/5">Tắt</span>}</td>
                    <td className="p-3">{m.canEdit && <MethodEditor method={m} centers={ref.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab.kind === "link" && (
        <div className="card max-w-2xl space-y-3 p-5 text-sm">
          <p className="text-ink-600">{tab.desc}</p>
          <ul className="space-y-1">{tab.links.map((l) => <li key={l.href}><Link href={l.href} className="text-brand-600">{l.label} →</Link></li>)}</ul>
        </div>
      )}
    </div>
  );
}
