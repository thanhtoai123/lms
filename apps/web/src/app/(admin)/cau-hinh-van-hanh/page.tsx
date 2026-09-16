import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu hình vận hành" };

/** 11 nhóm tham số như trang Cấu hình vận hành của hệ cũ (ADMIN-SPEC §13.1) */
const TABS = [
  { key: "thong-bao", label: "Thông báo đẩy", desc: "Bật/tắt push; 36 loại thông báo nội bộ, mức Khẩn/Thường, người nhận theo vai trò/ngữ cảnh." },
  { key: "zalo", label: "Tin Zalo (ZNS)", desc: "Gửi thật/giả lập, template ID, ngưỡng chưa đọc, chặn bão tin mỗi PH/nhóm lớp." },
  { key: "otp", label: "Đăng nhập/OTP", desc: "Hiệu lực mã, số lần nhập sai, thời gian chờ, trần theo số/máy/ngày." },
  { key: "hoc-vien", label: "Học viên", desc: "Ngưỡng sắp hết khoá, bảo lưu tối đa, 'hay vắng', sinh nhật, học bù liên cơ sở." },
  { key: "lop", label: "Lớp & GV", desc: "Sĩ số min/max, quá tải giờ/tuần, hạn link ảnh/video, PH xem điểm bài tập." },
  { key: "cham-cong", label: "Chấm công", desc: "Dung sai quét, bán kính, ngưỡng đi muộn, trừ nội quy, nhắc ca." },
  { key: "lead", label: "Khách hàng (lead)", ready: true },
  { key: "thanh-toan", label: "Thanh toán", desc: "Nhắc đợt 2, lệch tiền tối đa vẫn khớp, hiệu lực QR." },
  { key: "nhac", label: "Nhắc tự động", desc: "Nhắc tái tục, nhắc buổi học, số dòng mỗi nhóm việc trên dashboard, ngưỡng quá hạn." },
  { key: "cong-ty", label: "Công ty", desc: "SĐT/email theo cơ sở trên web, giải thưởng, quà tặng, cam kết (có người duyệt)." },
  { key: "nang-cao", label: "Nâng cao", desc: "Sơ đồ tổ chức mới, timeout upload." },
] as const;

export default async function OperationalSettings({ searchParams }: { searchParams: Promise<{ center?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS.find((t) => t.key === "lead")!;
  const { caller } = await getServerCaller();
  const ref = await caller.academics.classes.referenceData();
  const centerId = sp.center === "global" ? null : (sp.center ?? ref.centers[0]?.id ?? null);

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
            {!("ready" in t) && <span className="ml-1 text-[10px] text-ink-400">•</span>}
          </Link>
        ))}
      </nav>

      {"ready" in tab ? (
        <>
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value="lead" />
            <select name="center" defaultValue={centerId ?? "global"} className="input max-w-xs">
              <option value="global">Mặc định toàn hệ thống</option>
              {ref.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <button className="btn-ghost">Xem</button>
          </form>
          <SettingsForm centerId={centerId} />
        </>
      ) : (
        <div className="card max-w-2xl space-y-2 p-5">
          <span className="chip bg-amber-100 text-amber-800">Đang xây dựng</span>
          <p className="text-sm text-ink-600">{tab.desc}</p>
        </div>
      )}
    </div>
  );
}
