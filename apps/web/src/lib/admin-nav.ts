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
  /**
   * Tên icon lucide (kiểu kebab-case) theo đúng bản gốc — xem docs/GIAO-DIEN-GOC.md mục 5.
   * Là chuỗi chứ không phải component để menu đi qua được ranh giới server → client;
   * admin-shell.tsx tra bảng tên → component (import tĩnh, không phình bundle).
   */
  icon?: string;
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
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", ready: true },
      { label: "Hướng dẫn & đào tạo", href: "/huong-dan", icon: "book-open-check", ready: true, desc: "Bài hướng dẫn theo vai trò, có câu hỏi kiểm tra." },
      { label: "Bảo mật tài khoản", href: "/bao-mat", icon: "shield-check", ready: true, desc: "Xác thực 2 lớp bằng ứng dụng OTP." },
      { label: "CRM", href: "/crm", icon: "chart-column", perm: "lead:read", ready: true },
    ],
  },
  {
    key: "crm",
    label: "CRM & Tuyển sinh",
    items: [
      { label: "Leads", href: "/leads", icon: "users", perm: "lead:read", ready: true },
      { label: "Nhập khách hàng", href: "/nhap-khach-hang", icon: "user-plus", perm: "lead:create", ready: true },
      { label: "Nhập lead từ file", href: "/leads/import", icon: "upload", perm: "lead:create", ready: true, desc: "Đọc CSV / dán từ Excel ngay trên máy: 3 nhóm Mới / Trùng / Lỗi, gộp theo SĐT, cột Đè." },
      { label: "Nhập khách đã đăng ký", href: "/leads/import/registered", icon: "upload", perm: "lead:create", ready: true, desc: "Mỗi dòng một học viên đã đăng ký; token ĐãĐóng= / HạnĐợt2= vào ghi chú của bé." },
      { label: "Chốt hàng loạt", href: "/leads/bulk-convert", icon: "workflow", perm: "enrollment:create", ready: true },
      { label: "Quản lý chia lead", href: "/quan-ly-chia-lead", icon: "list-ordered", perm: "lead:update", ready: true },
      { label: "Lịch sử thay đổi pool", href: "/quan-ly-chia-lead/lich-su", icon: "history", perm: "lead:read", ready: true, desc: "Ai bật/tắt ai, chỉnh lượt bao nhiêu, vì sao." },
      { label: "Bàn giao lead", href: "/ban-giao-lead", icon: "arrow-left-right", perm: "lead:update", ready: true },
      { label: "Lead lâu ngày chưa chăm", href: "/lead-nguoi", icon: "alarm-clock", perm: "lead:read", ready: true },
      { label: "Chuyển lead liên CS", href: "/leads/bao-cao-chuyen", icon: "workflow", perm: "lead:read", ready: true },
      { label: "Nguồn giới thiệu", href: "/affiliates", icon: "share-2", perm: "affiliate:read", ready: true, desc: "Affiliate / người giới thiệu: mã giới thiệu, lead mang về, tỉ lệ chốt, thưởng khi đơn học phí đầu thu đủ, quản lý duyệt → kế toán chi." },
      { label: "Messenger CRM", href: "/crm/messenger", icon: "messages-square", perm: "message:read", ready: true, desc: "Hộp thư Facebook Messenger gắn với lead: nhận tin, trả lời, tạo lead từ hội thoại, SLA 'chưa trả lời tin nhắn'." },
      { label: "Lớp Trial", href: "/lop-trial", icon: "flask-conical", perm: "trials:view", ready: true, desc: "Lớp trải nghiệm nhiều buổi: tạo lớp → thêm buổi → xếp học viên → điểm danh. Tên lớp tự đặt; ngày/giờ/phòng/GV theo từng buổi; đổi lịch hoặc huỷ buổi bắt buộc ghi lý do và gửi thẳng cho GV." },
      { label: "Học thử buổi lẻ", href: "/lop-trial/buoi-le", icon: "flask-conical", perm: "lead:read", ready: true, desc: "Xếp lead vào một buổi của lớp chính quy để học thử; đổi lịch phải ghi lý do và báo GV, kết quả buổi thử cập nhật trạng thái lead." },
    ],
  },
  {
    key: "students",
    label: "Học viên & Đăng ký học",
    items: [
      { label: "Học viên", href: "/students", icon: "graduation-cap", perm: "student:read", ready: true },
      { label: "Tài khoản phụ huynh", href: "/students/tai-khoan", icon: "key-round", perm: "parent_account:read", ready: true },
      { label: "Thẻ học viên (QR)", href: "/the-hoc-vien", icon: "id-card", perm: "student:read", ready: true, desc: "In thẻ QR để điểm danh bằng cách quét trong app giáo viên; cấp lại thẻ khi mất." },
      { label: "Đăng ký học", href: "/enrollments", icon: "clipboard-list", perm: "enrollment:read", ready: true },
      { label: "Chuyển lớp / cơ sở", href: "/chuyen-lop", icon: "arrow-left-right", perm: "enrollment:update", ready: true },
      { label: "Sắp hết khoá", href: "/students/sap-het-khoa", icon: "graduation-cap", perm: "enrollment:read", ready: true },
      { label: "Hoàn thành khoá & chứng chỉ", href: "/hoan-thanh-khoa", icon: "award", perm: "enrollment:read", ready: true },
      { label: "Học bạ", href: "/hoc-ba", icon: "scroll-text", perm: "report_card:read", ready: true },
      { label: "Học bạ năng lực", href: "/report-cards", icon: "notebook-pen", perm: "report_card:read", ready: true },
      { label: "SataCoin", href: "/satacoin", icon: "coins", perm: "coin:read", ready: true, desc: "Sổ xu thưởng chỉ thêm: thưởng theo hạn mức, thu hồi có lý do, đổi quà qua duyệt." },
    ],
  },
  {
    key: "classes",
    label: "Lớp học & Lịch học",
    items: [
      { label: "Lớp học", href: "/classes", icon: "book-open", perm: "class:read", ready: true },
      { label: "Nhóm lớp", href: "/class-groups", icon: "layers", perm: "class:read", ready: true, desc: "Gom lớp thành nhóm (khối) để lọc và báo cáo; mã hiển thị, cơ sở, số lớp, bật/tắt." },
      { label: "Buổi học", href: "/sessions", icon: "calendar-days", perm: "session:read", ready: true },
      { label: "Kiểm tra lịch buổi", href: "/classes/kiem-tra-lich", icon: "calendar-search", perm: "class:read", ready: true, desc: "Đối chiếu dãy buổi với khai giảng + lịch học; xếp lại cả dãy cho lớp bị neo sai." },
      { label: "Lịch tổng", href: "/lich", icon: "calendar-check", perm: "session:read", ready: true },
      { label: "Điểm danh", href: "/attendance", icon: "clipboard-check", perm: "attendance:read", ready: true },
      { label: "Ảnh lớp học", href: "/media", icon: "image", perm: "media:read", ready: true },
      { label: "Duyệt ảnh", href: "/duyet-media", icon: "check-check", perm: "media:update", ready: true },
      { label: "Học bù", href: "/hoc-bu", icon: "refresh-cw", perm: "makeup:read", ready: true },
      { label: "Cơ sở", href: "/centers", icon: "map-pin", perm: "center:read", ready: true },
      { label: "Phòng học", href: "/rooms", icon: "door-open", perm: "class:read", ready: true },
    ],
  },
  {
    key: "lms",
    label: "LMS / Học liệu",
    items: [
      { label: "Chương trình học", href: "/curriculums", icon: "book-marked", perm: "curriculum:read", ready: true, desc: "Giáo trình theo khoá: bài học, mục tiêu, học cụ." },
      { label: "Đề xuất sửa giáo án", href: "/de-xuat-giao-an", icon: "clipboard-pen", perm: "curriculum:read", ready: true, desc: "GV đề xuất chỉnh bài học; Đào tạo duyệt." },
      { label: "Khoá học", href: "/courses", icon: "boxes", perm: "course:read", ready: true, desc: "Khoá dạy: mã, độ tuổi, số buổi, học phí niêm yết." },
      { label: "Gói khoá học", href: "/course-packages", icon: "package-open", perm: "course:read", ready: true, desc: "Gói bán cho khách: số buổi, giá niêm yết / ưu đãi, gói nổi bật — gợi ý khi tạo đơn và chốt lead." },
      { label: "Khoá tiên quyết", href: "/course-prerequisites", icon: "workflow", perm: "course:read", ready: true, desc: "Khoá phải học trước; chặn ghi danh khi chưa đạt." },
      { label: "Tài liệu giảng dạy", href: "/documents", icon: "file-text", perm: "document:read", ready: true, desc: "Kho tài liệu theo khoá / bài, phiên bản, nhật ký mở / tải." },
      { label: "Bài tập về nhà", href: "/assignments", icon: "notebook-pen", perm: "assignment:read", ready: true, desc: "Giao bài, phụ huynh nộp qua link, chấm, trả lại, thưởng xu; mẫu bài tập." },
      { label: "Tài liệu lớp tôi", href: "/teaching-materials", icon: "presentation", perm: "class:read", ready: true, desc: "Tài liệu của các lớp GV đang dạy." },
      { label: "SCORM / Bài giảng tương tác", href: "/scorm", icon: "package", perm: "document:read", ready: true, desc: "Gói SCORM / bài giảng tương tác." },
    ],
  },
  {
    key: "care",
    label: "CSKH & Phụ huynh",
    items: [
      { label: "Tin nhắn", href: "/tin-nhan", icon: "message-circle", perm: "message:read", ready: true, desc: "Tin nhắn PH ↔ trung tâm/GV." },
      { label: "Quản trị hội thoại", href: "/hoi-thoai", icon: "messages-square", perm: "message:audit", ready: true, desc: "Giám sát hội thoại, đối soát." },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", icon: "message-square-plus", perm: "care:read", ready: true, desc: "7 loại yêu cầu (nghỉ, bảo lưu, đổi lịch…) có duyệt." },
      { label: "Đánh giá PH", href: "/parent-feedback", icon: "star", perm: "care:read", ready: true, desc: "Đánh giá buổi học/GV từ PH." },
      { label: "Đánh giá & Khảo sát", href: "/evaluations", icon: "clipboard-pen", perm: "care:read", ready: true, desc: "Trình dựng phiếu (chấm sao, một/nhiều lựa chọn, văn bản, tải ảnh), nhóm tiêu chí, đợt mở–đóng–lưu trữ." },
      { label: "Khảo sát / NPS", href: "/khao-sat", icon: "gauge", perm: "care:read", ready: true, desc: "Bản cũ: khảo sát theo mốc, điểm NPS — đang được thay dần." },
      { label: "Thông báo PH", href: "/notifications", icon: "bell", perm: "care:read", ready: true, desc: "Thông báo gửi PH (in-app / ZNS / email) và trạng thái gửi." },
      { label: "Trung tâm thông báo", href: "/thong-bao", icon: "bell-ring", ready: true, desc: "Mọi thông báo của tôi: lọc theo nhóm và mức, việc Cần thực hiện, đánh dấu đã đọc." },
      { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", icon: "triangle-alert", perm: "care:read", ready: true },
      { label: "Chăm sóc HV", href: "/cham-soc-hv", icon: "heart-handshake", perm: "care:read", ready: true },
      { label: "Sinh nhật HV", href: "/sinh-nhat", icon: "cake", perm: "care:read", ready: true, desc: "Học viên sinh nhật trong tuần/tháng, gửi lời chúc." },
    ],
  },
  {
    key: "hr",
    label: "Nhân sự & Giáo viên",
    items: [
      { label: "Giáo viên", href: "/teachers", icon: "user-cog", perm: "teacher:read", ready: true, desc: "Hồ sơ GV, ngạch, tải dạy, lịch dạy." },
      { label: "Nhân sự", href: "/nhan-su", icon: "id-card", perm: "staff:read", ready: true, desc: "Hồ sơ nhân sự; lương/BHXH chỉ HR, Kế toán, Super Admin thấy." },
      { label: "Vị trí công việc", href: "/nhan-su/vi-tri", icon: "briefcase", perm: "staff:read", ready: true, desc: "Bộ vai trò gắn vào vị trí, phân công có hiệu lực, điều động tác nghiệp." },
      { label: "Chấm công", href: "/cham-cong", icon: "clock", perm: "timesheet:read", ready: true, desc: "Bảng công theo ca đã xếp, cờ cần rà, kỳ công, ghi đè có lý do." },
      { label: "Lưới phân ca", href: "/cham-cong/phan-ca", icon: "table-properties", perm: "timesheet:read", ready: true, desc: "Lưới tháng, khung ca tuần, chạy thử rồi ghi thật, nhập lịch từ Sheet." },
      { label: "Kỳ công & chốt", href: "/cham-cong/ky-cong", icon: "calendar-clock", perm: "timesheet:read", ready: true, desc: "Tổng công cả kỳ, công chuẩn, chốt kỳ / mở lại kỳ có lý do." },
      { label: "Mã ca", href: "/cham-cong/danh-muc-ca", icon: "tags", perm: "timesheet:read", ready: true, desc: "Danh mục mã ca: loại ca, số công, đoạn giờ, nơi làm." },
      { label: "Điểm chấm công", href: "/cham-cong/diem-cham", icon: "map-pinned", perm: "timesheet:read", ready: true, desc: "Mã QR quầy, bán kính định vị, đời khoá." },
      { label: "Màn hình QR", href: "/cham-cong/man-hinh", icon: "monitor", perm: "timesheet:read", ready: true, desc: "Trình chiếu mã QR chấm công tại quầy." },
      { label: "Duyệt đơn từ", href: "/don-tu", icon: "clipboard-list", perm: "timesheet:read", ready: true, desc: "10 loại đơn; duyệt là áp ngay lên lịch ca và công." },
      { label: "Của tôi", href: "/cham-cong/lich-ca", icon: "user-round", ready: true, desc: "Lịch ca, công tháng, làm đơn, chấm công bằng QR." },
      { label: "Tuyển dụng", href: "/jobs", icon: "briefcase", perm: "recruit:read", ready: true, desc: "Tin tuyển dụng và ứng viên." },
    ],
  },
  {
    key: "inventory",
    label: "Sản phẩm & Kho",
    items: [
      { label: "Học cụ (Kits)", href: "/kits", icon: "package", perm: "inventory:read", ready: true, desc: "Bộ học cụ theo khoá, định mức linh kiện, đóng bộ, cấp cho học viên." },
      { label: "Sản phẩm bán/thuê", href: "/products", icon: "package-2", perm: "inventory:read", ready: true, desc: "Danh mục hàng, giá bán / thuê / cọc; bán và cho thuê tự lập đơn + xuất kho." },
      { label: "Tồn kho", href: "/inventory/dashboard", icon: "boxes", perm: "inventory:read", ready: true, desc: "Tồn theo cơ sở, nhập / cấp phát / chuyển kho, thẻ kho, cho thuê." },
      { label: "Kiểm kê kho", href: "/inventory/audit", icon: "clipboard-check", perm: "inventory:read", ready: true, desc: "Phiếu kiểm kê, chênh lệch." },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      { label: "Đơn hàng", href: "/orders", icon: "shopping-bag", perm: "finance:read", ready: true, desc: "Đơn học phí/sản phẩm, kế hoạch trả góp, QR thanh toán." },
      { label: "Thanh toán", href: "/payments", icon: "credit-card", perm: "finance:read", ready: true, desc: "Sale ghi nhận → Kế toán xác nhận." },
      { label: "Công nợ", href: "/cong-no", icon: "wallet", perm: "finance:read", ready: true, desc: "Công nợ theo học viên / cơ sở." },
      { label: "Thiếu học phí", href: "/thieu-hoc-phi", icon: "wallet", perm: "finance:read", ready: true, desc: "Ghi danh đang học nhưng chưa đủ học phí." },
      { label: "Nhập giao dịch cũ", href: "/nhap-giao-dich-cu", icon: "file-spreadsheet", perm: "finance:confirm", ready: true, desc: "Import giao dịch từ hệ cũ / sổ sách." },
      { label: "Biến động số dư", href: "/bien-dong-so-du", icon: "wallet", perm: "finance:approve", ready: true, desc: "Webhook SePay, đối khớp tự động với đơn." },
      { label: "Hoàn tiền", href: "/hoan-tien", icon: "undo-2", perm: "finance:read", ready: true, desc: "Hoàn theo số buổi chưa học, có duyệt." },
      { label: "Hoá đơn điện tử", href: "/hoa-don", icon: "receipt", perm: "finance:read", ready: true, desc: "Lập hoá đơn tại thời điểm thu tiền, học phí không chịu thuế (KCT), điều chỉnh / thay thế thay vì huỷ, đối soát thu – xuất hoá đơn." },
      { label: "Phương thức TT", href: "/payment-methods", icon: "landmark", perm: "finance:read", ready: true, desc: "Tài khoản nhận tiền theo cơ sở." },
      { label: "Hoa hồng", href: "/crm/commission", icon: "coins", perm: "finance:read", ready: true, desc: "Hoa hồng sale / người giới thiệu." },
    ],
  },
  {
    key: "web",
    label: "Website & Marketing",
    items: [
      { label: "Tin tức", href: "/news", icon: "newspaper", perm: "site:read", ready: true, desc: "Bài viết website." },
      { label: "Nội dung website", href: "/site-content", icon: "image", perm: "site:read", ready: true, desc: "Ảnh/tiêu đề từng trang công khai; lưu xong tự làm mới trang." },
      { label: "Tracking", href: "/marketing", icon: "chart-column", perm: "marketing:read", ready: true, desc: "Phễu, UTM, trạng thái Meta Pixel/CAPI, GA4." },
      { label: "Funnel Marketing", href: "/marketing/funnel", icon: "workflow", perm: "marketing:read", ready: true, desc: "Phễu marketing theo chiến dịch." },
    ],
  },
  {
    key: "email",
    label: "Email & OTP",
    items: [
      { label: "Email Templates", href: "/email-templates", icon: "mail", perm: "system:read", ready: true, desc: "Mẫu email theo sự kiện." },
      { label: "Email Logs", href: "/email-logs", icon: "send", perm: "system:read", ready: true, desc: "Nhật ký gửi email." },
      { label: "OTP Logs", href: "/otp-logs", icon: "message-circle", perm: "system:read", ready: true, desc: "Nhật ký OTP kích hoạt / quên mật khẩu." },
    ],
  },
  {
    key: "system",
    label: "Hệ thống & Cấu hình",
    items: [
      { label: "Tài khoản", href: "/users", icon: "key-round", perm: "system:read", ready: true, desc: "Tài khoản đăng nhập, vai trò theo cơ sở, vai trò chính, khoá/mở." },
      { label: "Nhóm người dùng", href: "/user-groups", icon: "users-round", perm: "system:read", ready: true, desc: "Nhóm nhận thông báo nội bộ và cấp quyền theo nhóm (không sửa vai trò)." },
      { label: "Vai trò & quyền", href: "/roles", icon: "key-round", perm: "system:read", ready: true, desc: "Ma trận vai trò × quyền (đọc từ policy engine)." },
      { label: "Cây tổ chức", href: "/to-chuc", icon: "network", perm: "system:read", ready: true, desc: "Gốc hệ thống → hội sở → khối vùng → phòng ban → cơ sở → điểm dạy; pháp nhân và quan hệ sở hữu / nhượng quyền / liên kết." },
      { label: "Nhượng quyền", href: "/nhuong-quyen", icon: "store", perm: "tenant:read", ready: true, desc: "Danh sách trung tâm nhượng quyền kèm số liệu tổng hợp, tuỳ chọn quyền riêng tư của từng trung tâm, và nút tạo trung tâm mới từ mô hình mẫu chỉ một thao tác." },
      { label: "Bảo mật hệ thống", href: "/bao-mat-he-thong", icon: "shield-alert", perm: "system:read", ready: true, desc: "Khuyến nghị bảo mật, tài khoản cần rà soát, đăng nhập sai, nhật ký đăng nhập." },
      { label: "Audit Log", href: "/audit-log", icon: "scroll-text", perm: "audit:read", ready: true, desc: "Nhật ký thao tác bất biến, lọc theo cơ sở/module/người." },
      { label: "Tuân thủ dữ liệu", href: "/compliance", icon: "triangle-alert", perm: "compliance:read", ready: true, desc: "Luật BVDLCN 2025 / NĐ 356: đồng ý, yêu cầu của chủ thể dữ liệu, sổ sự cố, lưu giữ." },
      { label: "Chạy lại webhook", href: "/crm/webhook-replay", icon: "refresh-cw", perm: "system:read", ready: true, desc: "Xem và chạy lại webhook lỗi." },
      { label: "Tích hợp", href: "/tich-hop", icon: "plug", perm: "system:read", ready: true, desc: "SePay, email, Zalo ZNS, rate limit, MISA AMIS, OTP, cron, form công khai; log lỗi nhà cung cấp." },
      { label: "Chuyển đổi dữ liệu", href: "/chuyen-doi", icon: "database", perm: "migration:read", ready: true, desc: "Nhập học viên, phụ huynh, ghi danh từ hệ cũ; đối soát số liệu tổng và từng học viên." },
      { label: "Go-live cơ sở", href: "/go-live", icon: "rocket", perm: "cutover:read", ready: true, desc: "Chuẩn bị → chạy song song (sổ đối chiếu hằng ngày) → chính thức → hệ cũ chỉ đọc." },
      { label: "Vận hành & sao lưu", href: "/van-hanh", icon: "server-cog", perm: "system:read", ready: true, desc: "Sức khoẻ hệ thống, biến môi trường, worker, sao lưu / khôi phục, hàng đợi, danh mục go-live." },
      { label: "Cấu hình vận hành", href: "/cau-hinh-van-hanh", icon: "sliders-horizontal", perm: "automation:read", ready: true },
      { label: "Cài đặt", href: "/settings", icon: "settings", perm: "system:read", ready: true, desc: "Thông tin trung tâm, thương hiệu." },
    ],
  },
  {
    key: "reports",
    label: "Báo cáo",
    items: [
      { label: "Báo cáo Lead", href: "/bao-cao/lead", icon: "chart-column", perm: "report:read", ready: true, desc: "Phễu, tỉ lệ chuyển, theo sale/nguồn/cơ sở/tháng, rụng ở bậc nào." },
      { label: "Báo cáo trải nghiệm", href: "/bao-cao/trial", icon: "flask-conical", perm: "report:read", ready: true, desc: "Học thử → đăng ký; lấp đầy lớp trial." },
      { label: "Báo cáo đào tạo", href: "/bao-cao/dao-tao", icon: "book-open", perm: "report:read", ready: true, desc: "Chuyên cần theo lớp: buổi, đi học, vắng, chờ bù, đã bù." },
      { label: "Báo cáo trung tâm", href: "/bao-cao/trung-tam", icon: "coins", perm: "report:read", ready: true, desc: "Doanh thu theo tháng/cơ sở, công nợ." },
      { label: "Hiệu suất giáo viên", href: "/bao-cao/hieu-suat-gv", icon: "graduation-cap", perm: "report:read", ready: true, desc: "Buổi đã dạy, chuyên cần, điểm học bạ TB." },
      { label: "Cohort tiến độ", href: "/bao-cao/cohort", icon: "users", perm: "report:read", ready: true, desc: "Theo kỳ bắt đầu: hoàn thành / đang học / rút." },
      { label: "Churn / rời bỏ", href: "/bao-cao/churn", icon: "chart-column", perm: "report:read", ready: true, desc: "Rời lớp theo tháng, theo cơ sở." },
      { label: "Doanh thu vs mục tiêu", href: "/bao-cao/doanh-thu", icon: "coins", perm: "report:read", ready: true, desc: "Mục tiêu theo cơ sở/kỳ và thực đạt." },
      { label: "Sau go-live", href: "/bao-cao/sau-go-live", icon: "chart-line", perm: "report:read", ready: true, desc: "Mức độ dùng hệ mới theo tuần: điểm danh đúng hạn, tự khớp chuyển khoản, hoá đơn, phụ huynh dùng cổng, OTP, tin gửi." },
      { label: "Đo pilot chat", href: "/bao-cao/chat-pilot", icon: "messages-square", perm: "report:read", ready: true, desc: "PH trong nhóm, kích hoạt, đăng nhập, đọc ≤48h." },
    ],
  },
];

export const ALL_NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function findNavItem(pathname: string) {
  // khớp dài nhất (vd /leads/bulk-convert trước /leads)
  return [...ALL_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
