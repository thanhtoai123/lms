/**
 * Menu khu quản trị — sao đúng thứ tự, nhãn và đường dẫn của admin.satarobo.vn (khảo sát 16/09/2026).
 * `perm`: quyền tối thiểu để thấy mục (kiểm tra lỏng bằng hasPermission; service vẫn kiểm tra chặt).
 * `ready`: đã xây trên hệ mới. Mục chưa xây mở trang "đang xây dựng" mô tả phạm vi theo docs/ADMIN-SPEC.md.
 */
import type { Permission } from "@satarobo/core";

export interface NavItem {
  label: string;
  href: string;
  perm?: Permission;
  ready?: boolean;
  /** Giai đoạn dự kiến trong docs/ROADMAP.md */
  phase?: 3 | 4 | 5;
  desc?: string;
}
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", ready: true },
      { label: "Hướng dẫn & đào tạo", href: "/huong-dan", ready: true, desc: "Bài hướng dẫn theo vai trò, có câu hỏi kiểm tra." },
      { label: "Bảo mật tài khoản", href: "/bao-mat", ready: true, desc: "Xác thực 2 lớp bằng ứng dụng OTP." },
      { label: "CRM", href: "/crm", perm: "lead:read", ready: true },
    ],
  },
  {
    key: "crm",
    label: "CRM & Tuyển sinh",
    items: [
      { label: "Leads", href: "/leads", perm: "lead:read", ready: true },
      { label: "Nhập khách hàng", href: "/nhap-khach-hang", perm: "lead:create", ready: true },
      { label: "Chốt hàng loạt", href: "/leads/bulk-convert", perm: "enrollment:create", ready: true },
      { label: "Quản lý chia lead", href: "/quan-ly-chia-lead", perm: "lead:update", ready: true },
      { label: "Bàn giao lead", href: "/ban-giao-lead", perm: "lead:update", ready: true },
      { label: "Lead lâu ngày chưa chăm", href: "/lead-nguoi", perm: "lead:read", ready: true },
      { label: "Chuyển lead liên CS", href: "/leads/bao-cao-chuyen", perm: "lead:read", ready: true },
      { label: "Nguồn giới thiệu", href: "/affiliates", perm: "affiliate:read", ready: true, desc: "Affiliate / người giới thiệu: mã giới thiệu, lead mang về, tỉ lệ chốt, thưởng khi đơn học phí đầu thu đủ, quản lý duyệt → kế toán chi." },
      { label: "Messenger CRM", href: "/crm/messenger", perm: "message:read", ready: true, desc: "Hộp thư Facebook Messenger gắn với lead: nhận tin, trả lời, tạo lead từ hội thoại, SLA 'chưa trả lời tin nhắn'." },
      { label: "Lớp Trial", href: "/lop-trial", perm: "lead:read", ready: true, desc: "Lớp học thử (buổi lẻ): xếp lead vào buổi thử, đổi lịch phải ghi lý do và báo GV, kết quả buổi thử cập nhật trạng thái lead." },
    ],
  },
  {
    key: "students",
    label: "Học viên & Đăng ký học",
    items: [
      { label: "Học viên", href: "/students", perm: "student:read", ready: true },
      { label: "Tài khoản phụ huynh", href: "/students/tai-khoan", perm: "parent_account:read", ready: true },
      { label: "Thẻ học viên (QR)", href: "/the-hoc-vien", perm: "student:read", ready: true, desc: "In thẻ QR để điểm danh bằng cách quét trong app giáo viên; cấp lại thẻ khi mất." },
      { label: "Đăng ký học", href: "/enrollments", perm: "enrollment:read", ready: true },
      { label: "Chuyển lớp / cơ sở", href: "/chuyen-lop", perm: "enrollment:update", ready: true },
      { label: "Sắp hết khoá", href: "/students/sap-het-khoa", perm: "enrollment:read", ready: true },
      { label: "Hoàn thành khoá & chứng chỉ", href: "/hoan-thanh-khoa", perm: "enrollment:read", ready: true },
      { label: "Học bạ", href: "/hoc-ba", perm: "report_card:read", ready: true },
      { label: "Học bạ năng lực", href: "/report-cards", perm: "report_card:read", ready: true },
      { label: "SataCoin", href: "/satacoin", perm: "coin:read", ready: true, desc: "Sổ xu thưởng chỉ thêm: thưởng theo hạn mức, thu hồi có lý do, đổi quà qua duyệt." },
    ],
  },
  {
    key: "classes",
    label: "Lớp học & Lịch học",
    items: [
      { label: "Lớp học", href: "/classes", perm: "class:read", ready: true },
      { label: "Buổi học", href: "/sessions", perm: "session:read", ready: true },
      { label: "Kiểm tra lịch buổi", href: "/classes/kiem-tra-lich", perm: "class:read", ready: true, desc: "Đối chiếu dãy buổi với khai giảng + lịch học; xếp lại cả dãy cho lớp bị neo sai." },
      { label: "Lịch tổng", href: "/lich", perm: "session:read", ready: true },
      { label: "Điểm danh", href: "/attendance", perm: "attendance:read", ready: true },
      { label: "Ảnh lớp học", href: "/media", perm: "media:read", ready: true },
      { label: "Duyệt ảnh", href: "/duyet-media", perm: "media:update", ready: true },
      { label: "Học bù", href: "/hoc-bu", perm: "makeup:read", ready: true },
      { label: "Cơ sở", href: "/centers", perm: "center:read", ready: true },
      { label: "Phòng học", href: "/rooms", perm: "class:read", ready: true },
    ],
  },
  {
    key: "lms",
    label: "LMS / Học liệu",
    items: [
      { label: "Chương trình học", href: "/curriculums", perm: "curriculum:read", ready: true, desc: "Giáo trình theo khoá: bài học, mục tiêu, học cụ." },
      { label: "Đề xuất sửa giáo án", href: "/de-xuat-giao-an", perm: "curriculum:read", ready: true, desc: "GV đề xuất chỉnh bài học; Đào tạo duyệt." },
      { label: "Khoá học", href: "/courses", perm: "course:read", ready: true, desc: "Khoá dạy: mã, độ tuổi, số buổi, học phí niêm yết." },
      { label: "Khoá tiên quyết", href: "/course-prerequisites", perm: "course:read", ready: true, desc: "Khoá phải học trước; chặn ghi danh khi chưa đạt." },
      { label: "Tài liệu giảng dạy", href: "/documents", perm: "document:read", ready: true, desc: "Kho tài liệu theo khoá / bài, phiên bản, nhật ký mở / tải." },
      { label: "Bài tập về nhà", href: "/assignments", perm: "assignment:read", ready: true, desc: "Giao bài, phụ huynh nộp qua link, chấm, trả lại, thưởng xu; mẫu bài tập." },
      { label: "Tài liệu lớp tôi", href: "/teaching-materials", perm: "class:read", ready: true, desc: "Tài liệu của các lớp GV đang dạy." },
      { label: "SCORM / Bài giảng tương tác", href: "/scorm", perm: "document:read", ready: true, desc: "Gói SCORM / bài giảng tương tác." },
    ],
  },
  {
    key: "care",
    label: "CSKH & Phụ huynh",
    items: [
      { label: "Tin nhắn", href: "/tin-nhan", perm: "message:read", ready: true, desc: "Tin nhắn PH ↔ trung tâm/GV." },
      { label: "Quản trị hội thoại", href: "/hoi-thoai", perm: "message:audit", ready: true, desc: "Giám sát hội thoại, đối soát." },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", perm: "care:read", ready: true, desc: "7 loại yêu cầu (nghỉ, bảo lưu, đổi lịch…) có duyệt." },
      { label: "Đánh giá PH", href: "/parent-feedback", perm: "care:read", ready: true, desc: "Đánh giá buổi học/GV từ PH." },
      { label: "Khảo sát / NPS", href: "/khao-sat", perm: "care:read", ready: true, desc: "Khảo sát theo mốc, điểm NPS." },
      { label: "Thông báo PH", href: "/notifications", perm: "care:read", ready: true, desc: "Thông báo gửi PH (in-app / ZNS / email) và trạng thái gửi." },
      { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", perm: "care:read", ready: true },
      { label: "Chăm sóc HV", href: "/cham-soc-hv", perm: "care:read", ready: true },
      { label: "Sinh nhật HV", href: "/sinh-nhat", perm: "care:read", ready: true, desc: "Học viên sinh nhật trong tuần/tháng, gửi lời chúc." },
    ],
  },
  {
    key: "hr",
    label: "Nhân sự & Giáo viên",
    items: [
      { label: "Giáo viên", href: "/teachers", perm: "teacher:read", ready: true, desc: "Hồ sơ GV, ngạch, tải dạy, lịch dạy." },
      { label: "Nhân sự", href: "/nhan-su", perm: "staff:read", ready: true, desc: "Hồ sơ nhân sự; lương/BHXH chỉ HR, Kế toán, Super Admin thấy." },
      { label: "Vị trí công việc", href: "/nhan-su/vi-tri", perm: "staff:read", ready: true, desc: "Chính / kiêm nhiệm / uỷ quyền, có hiệu lực." },
      { label: "Chấm công", href: "/cham-cong", perm: "timesheet:read", ready: true, desc: "Bảng công ngày, kỳ công, phân ca, quét có bán kính, ghi đè có lý do." },
      { label: "Duyệt đơn từ", href: "/don-tu", perm: "timesheet:read", ready: true, desc: "Đơn nghỉ, đi muộn, OT chờ duyệt." },
      { label: "Của tôi", href: "/cham-cong/lich-ca", ready: true, desc: "Lịch ca và công của tôi." },
      { label: "Tuyển dụng", href: "/jobs", perm: "recruit:read", ready: true, desc: "Tin tuyển dụng và ứng viên." },
    ],
  },
  {
    key: "inventory",
    label: "Sản phẩm & Kho",
    items: [
      { label: "Học cụ (Kits)", href: "/kits", perm: "inventory:read", ready: true, desc: "Bộ học cụ theo khoá, định mức linh kiện, đóng bộ, cấp cho học viên." },
      { label: "Sản phẩm bán/thuê", href: "/products", perm: "inventory:read", ready: true, desc: "Danh mục hàng, giá bán / thuê / cọc; bán và cho thuê tự lập đơn + xuất kho." },
      { label: "Tồn kho", href: "/inventory/dashboard", perm: "inventory:read", ready: true, desc: "Tồn theo cơ sở, nhập / cấp phát / chuyển kho, thẻ kho, cho thuê." },
      { label: "Kiểm kê kho", href: "/inventory/audit", perm: "inventory:read", ready: true, desc: "Phiếu kiểm kê, chênh lệch." },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      { label: "Đơn hàng", href: "/orders", perm: "finance:read", ready: true, desc: "Đơn học phí/sản phẩm, kế hoạch trả góp, QR thanh toán." },
      { label: "Thanh toán", href: "/payments", perm: "finance:read", ready: true, desc: "Sale ghi nhận → Kế toán xác nhận." },
      { label: "Công nợ", href: "/cong-no", perm: "finance:read", ready: true, desc: "Công nợ theo học viên / cơ sở." },
      { label: "Thiếu học phí", href: "/thieu-hoc-phi", perm: "finance:read", ready: true, desc: "Ghi danh đang học nhưng chưa đủ học phí." },
      { label: "Nhập giao dịch cũ", href: "/nhap-giao-dich-cu", perm: "finance:confirm", ready: true, desc: "Import giao dịch từ hệ cũ / sổ sách." },
      { label: "Biến động số dư", href: "/bien-dong-so-du", perm: "finance:approve", ready: true, desc: "Webhook SePay, đối khớp tự động với đơn." },
      { label: "Hoàn tiền", href: "/hoan-tien", perm: "finance:read", ready: true, desc: "Hoàn theo số buổi chưa học, có duyệt." },
      { label: "Hoá đơn điện tử", href: "/hoa-don", perm: "finance:read", ready: true, desc: "Lập hoá đơn tại thời điểm thu tiền, học phí không chịu thuế (KCT), điều chỉnh / thay thế thay vì huỷ, đối soát thu – xuất hoá đơn." },
      { label: "Phương thức TT", href: "/payment-methods", perm: "finance:read", ready: true, desc: "Tài khoản nhận tiền theo cơ sở." },
      { label: "Hoa hồng", href: "/crm/commission", perm: "finance:read", ready: true, desc: "Hoa hồng sale / người giới thiệu." },
    ],
  },
  {
    key: "web",
    label: "Website & Marketing",
    items: [
      { label: "Tin tức", href: "/news", perm: "site:read", ready: true, desc: "Bài viết website." },
      { label: "Nội dung website", href: "/site-content", perm: "site:read", ready: true, desc: "Ảnh/tiêu đề từng trang công khai; lưu xong tự làm mới trang." },
      { label: "Tracking", href: "/marketing", perm: "marketing:read", ready: true, desc: "Phễu, UTM, trạng thái Meta Pixel/CAPI, GA4." },
      { label: "Funnel Marketing", href: "/marketing/funnel", perm: "marketing:read", ready: true, desc: "Phễu marketing theo chiến dịch." },
    ],
  },
  {
    key: "email",
    label: "Email & OTP",
    items: [
      { label: "Email Templates", href: "/email-templates", perm: "system:read", ready: true, desc: "Mẫu email theo sự kiện." },
      { label: "Email Logs", href: "/email-logs", perm: "system:read", ready: true, desc: "Nhật ký gửi email." },
      { label: "OTP Logs", href: "/otp-logs", perm: "system:read", ready: true, desc: "Nhật ký OTP kích hoạt / quên mật khẩu." },
    ],
  },
  {
    key: "system",
    label: "Hệ thống & Cấu hình",
    items: [
      { label: "Tài khoản", href: "/users", perm: "system:read", ready: true, desc: "Tài khoản đăng nhập, vai trò theo cơ sở, vai trò chính, khoá/mở." },
      { label: "Nhóm người dùng", href: "/user-groups", perm: "system:read", ready: true, desc: "Nhóm nhận thông báo nội bộ." },
      { label: "Vai trò & quyền", href: "/roles", perm: "system:read", ready: true, desc: "Ma trận vai trò × quyền (đọc từ policy engine)." },
      { label: "Cây tổ chức", href: "/to-chuc", perm: "system:read", ready: true, desc: "Khu vực → cơ sở → phòng ban." },
      { label: "Audit Log", href: "/audit-log", perm: "audit:read", ready: true, desc: "Nhật ký thao tác bất biến, lọc theo cơ sở/module/người." },
      { label: "Tuân thủ dữ liệu", href: "/compliance", perm: "compliance:read", ready: true, desc: "Luật BVDLCN 2025 / NĐ 356: đồng ý, yêu cầu của chủ thể dữ liệu, sổ sự cố, lưu giữ." },
      { label: "Chạy lại webhook", href: "/crm/webhook-replay", perm: "system:read", ready: true, desc: "Xem và chạy lại webhook lỗi." },
      { label: "Tích hợp", href: "/tich-hop", perm: "system:read", ready: true, desc: "SePay, email, Zalo ZNS, OTP, cron, form công khai." },
      { label: "Chuyển đổi dữ liệu", href: "/chuyen-doi", perm: "migration:read", ready: true, desc: "Nhập học viên, phụ huynh, ghi danh từ hệ cũ; đối soát số liệu tổng và từng học viên." },
      { label: "Go-live cơ sở", href: "/go-live", perm: "cutover:read", ready: true, desc: "Chuẩn bị → chạy song song (sổ đối chiếu hằng ngày) → chính thức → hệ cũ chỉ đọc." },
      { label: "Vận hành & sao lưu", href: "/van-hanh", perm: "system:read", ready: true, desc: "Sức khoẻ hệ thống, biến môi trường, worker, sao lưu / khôi phục, hàng đợi, danh mục go-live." },
      { label: "Cấu hình vận hành", href: "/cau-hinh-van-hanh", perm: "automation:read", ready: true },
      { label: "Cài đặt", href: "/settings", perm: "system:read", ready: true, desc: "Thông tin trung tâm, thương hiệu." },
    ],
  },
  {
    key: "reports",
    label: "Báo cáo",
    items: [
      { label: "Báo cáo Lead", href: "/bao-cao/lead", perm: "report:read", ready: true, desc: "Phễu, tỉ lệ chuyển, theo sale/nguồn/cơ sở/tháng, rụng ở bậc nào." },
      { label: "Báo cáo trải nghiệm", href: "/bao-cao/trial", perm: "report:read", ready: true, desc: "Học thử → đăng ký; lấp đầy lớp trial." },
      { label: "Báo cáo đào tạo", href: "/bao-cao/dao-tao", perm: "report:read", ready: true, desc: "Chuyên cần theo lớp: buổi, đi học, vắng, chờ bù, đã bù." },
      { label: "Báo cáo trung tâm", href: "/bao-cao/trung-tam", perm: "report:read", ready: true, desc: "Doanh thu theo tháng/cơ sở, công nợ." },
      { label: "Hiệu suất giáo viên", href: "/bao-cao/hieu-suat-gv", perm: "report:read", ready: true, desc: "Buổi đã dạy, chuyên cần, điểm học bạ TB." },
      { label: "Cohort tiến độ", href: "/bao-cao/cohort", perm: "report:read", ready: true, desc: "Theo kỳ bắt đầu: hoàn thành / đang học / rút." },
      { label: "Churn / rời bỏ", href: "/bao-cao/churn", perm: "report:read", ready: true, desc: "Rời lớp theo tháng, theo cơ sở." },
      { label: "Doanh thu vs mục tiêu", href: "/bao-cao/doanh-thu", perm: "report:read", ready: true, desc: "Mục tiêu theo cơ sở/kỳ và thực đạt." },
      { label: "Sau go-live", href: "/bao-cao/sau-go-live", perm: "report:read", ready: true, desc: "Mức độ dùng hệ mới theo tuần: điểm danh đúng hạn, tự khớp chuyển khoản, hoá đơn, phụ huynh dùng cổng, OTP, tin gửi." },
      { label: "Đo pilot chat", href: "/bao-cao/chat-pilot", perm: "report:read", ready: true, desc: "PH trong nhóm, kích hoạt, đăng nhập, đọc ≤48h." },
    ],
  },
];

export const ALL_NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function findNavItem(pathname: string) {
  // khớp dài nhất (vd /leads/bulk-convert trước /leads)
  return [...ALL_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
