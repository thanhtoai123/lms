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
      { label: "Nguồn giới thiệu", href: "/affiliates", perm: "lead:read", phase: 4, desc: "Affiliate / người giới thiệu: mã giới thiệu, lead mang về, tỉ lệ chốt, hoa hồng phải trả (nối sang Tài chính → Hoa hồng)." },
      { label: "Messenger CRM", href: "/crm/messenger", perm: "lead:read", phase: 5, desc: "Hộp thư Facebook Messenger gắn với lead: nhận tin, trả lời, tạo lead từ hội thoại, SLA 'chưa trả lời tin nhắn'." },
      { label: "Lớp Trial", href: "/lop-trial", perm: "lead:read", ready: true, desc: "Lớp học thử (buổi lẻ): xếp lead vào buổi thử, đổi lịch phải ghi lý do và báo GV, kết quả buổi thử cập nhật trạng thái lead." },
    ],
  },
  {
    key: "students",
    label: "Học viên & Đăng ký học",
    items: [
      { label: "Học viên", href: "/students", perm: "student:read", ready: true },
      { label: "Tài khoản phụ huynh", href: "/students/tai-khoan", perm: "parent_account:read", ready: true },
      { label: "Đăng ký học", href: "/enrollments", perm: "enrollment:read", ready: true },
      { label: "Chuyển lớp / cơ sở", href: "/chuyen-lop", perm: "enrollment:update", ready: true },
      { label: "Sắp hết khoá", href: "/students/sap-het-khoa", perm: "enrollment:read", ready: true },
      { label: "Hoàn thành khoá & chứng chỉ", href: "/hoan-thanh-khoa", perm: "enrollment:read", ready: true },
      { label: "Học bạ", href: "/hoc-ba", perm: "report_card:read", ready: true },
      { label: "Học bạ năng lực", href: "/report-cards", perm: "report_card:read", ready: true },
      { label: "SataCoin", href: "/satacoin", perm: "student:read", phase: 5, desc: "Sổ cái điểm thưởng bất biến: cộng/trừ có lý do, đổi quà." },
    ],
  },
  {
    key: "classes",
    label: "Lớp học & Lịch học",
    items: [
      { label: "Lớp học", href: "/classes", perm: "class:read", ready: true },
      { label: "Buổi học", href: "/sessions", perm: "session:read", ready: true },
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
      { label: "Đề xuất sửa giáo án", href: "/de-xuat-giao-an", perm: "curriculum:read", phase: 5, desc: "GV đề xuất chỉnh bài học; Đào tạo duyệt." },
      { label: "Khoá học", href: "/courses", perm: "course:read", ready: true, desc: "Khoá dạy: mã, độ tuổi, số buổi, học phí niêm yết." },
      { label: "Khoá tiên quyết", href: "/course-prerequisites", perm: "course:read", ready: true, desc: "Khoá phải học trước; chặn ghi danh khi chưa đạt." },
      { label: "Tài liệu giảng dạy", href: "/documents", perm: "document:read", phase: 5, desc: "Kho tài liệu theo khoá/bài." },
      { label: "Bài tập về nhà", href: "/assignments", perm: "assignment:read", phase: 5, desc: "Giao bài, nộp bài, chấm; mẫu bài tập." },
      { label: "Tài liệu lớp tôi", href: "/teaching-materials", perm: "class:read", phase: 5, desc: "Tài liệu của các lớp GV đang dạy." },
      { label: "SCORM / Bài giảng tương tác", href: "/scorm", perm: "document:read", phase: 5, desc: "Gói SCORM / bài giảng tương tác." },
    ],
  },
  {
    key: "care",
    label: "CSKH & Phụ huynh",
    items: [
      { label: "Tin nhắn", href: "/tin-nhan", perm: "care:read", phase: 5, desc: "Tin nhắn PH ↔ trung tâm/GV." },
      { label: "Quản trị hội thoại", href: "/hoi-thoai", perm: "care:read", phase: 5, desc: "Giám sát hội thoại, đối soát." },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", perm: "care:read", phase: 4, desc: "7 loại yêu cầu (nghỉ, bảo lưu, đổi lịch…) có duyệt." },
      { label: "Đánh giá PH", href: "/parent-feedback", perm: "care:read", phase: 4, desc: "Đánh giá buổi học/GV từ PH." },
      { label: "Khảo sát / NPS", href: "/khao-sat", perm: "care:read", phase: 4, desc: "Khảo sát theo mốc, điểm NPS." },
      { label: "Thông báo PH", href: "/notifications", perm: "care:read", phase: 4, desc: "Thông báo gửi PH (in-app / ZNS / email) và trạng thái gửi." },
      { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", perm: "care:read", ready: true },
      { label: "Chăm sóc HV", href: "/cham-soc-hv", perm: "care:read", ready: true },
      { label: "Sinh nhật HV", href: "/sinh-nhat", perm: "care:read", phase: 4, desc: "Học viên sinh nhật trong tuần/tháng, gửi lời chúc." },
    ],
  },
  {
    key: "hr",
    label: "Nhân sự & Giáo viên",
    items: [
      { label: "Giáo viên", href: "/teachers", perm: "teacher:read", ready: true, desc: "Hồ sơ GV, ngạch, tải dạy, lịch dạy." },
      { label: "Nhân sự", href: "/nhan-su", perm: "staff:read", phase: 4, desc: "Hồ sơ nhân sự; lương/BHXH chỉ HR, Kế toán, Super Admin thấy." },
      { label: "Vị trí công việc", href: "/nhan-su/vi-tri", perm: "staff:read", phase: 4, desc: "Chính / kiêm nhiệm / uỷ quyền, có hiệu lực." },
      { label: "Chấm công", href: "/cham-cong", perm: "timesheet:read", phase: 4, desc: "Bảng công ngày, kỳ công, phân ca, quét có bán kính, ghi đè có lý do." },
      { label: "Duyệt đơn từ", href: "/don-tu", perm: "timesheet:read", phase: 4, desc: "Đơn nghỉ, đi muộn, OT chờ duyệt." },
      { label: "Của tôi", href: "/cham-cong/lich-ca", phase: 4, desc: "Lịch ca và công của tôi." },
      { label: "Tuyển dụng", href: "/jobs", perm: "staff:read", phase: 5, desc: "Tin tuyển dụng và ứng viên." },
    ],
  },
  {
    key: "inventory",
    label: "Sản phẩm & Kho",
    items: [
      { label: "Học cụ (Kits)", href: "/kits", perm: "inventory:read", phase: 5, desc: "Bộ học cụ theo khoá." },
      { label: "Sản phẩm bán/thuê", href: "/products", perm: "inventory:read", phase: 5, desc: "Sản phẩm bán / cho thuê." },
      { label: "Tồn kho", href: "/inventory/dashboard", perm: "inventory:read", phase: 5, desc: "Tồn theo cơ sở, nhập/xuất." },
      { label: "Kiểm kê kho", href: "/inventory/audit", perm: "inventory:read", phase: 5, desc: "Phiếu kiểm kê, chênh lệch." },
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
      { label: "Phương thức TT", href: "/payment-methods", perm: "finance:read", ready: true, desc: "Tài khoản nhận tiền theo cơ sở." },
      { label: "Hoa hồng", href: "/crm/commission", perm: "finance:read", ready: true, desc: "Hoa hồng sale / người giới thiệu." },
    ],
  },
  {
    key: "web",
    label: "Website & Marketing",
    items: [
      { label: "Tin tức", href: "/news", perm: "site:read", phase: 5, desc: "Bài viết website." },
      { label: "Nội dung website", href: "/site-content", perm: "site:read", phase: 5, desc: "Ảnh/tiêu đề từng trang công khai; lưu xong tự làm mới trang." },
      { label: "Tracking", href: "/marketing", perm: "marketing:read", phase: 5, desc: "Phễu, UTM, trạng thái Meta Pixel/CAPI, GA4." },
      { label: "Funnel Marketing", href: "/marketing/funnel", perm: "marketing:read", phase: 5, desc: "Phễu marketing theo chiến dịch." },
    ],
  },
  {
    key: "email",
    label: "Email & OTP",
    items: [
      { label: "Email Templates", href: "/email-templates", perm: "system:read", phase: 4, desc: "Mẫu email theo sự kiện." },
      { label: "Email Logs", href: "/email-logs", perm: "system:read", phase: 4, desc: "Nhật ký gửi email." },
      { label: "OTP Logs", href: "/otp-logs", perm: "system:read", phase: 4, desc: "Nhật ký OTP kích hoạt / quên mật khẩu." },
    ],
  },
  {
    key: "system",
    label: "Hệ thống & Cấu hình",
    items: [
      { label: "Tài khoản", href: "/users", perm: "system:read", ready: true, desc: "Tài khoản đăng nhập, vai trò theo cơ sở, vai trò chính, khoá/mở." },
      { label: "Nhóm người dùng", href: "/user-groups", perm: "system:read", phase: 4, desc: "Nhóm để gán quyền/nhận thông báo." },
      { label: "Vai trò & quyền", href: "/roles", perm: "system:read", ready: true, desc: "Ma trận vai trò × quyền (đọc từ policy engine)." },
      { label: "Cây tổ chức", href: "/to-chuc", perm: "system:read", phase: 4, desc: "Khu vực → cơ sở → phòng ban." },
      { label: "Audit Log", href: "/audit-log", perm: "audit:read", ready: true, desc: "Nhật ký thao tác bất biến, lọc theo cơ sở/module/người." },
      { label: "Tuân thủ dữ liệu", href: "/compliance", perm: "system:read", phase: 5, desc: "NĐ13: đồng ý, yêu cầu truy cập/xoá dữ liệu." },
      { label: "Chạy lại webhook", href: "/crm/webhook-replay", perm: "system:read", phase: 4, desc: "Xem và chạy lại webhook lỗi." },
      { label: "Tích hợp", href: "/tich-hop", perm: "system:read", phase: 4, desc: "Zalo OA/ZNS, SePay, MISA, Meta, GA4." },
      { label: "Cấu hình vận hành", href: "/cau-hinh-van-hanh", perm: "automation:read", ready: true },
      { label: "Cài đặt", href: "/settings", perm: "system:read", phase: 4, desc: "Thông tin trung tâm, thương hiệu." },
    ],
  },
  {
    key: "reports",
    label: "Báo cáo",
    items: [
      { label: "Báo cáo Lead", href: "/bao-cao/lead", perm: "report:read", ready: true, desc: "Phễu, tỉ lệ chuyển, theo sale/nguồn/cơ sở/tháng, rụng ở bậc nào." },
      { label: "Báo cáo trải nghiệm", href: "/bao-cao/trial", perm: "report:read", ready: true, desc: "Học thử → đăng ký; lấp đầy lớp trial." },
      { label: "Báo cáo đào tạo", href: "/bao-cao/dao-tao", perm: "report:read", ready: true, desc: "Chuyên cần theo lớp: buổi, đi học, vắng, chờ bù, đã bù." },
      { label: "Báo cáo trung tâm", href: "/bao-cao/trung-tam", perm: "report:read", phase: 4, desc: "Doanh thu theo tháng/cơ sở, công nợ." },
      { label: "Hiệu suất giáo viên", href: "/bao-cao/hieu-suat-gv", perm: "report:read", ready: true, desc: "Buổi đã dạy, chuyên cần, điểm học bạ TB." },
      { label: "Cohort tiến độ", href: "/bao-cao/cohort", perm: "report:read", phase: 5, desc: "Theo kỳ bắt đầu: hoàn thành / đang học / rút." },
      { label: "Churn / rời bỏ", href: "/bao-cao/churn", perm: "report:read", phase: 5, desc: "Rời lớp theo tháng, theo cơ sở." },
      { label: "Doanh thu vs mục tiêu", href: "/bao-cao/doanh-thu", perm: "report:read", phase: 4, desc: "Mục tiêu theo cơ sở/kỳ và thực đạt." },
      { label: "Đo pilot chat", href: "/bao-cao/chat-pilot", perm: "report:read", phase: 5, desc: "PH trong nhóm, kích hoạt, đăng nhập, đọc ≤48h." },
    ],
  },
];

export const ALL_NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function findNavItem(pathname: string) {
  // khớp dài nhất (vd /leads/bulk-convert trước /leads)
  return [...ALL_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
