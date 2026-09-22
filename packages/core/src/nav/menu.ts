/**
 * CÂY MENU KHU QUẢN TRỊ — một nguồn duy nhất (docs/KIEN-TRUC-MENU.md).
 *
 * Nguyên tắc:
 *  - Menu theo NHIỆM VỤ của người dùng, không theo bảng dữ liệu; mỗi nhóm ≤ 9 mục, sâu tối đa 2 cấp.
 *  - Một khái niệm — một nơi: các trang cùng một thực thể / nhiệm vụ gom thành MỘT mục "trang trung tâm"
 *    (hub) có dải chip `tabs`. Mỗi chip vẫn giữ nguyên đường dẫn cũ của nó (bookmark không gãy);
 *    chỉ những trang bị thay thế thật sự mới chuyển hướng (`LEGACY_REDIRECTS`).
 *  - Công cụ kỹ thuật / dùng một lần nằm trong nhóm `tools` (thu gọn mặc định).
 *  - `roles` của nhóm chỉ là GỢI Ý HIỂN THỊ (nhóm mở sẵn theo vai trò); hàng rào thật vẫn là quyền
 *    (`perm`) — và service vẫn kiểm tra chặt bằng authorize().
 *
 * File này thuần dữ liệu + hàm thuần (không DOM, không React) để kiểm thử được ở `menu.test.ts`
 * và dùng chung cho: sidebar (apps/web), bảng lệnh Ctrl+K, next.config (chuyển hướng) và bộ kiểm thử
 * PowerShell (`scripts/kiem-thu/menu-manifest.json`).
 */
import type { Permission, Role } from "../policy/policy.js";

/** Một quyền, hoặc mảng quyền = phải có ĐỦ tất cả */
export type NavPerm = Permission | readonly Permission[];

/** Chip của một trang trung tâm */
export interface NavTab {
  label: string;
  /** Đường dẫn, có thể kèm truy vấn chế độ xem (vd `/ho-so-hoc-tap?xem=hoc-ba-moc`) */
  href: string;
  perm?: NavPerm;
  desc?: string;
}

export interface NavItem {
  label: string;
  /** Mục có `tabs`: href = href của chip đầu tiên (được thay bằng chip đầu tiên người dùng có quyền) */
  href: string;
  perm?: NavPerm;
  /** Mặc định đã xây (true). `false` → mở trang "đang xây dựng" (app/(admin)/[...slug]). */
  ready?: boolean;
  /** Giai đoạn dự kiến trong docs/ROADMAP.md (chỉ dùng khi ready = false) */
  phase?: 3 | 4 | 5;
  desc?: string;
  /** Tên icon lucide kebab-case — admin-shell.tsx tra bảng tên → component */
  icon?: string;
  /** Trang trung tâm: các chế độ xem / trang con cùng nhiệm vụ */
  tabs?: NavTab[];
  /** Tiền tố đường dẫn chi tiết thuộc mục này (để tô sáng menu), vd `/report-cards` */
  match?: string[];
  /** Từ khoá thêm cho ô tìm menu / Ctrl+K (không dấu) */
  keywords?: string;
}

export interface NavGroup {
  key: string;
  label: string;
  /** Vai trò mà nhóm này MỞ SẴN (lọc hiển thị, không phải phân quyền) */
  roles: readonly Role[];
  /** Nhóm công cụ kỹ thuật — chỉ quản trị viên cần, luôn thu gọn trừ khi đang ở trong */
  tech?: boolean;
  items: NavItem[];
}

const MANAGERS: readonly Role[] = ["CENTER_MANAGER"];
const ALL_STAFF: readonly Role[] = [
  "SUPER_ADMIN", "HO_ACCOUNTANT", "HO_HR", "HO_MARKETING", "HO_SALE", "TRAINING", "AUDITOR", "CENTER_MANAGER",
  "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER",
];

/** Các báo cáo nghiệp vụ — dùng cho chỉ mục /bao-cao và chip của mục "Báo cáo" */
export interface ReportCard {
  href: string;
  label: string;
  desc: string;
  /** Ai nên xem */
  audience: string;
  icon: string;
  perm: NavPerm;
}

export const REPORTS: ReportCard[] = [
  { href: "/bao-cao/lead", label: "Báo cáo Lead", icon: "chart-column", perm: "report:read", desc: "Phễu, tỉ lệ chuyển, theo sale / nguồn / cơ sở / tháng, rụng ở bậc nào.", audience: "Trưởng tư vấn, quản lý cơ sở, marketing" },
  { href: "/bao-cao/trial", label: "Báo cáo trải nghiệm", icon: "flask-conical", perm: "report:read", desc: "Học thử → đăng ký; lấp đầy lớp trial.", audience: "Tư vấn, giáo vụ, quản lý cơ sở" },
  { href: "/bao-cao/dao-tao", label: "Báo cáo đào tạo", icon: "book-open", perm: "report:read", desc: "Chuyên cần theo lớp: buổi, đi học, vắng, chờ bù, đã bù.", audience: "Đào tạo, giáo vụ, quản lý cơ sở" },
  { href: "/bao-cao/hieu-suat-gv", label: "Hiệu suất giáo viên", icon: "graduation-cap", perm: "report:read", desc: "Buổi đã dạy, chuyên cần, điểm học bạ trung bình.", audience: "Đào tạo, nhân sự, quản lý cơ sở" },
  { href: "/bao-cao/cohort", label: "Cohort tiến độ", icon: "users", perm: "report:read", desc: "Theo kỳ bắt đầu: hoàn thành / đang học / rút.", audience: "Đào tạo, ban điều hành" },
  { href: "/bao-cao/churn", label: "Churn / rời bỏ", icon: "chart-line", perm: "report:read", desc: "Rời lớp theo tháng, theo cơ sở.", audience: "Quản lý cơ sở, CSKH, ban điều hành" },
  { href: "/bao-cao/trung-tam", label: "Báo cáo trung tâm", icon: "coins", perm: "report:read", desc: "Doanh thu theo tháng / cơ sở, công nợ.", audience: "Kế toán, quản lý cơ sở, ban điều hành" },
  { href: "/bao-cao/doanh-thu", label: "Doanh thu vs mục tiêu", icon: "coins", perm: "report:read", desc: "Mục tiêu theo cơ sở / kỳ và thực đạt.", audience: "Kế toán, ban điều hành" },
];

export const ADMIN_MENU: NavGroup[] = [
  {
    key: "overview",
    label: "Tổng quan",
    roles: ALL_STAFF,
    items: [
      { label: "Việc hôm nay", href: "/viec-hom-nay", icon: "list-checks", desc: "Hộp việc gộp: lead quá hạn, buổi chưa điểm danh, phiếu thu chờ xác nhận, đơn chờ duyệt… mỗi dòng một nút làm ngay." },
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", desc: "Số liệu chính trong ngày theo quyền của bạn." },
      {
        label: "Báo cáo", href: "/bao-cao", icon: "chart-column", perm: "report:read", keywords: "bao cao thong ke",
        desc: "Chỉ mục mọi báo cáo nghiệp vụ: lead, trải nghiệm, đào tạo, giáo viên, cohort, churn, doanh thu.",
        tabs: [{ label: "Tất cả báo cáo", href: "/bao-cao", perm: "report:read" }, ...REPORTS.map((r) => ({ label: r.label, href: r.href, perm: r.perm, desc: r.desc }))],
      },
      { label: "Thông báo của tôi", href: "/thong-bao", icon: "bell-ring", keywords: "trung tam thong bao", desc: "Mọi thông báo gửi cho bạn: lọc theo nhóm và mức, việc Cần thực hiện, đánh dấu đã đọc." },
      { label: "Ca & công của tôi", href: "/cham-cong/lich-ca", icon: "user-round", match: ["/cham-cong/checkin"], keywords: "cua toi lich ca lam don xin nghi cham cong qr", desc: "Lịch ca, công tháng, làm đơn, chấm công bằng QR." },
      { label: "Hướng dẫn & đào tạo", href: "/huong-dan", icon: "book-open-check", desc: "Bài hướng dẫn theo vai trò, có câu hỏi kiểm tra." },
    ],
  },
  {
    key: "crm",
    label: "Tuyển sinh (CRM)",
    roles: ["HO_SALE", "HO_MARKETING", "CENTER_SALES_CSM", ...MANAGERS],
    items: [
      {
        label: "Lead", href: "/leads", icon: "users", keywords: "khach hang crm kanban",
        desc: "Danh sách lead, bảng CRM (phễu), lead lâu ngày chưa chăm, lead chuyển liên cơ sở.",
        tabs: [
          { label: "Danh sách lead", href: "/leads", perm: "lead:read" },
          { label: "Tổng quan CRM", href: "/crm", perm: "lead:read", desc: "Phễu chuyển đổi, nguồn, SLA." },
          { label: "Lâu ngày chưa chăm", href: "/lead-nguoi", perm: "lead:read" },
          { label: "Chuyển liên cơ sở", href: "/leads/bao-cao-chuyen", perm: "lead:read" },
        ],
      },
      {
        label: "Nhập khách hàng", href: "/nhap-khach-hang", icon: "user-plus", keywords: "them lead import excel csv",
        desc: "Nhập tay một khách, nhập lead từ file, nhập danh sách khách đã đăng ký.",
        tabs: [
          { label: "Nhập tay", href: "/nhap-khach-hang", perm: "lead:create" },
          { label: "Từ file", href: "/leads/import", perm: "lead:create", desc: "Đọc CSV / dán từ Excel: 3 nhóm Mới / Trùng / Lỗi, gộp theo SĐT, cột Đè." },
          { label: "Khách đã đăng ký", href: "/leads/import/registered", perm: "lead:create", desc: "Mỗi dòng một học viên đã đăng ký; token ĐãĐóng= / HạnĐợt2= vào ghi chú của bé." },
        ],
      },
      { label: "Chốt hàng loạt", href: "/leads/bulk-convert", icon: "workflow", perm: "enrollment:create" },
      {
        label: "Chia & bàn giao lead", href: "/quan-ly-chia-lead", icon: "list-ordered", keywords: "pool luot chia",
        desc: "Cấu hình pool chia lead, lịch sử thay đổi pool, bàn giao lead giữa sale.",
        tabs: [
          { label: "Chia lead", href: "/quan-ly-chia-lead", perm: "lead:update" },
          { label: "Lịch sử thay đổi pool", href: "/quan-ly-chia-lead/lich-su", perm: "lead:read", desc: "Ai bật/tắt ai, chỉnh lượt bao nhiêu, vì sao." },
          { label: "Bàn giao lead", href: "/ban-giao-lead", perm: "lead:update" },
        ],
      },
      {
        label: "Học thử", href: "/lop-trial", icon: "flask-conical", keywords: "trial trai nghiem",
        desc: "Lớp trải nghiệm nhiều buổi và học thử buổi lẻ trong lớp chính quy.",
        tabs: [
          { label: "Lớp trải nghiệm", href: "/lop-trial", perm: "trials:view" },
          { label: "Học thử buổi lẻ", href: "/lop-trial/buoi-le", perm: "lead:read" },
        ],
      },
      { label: "Nguồn giới thiệu", href: "/affiliates", icon: "share-2", perm: "affiliate:read", keywords: "affiliate", desc: "Mã giới thiệu, lead mang về, tỉ lệ chốt, thưởng khi đơn học phí đầu thu đủ." },
    ],
  },
  {
    key: "students",
    label: "Học viên",
    roles: ["CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "TRAINING", ...MANAGERS],
    items: [
      {
        label: "Học viên", href: "/students", icon: "graduation-cap",
        desc: "Hồ sơ học viên, sắp hết khoá, tài khoản phụ huynh, thẻ QR.",
        tabs: [
          { label: "Danh sách", href: "/students", perm: "student:read" },
          { label: "Sắp hết khoá", href: "/students/sap-het-khoa", perm: "enrollment:read" },
          { label: "Tài khoản phụ huynh", href: "/students/tai-khoan", perm: "parent_account:read" },
          { label: "Thẻ học viên (QR)", href: "/the-hoc-vien", perm: "student:read", desc: "In thẻ QR để điểm danh bằng cách quét; cấp lại thẻ khi mất." },
        ],
      },
      {
        label: "Đăng ký học", href: "/enrollments", icon: "clipboard-list", keywords: "ghi danh chuyen lop",
        tabs: [
          { label: "Đăng ký học", href: "/enrollments", perm: "enrollment:read" },
          { label: "Chuyển lớp / cơ sở", href: "/chuyen-lop", perm: "enrollment:update" },
        ],
      },
      {
        label: "Học bạ & hồ sơ học tập", href: "/ho-so-hoc-tap", icon: "folder-check", keywords: "hoc ba nang luc report card phieu buoi",
        desc: "Một nơi cho học bạ: tổng quan chuẩn hồ sơ, học bạ mốc cần viết / duyệt, tra cứu hồ sơ từng học viên.",
        match: ["/report-cards", "/hoc-ba-moc", "/phieu-buoi"],
        tabs: [
          { label: "Tổng quan chuẩn hồ sơ", href: "/ho-so-hoc-tap", perm: "report_card:read", desc: "Tỷ lệ phiếu đúng hạn / đủ chuẩn, học bạ mốc quá hạn; bảng theo GV / lớp, nhắc GV một chạm." },
          { label: "Học bạ mốc cần viết / duyệt", href: "/ho-so-hoc-tap?xem=hoc-ba-moc", perm: "report_card:read", desc: "Lưới học bạ mốc theo lớp, hàng đợi duyệt, gửi phụ huynh." },
          { label: "Tra cứu học viên", href: "/ho-so-hoc-tap?xem=tra-cuu", perm: "report_card:read", desc: "Chọn học viên → học bạ mọi trạng thái, chứng nhận, mở hồ sơ học tập." },
        ],
      },
      { label: "Hoàn thành khoá & chứng nhận", href: "/hoan-thanh-khoa", icon: "award", perm: "enrollment:read" },
      { label: "SataCoin", href: "/satacoin", icon: "coins", perm: "coin:read", desc: "Sổ xu thưởng: thưởng theo hạn mức, thu hồi có lý do, đổi quà qua duyệt." },
    ],
  },
  {
    key: "classes",
    label: "Lớp & lịch học",
    roles: ["CENTER_CLASS_MANAGER", "TEACHER", "ASSISTANT_TEACHER", "TRAINING", ...MANAGERS],
    items: [
      {
        label: "Lớp học", href: "/classes", icon: "book-open",
        tabs: [
          { label: "Lớp học", href: "/classes", perm: "class:read" },
          { label: "Nhóm lớp", href: "/class-groups", perm: "class:read", desc: "Gom lớp thành nhóm (khối) để lọc và báo cáo." },
          { label: "Kiểm tra lịch buổi", href: "/classes/kiem-tra-lich", perm: "class:read", desc: "Đối chiếu dãy buổi với khai giảng + lịch học; xếp lại cả dãy." },
        ],
      },
      {
        label: "Lịch & buổi học", href: "/lich", icon: "calendar-days",
        tabs: [
          { label: "Lịch tổng", href: "/lich", perm: "session:read" },
          { label: "Buổi học", href: "/sessions", perm: "session:read" },
        ],
      },
      { label: "Điểm danh", href: "/attendance", icon: "clipboard-check", perm: "attendance:read" },
      { label: "Học bù", href: "/hoc-bu", icon: "refresh-cw", perm: "makeup:read" },
      {
        label: "Ảnh lớp học", href: "/media", icon: "image", keywords: "media duyet anh",
        tabs: [
          { label: "Kho ảnh", href: "/media", perm: "media:read" },
          { label: "Duyệt ảnh", href: "/duyet-media", perm: "media:update" },
        ],
      },
      {
        label: "Cơ sở & phòng học", href: "/centers", icon: "map-pin",
        tabs: [
          { label: "Cơ sở", href: "/centers", perm: "center:read" },
          { label: "Phòng học", href: "/rooms", perm: "class:read" },
          { label: "Ngày nghỉ", href: "/centers/ngay-nghi", perm: "holiday:read" },
        ],
      },
    ],
  },
  {
    key: "lms",
    label: "Chương trình & học liệu",
    roles: ["TRAINING", "TEACHER", "ASSISTANT_TEACHER", "CENTER_CLASS_MANAGER"],
    items: [
      {
        label: "Chương trình học", href: "/curriculums", icon: "book-marked", keywords: "giao an",
        tabs: [
          { label: "Chương trình học", href: "/curriculums", perm: "curriculum:read", desc: "Giáo trình theo khoá: bài học, mục tiêu, học cụ." },
          { label: "Đề xuất sửa giáo án", href: "/de-xuat-giao-an", perm: "curriculum:read", desc: "GV đề xuất chỉnh bài học; Đào tạo duyệt." },
        ],
      },
      {
        label: "Khoá học", href: "/courses", icon: "boxes",
        tabs: [
          { label: "Khoá học", href: "/courses", perm: "course:read", desc: "Mã, độ tuổi, số buổi, học phí niêm yết." },
          { label: "Gói khoá học", href: "/course-packages", perm: "course:read", desc: "Gói bán cho khách: số buổi, giá niêm yết / ưu đãi." },
          { label: "Khoá tiên quyết", href: "/course-prerequisites", perm: "course:read", desc: "Khoá phải học trước; chặn ghi danh khi chưa đạt." },
        ],
      },
      { label: "Lộ trình & chứng nhận", href: "/lo-trinh", icon: "route", perm: "course:read", desc: "Chuỗi khoá có thứ tự; hoàn thành đủ khoá bắt buộc được cấp giấy chứng nhận." },
      {
        label: "Kho tài liệu", href: "/documents", icon: "file-text", keywords: "tai lieu giang day scorm",
        tabs: [
          { label: "Tài liệu giảng dạy", href: "/documents", perm: "document:read", desc: "Kho tài liệu theo khoá / bài, phiên bản, nhật ký mở / tải." },
          { label: "SCORM / bài giảng tương tác", href: "/scorm", perm: "document:read" },
        ],
      },
      { label: "Tài liệu lớp tôi", href: "/teaching-materials", icon: "presentation", perm: "class:read", desc: "Dành cho giáo viên: tài liệu của các lớp đang dạy, buổi sắp tới cần chuẩn bị gì." },
      { label: "Bài tập về nhà", href: "/assignments", icon: "notebook-pen", perm: "assignment:read" },
    ],
  },
  {
    key: "care",
    label: "Chăm sóc & phụ huynh",
    roles: ["CENTER_SALES_CSM", "CENTER_CLASS_MANAGER", ...MANAGERS],
    items: [
      {
        label: "Tin nhắn", href: "/tin-nhan", icon: "message-circle", keywords: "hoi thoai messenger zalo",
        tabs: [
          { label: "Hộp thư", href: "/tin-nhan", perm: "message:read", desc: "Tin nhắn PH ↔ trung tâm / GV, Messenger, Zalo OA." },
          { label: "Messenger CRM", href: "/crm/messenger", perm: ["message:read", "lead:read"], desc: "Hội thoại mạng xã hội gắn với lead." },
          { label: "Giám sát hội thoại", href: "/hoi-thoai", perm: "message:audit", desc: "Tốc độ phản hồi, hội thoại gắn cờ, cấu hình kênh." },
        ],
      },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", icon: "message-square-plus", perm: "care:read", desc: "7 loại yêu cầu (nghỉ, bảo lưu, đổi lịch…) có duyệt." },
      {
        label: "Chăm sóc học viên", href: "/cham-soc-hv", icon: "heart-handshake",
        tabs: [
          { label: "Việc chăm sóc", href: "/cham-soc-hv", perm: "care:read" },
          { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", perm: "care:read" },
          { label: "Sinh nhật", href: "/sinh-nhat", perm: "care:read" },
        ],
      },
      {
        label: "Đánh giá & khảo sát", href: "/evaluations", icon: "clipboard-pen", keywords: "nps danh gia ph",
        tabs: [
          { label: "Phiếu & đợt khảo sát", href: "/evaluations", perm: "care:read", desc: "Trình dựng phiếu, nhóm tiêu chí, đợt mở–đóng–lưu trữ." },
          { label: "Khảo sát NPS (bản cũ)", href: "/khao-sat", perm: "care:read", desc: "Khảo sát theo mốc, điểm NPS — đang được thay dần." },
          { label: "Đánh giá buổi học từ PH", href: "/parent-feedback", perm: "care:read", desc: "Đánh giá buổi học / GV 1–5 sao, phản hồi." },
        ],
      },
      { label: "Gửi thông báo phụ huynh", href: "/notifications", icon: "bell", perm: "care:read", desc: "Thông báo gửi PH (in-app / ZNS / email) và trạng thái gửi." },
    ],
  },
  {
    key: "hr",
    label: "Nhân sự",
    roles: ["HO_HR", "CENTER_HR"],
    items: [
      {
        label: "Nhân sự & giáo viên", href: "/nhan-su", icon: "id-card",
        tabs: [
          { label: "Hồ sơ nhân sự", href: "/nhan-su", perm: "staff:read", desc: "Lương / BHXH chỉ HR, Kế toán, Quản trị thấy." },
          { label: "Giáo viên", href: "/teachers", perm: "teacher:read", desc: "Ngạch, tải dạy, lịch dạy, dự giờ." },
          { label: "Vị trí công việc", href: "/nhan-su/vi-tri", perm: "staff:read" },
        ],
      },
      {
        label: "Chấm công", href: "/cham-cong", icon: "clock",
        tabs: [
          { label: "Bảng công", href: "/cham-cong", perm: "timesheet:read" },
          { label: "Lưới phân ca", href: "/cham-cong/phan-ca", perm: "timesheet:read" },
          { label: "Kỳ công & chốt", href: "/cham-cong/ky-cong", perm: "timesheet:read" },
          { label: "Mã ca", href: "/cham-cong/danh-muc-ca", perm: "timesheet:read" },
          { label: "Điểm chấm công", href: "/cham-cong/diem-cham", perm: "timesheet:read" },
          { label: "Màn hình QR", href: "/cham-cong/man-hinh", perm: "timesheet:read" },
        ],
      },
      { label: "Duyệt đơn từ", href: "/don-tu", icon: "clipboard-list", perm: "timesheet:read", desc: "10 loại đơn; duyệt là áp ngay lên lịch ca và công." },
      { label: "Tuyển dụng", href: "/jobs", icon: "briefcase", perm: "recruit:read" },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    roles: ["HO_ACCOUNTANT", "CENTER_ACCOUNTANT", ...MANAGERS],
    items: [
      { label: "Đơn hàng", href: "/orders", icon: "shopping-bag", perm: "finance:read", desc: "Đơn học phí / sản phẩm, trả góp, QR thanh toán." },
      {
        label: "Thu tiền", href: "/payments", icon: "credit-card", keywords: "thanh toan phieu thu sepay",
        tabs: [
          { label: "Phiếu thu", href: "/payments", perm: "finance:read", desc: "Sale ghi nhận → Kế toán xác nhận." },
          { label: "Biến động số dư", href: "/bien-dong-so-du", perm: "finance:approve", desc: "Webhook SePay, đối khớp tự động với đơn." },
          { label: "Phương thức thanh toán", href: "/payment-methods", perm: "finance:read" },
        ],
      },
      {
        label: "Công nợ", href: "/cong-no", icon: "wallet",
        tabs: [
          { label: "Công nợ", href: "/cong-no", perm: "finance:read" },
          { label: "Thiếu học phí", href: "/thieu-hoc-phi", perm: "finance:read" },
        ],
      },
      { label: "Hoàn tiền", href: "/hoan-tien", icon: "undo-2", perm: "finance:read" },
      { label: "Hoá đơn điện tử", href: "/hoa-don", icon: "receipt", perm: "finance:read" },
      { label: "Hoa hồng", href: "/crm/commission", icon: "coins", perm: "finance:read" },
    ],
  },
  {
    key: "inventory",
    label: "Kho & sản phẩm",
    roles: ["HO_ACCOUNTANT", "CENTER_ACCOUNTANT"],
    items: [
      { label: "Học cụ (Kits)", href: "/kits", icon: "package", perm: "inventory:read" },
      { label: "Sản phẩm bán / thuê", href: "/products", icon: "package-2", perm: "inventory:read" },
      {
        label: "Tồn kho", href: "/inventory/dashboard", icon: "boxes",
        tabs: [
          { label: "Tồn kho", href: "/inventory/dashboard", perm: "inventory:read" },
          { label: "Kiểm kê kho", href: "/inventory/audit", perm: "inventory:read" },
        ],
      },
    ],
  },
  {
    key: "web",
    label: "Website & marketing",
    roles: ["HO_MARKETING"],
    items: [
      {
        label: "Website", href: "/news", icon: "newspaper",
        tabs: [
          { label: "Tin tức", href: "/news", perm: "site:read" },
          { label: "Nội dung trang", href: "/site-content", perm: "site:read" },
        ],
      },
      {
        label: "Marketing", href: "/marketing", icon: "chart-line", keywords: "tracking funnel utm pixel",
        tabs: [
          { label: "Tracking", href: "/marketing", perm: "marketing:read" },
          { label: "Funnel", href: "/marketing/funnel", perm: "marketing:read" },
        ],
      },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    roles: ["SUPER_ADMIN", "AUDITOR"],
    items: [
      {
        label: "Tài khoản & phân quyền", href: "/users", icon: "key-round",
        tabs: [
          { label: "Tài khoản", href: "/users", perm: "system:read" },
          { label: "Nhóm người dùng", href: "/user-groups", perm: "system:read" },
          { label: "Vai trò & quyền", href: "/roles", perm: "system:read" },
        ],
      },
      {
        label: "Tổ chức & nhượng quyền", href: "/to-chuc", icon: "network",
        tabs: [
          { label: "Cây tổ chức", href: "/to-chuc", perm: "system:read" },
          { label: "Nhượng quyền", href: "/nhuong-quyen", perm: "tenant:read" },
        ],
      },
      {
        label: "Bảo mật & tuân thủ", href: "/bao-mat-he-thong", icon: "shield-alert", keywords: "audit log nhat ky",
        tabs: [
          { label: "Bảo mật hệ thống", href: "/bao-mat-he-thong", perm: "system:read" },
          { label: "Nhật ký thao tác", href: "/audit-log", perm: "audit:read" },
          { label: "Tuân thủ dữ liệu", href: "/compliance", perm: "compliance:read" },
        ],
      },
      {
        label: "Cấu hình", href: "/cau-hinh-van-hanh", icon: "sliders-horizontal", keywords: "cai dat settings",
        tabs: [
          { label: "Cấu hình vận hành", href: "/cau-hinh-van-hanh", perm: "automation:read" },
          { label: "Cài đặt chung", href: "/settings", perm: "system:read", desc: "Thông tin trung tâm, thương hiệu, chân phiếu thu." },
          { label: "Mẫu email", href: "/email-templates", perm: "system:read" },
        ],
      },
      { label: "Tích hợp", href: "/tich-hop", icon: "plug", perm: "system:read" },
      { label: "Vận hành & sao lưu", href: "/van-hanh", icon: "server-cog", perm: "system:read" },
    ],
  },
  {
    key: "tools",
    label: "Công cụ kỹ thuật",
    roles: ["SUPER_ADMIN"],
    tech: true,
    items: [
      {
        label: "Nhật ký gửi", href: "/email-logs", icon: "send", keywords: "email otp log",
        tabs: [
          { label: "Email", href: "/email-logs", perm: "system:read" },
          { label: "OTP", href: "/otp-logs", perm: "system:read" },
        ],
      },
      { label: "Chạy lại webhook", href: "/crm/webhook-replay", icon: "refresh-cw", perm: "system:read" },
      {
        label: "Nhập dữ liệu hệ cũ", href: "/chuyen-doi", icon: "database", keywords: "chuyen doi migration giao dich cu",
        tabs: [
          { label: "Chuyển đổi dữ liệu", href: "/chuyen-doi", perm: "migration:read" },
          { label: "Nhập giao dịch cũ", href: "/nhap-giao-dich-cu", perm: "finance:confirm" },
        ],
      },
      {
        label: "Go-live", href: "/go-live", icon: "rocket", keywords: "pilot",
        tabs: [
          { label: "Go-live cơ sở", href: "/go-live", perm: "cutover:read" },
          { label: "Sau go-live", href: "/bao-cao/sau-go-live", perm: ["report:read", "cutover:read"] },
          { label: "Đo pilot chat", href: "/bao-cao/chat-pilot", perm: ["report:read", "cutover:read"] },
        ],
      },
    ],
  },
];

/**
 * Đường dẫn cũ đã được THAY THẾ bằng chế độ xem trong trang trung tâm.
 * next.config.ts dựng redirect 308 từ bảng này; truy vấn gốc (vd `?student=…`, `?class=…`)
 * được Next.js chuyển tiếp nguyên vẹn sang đích.
 */
export interface LegacyRedirect {
  from: string;
  to: string;
  note: string;
}

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  { from: "/hoc-ba", to: "/ho-so-hoc-tap?xem=tra-cuu", note: "Học bạ (tra cứu một học viên) → chip Tra cứu học viên; ?student=<id> giữ nguyên" },
  { from: "/report-cards", to: "/ho-so-hoc-tap?xem=hoc-ba-moc", note: "Học bạ năng lực (lưới theo lớp + hàng đợi duyệt) → chip Học bạ mốc; ?class=<id> giữ nguyên" },
];

/**
 * Mục menu cũ không còn trong sidebar nhưng trang VẪN DÙNG ĐƯỢC ở chỗ khác (không mất chức năng).
 */
export const MOVED_OUT_OF_SIDEBAR: { href: string; where: string }[] = [
  { href: "/bao-mat", where: "Menu tài khoản (góc phải trên) → Bảo mật tài khoản; bảng lệnh Ctrl+K" },
];

/* ------------------------------------------------------------------ */
/* Hàm thuần                                                          */
/* ------------------------------------------------------------------ */

/** Bỏ dấu tiếng Việt + chữ thường, để "hoc ba" khớp "Học bạ" */
export function foldVi(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** Phần đường dẫn (bỏ ?truy vấn và #neo) */
export function pathOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut < 0 ? href : href.slice(0, cut);
}

/** Truy vấn của href dạng cặp khoá–giá trị (không dùng URLSearchParams để core không cần DOM) */
export function queryOf(href: string): Record<string, string> {
  const q = href.indexOf("?");
  if (q < 0) return {};
  const out: Record<string, string> = {};
  for (const part of href.slice(q + 1).split("#")[0]!.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}

export function navAllowed(perm: NavPerm | undefined, can: (p: Permission) => boolean): boolean {
  if (!perm) return true;
  if (typeof perm === "string") return can(perm);
  return perm.every((p) => can(p));
}

/**
 * Lọc cây theo quyền. Mục trung tâm: giữ các chip được phép; không còn chip nào → bỏ mục;
 * href của mục = chip ĐẦU TIÊN người dùng được phép (vd người chỉ có teacher:read vào thẳng "Giáo viên").
 */
export function filterMenu(menu: readonly NavGroup[], can: (p: Permission) => boolean): NavGroup[] {
  const out: NavGroup[] = [];
  for (const g of menu) {
    const items: NavItem[] = [];
    for (const i of g.items) {
      if (!navAllowed(i.perm, can)) continue;
      if (i.tabs) {
        const tabs = i.tabs.filter((t) => navAllowed(t.perm, can));
        const first = tabs[0];
        if (!first) continue;
        items.push({ ...i, href: first.href, tabs });
      } else items.push(i);
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}

/** Mọi tiền tố đường dẫn thuộc về một mục (href, các chip, match) */
export function navPrefixes(item: NavItem): string[] {
  return [...new Set([pathOf(item.href), ...(item.tabs ?? []).map((t) => pathOf(t.href)), ...(item.match ?? [])])];
}

function prefixHit(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** Mục menu đang mở = mục có tiền tố KHỚP DÀI NHẤT (vd /leads/import thuộc "Nhập khách hàng", không thuộc "Lead") */
export function activeNavItem<T extends NavItem>(pathname: string, items: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestLen = -1;
  for (const i of items) {
    for (const p of navPrefixes(i)) {
      if (prefixHit(pathname, p) && p.length > bestLen) {
        best = i;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Chip đang chọn của một trang trung tâm. Chỉ tính khi đang ĐÚNG đường dẫn của chip (trang chi tiết
 * như /leads/<id> không hiện dải chip). Chip có truy vấn (vd `?xem=hoc-ba-moc`) thắng chip không truy vấn
 * khi mọi khoá của nó khớp.
 */
export function activeTab(pathname: string, query: Record<string, string | undefined>, tabs: readonly NavTab[]): NavTab | undefined {
  let best: NavTab | undefined;
  let bestKeys = -1;
  for (const t of tabs) {
    if (pathOf(t.href) !== pathname) continue;
    const q = queryOf(t.href);
    const keys = Object.keys(q);
    if (!keys.every((k) => query[k] === q[k])) continue;
    if (keys.length > bestKeys) {
      best = t;
      bestKeys = keys.length;
    }
  }
  return best;
}

/** Nhóm mở sẵn theo vai trò (khi người dùng chưa tự mở / đóng) */
export function defaultOpenGroups(menu: readonly NavGroup[], roles: readonly Role[]): string[] {
  return menu.filter((g) => g.roles.some((r) => roles.includes(r))).map((g) => g.key);
}

export interface MenuSearchHit {
  groupLabel: string;
  item: NavItem;
  /** Chip khớp (khi từ khoá trúng tên chip, không trúng tên mục) */
  tab?: NavTab;
  href: string;
  label: string;
  score: number;
}

/** Tìm trong menu: không dấu cũng khớp; mọi từ gõ phải xuất hiện */
export function searchMenu(menu: readonly NavGroup[], text: string): MenuSearchHit[] {
  const f = foldVi(text.trim());
  if (!f) return [];
  const words = f.split(/\s+/);
  const hits: MenuSearchHit[] = [];
  for (const g of menu) {
    for (const i of g.items) {
      const title = foldVi(i.label);
      const hay = foldVi(`${i.label} ${g.label} ${i.desc ?? ""} ${i.keywords ?? ""}`);
      if (words.every((w) => hay.includes(w))) {
        hits.push({ groupLabel: g.label, item: i, href: i.href, label: i.label, score: title.startsWith(f) ? 0 : title.includes(f) ? 1 : 2 });
      }
      for (const t of i.tabs ?? []) {
        if (t.href === i.href && foldVi(t.label) === title) continue;
        const tt = foldVi(t.label);
        const th = foldVi(`${t.label} ${i.label} ${t.desc ?? ""}`);
        if (words.every((w) => th.includes(w)) && !hits.some((h) => h.href === t.href)) {
          hits.push({ groupLabel: g.label, item: i, tab: t, href: t.href, label: `${i.label} › ${t.label}`, score: tt.startsWith(f) ? 0 : tt.includes(f) ? 1 : 3 });
        }
      }
    }
  }
  return hits.sort((a, b) => a.score - b.score);
}

/** Mọi href (mục + chip) — không trùng */
export function allMenuHrefs(menu: readonly NavGroup[]): string[] {
  const out: string[] = [];
  for (const g of menu) for (const i of g.items) for (const h of [i.href, ...(i.tabs ?? []).map((t) => t.href)]) if (!out.includes(h)) out.push(h);
  return out;
}

/** Redirect cho next.config.ts (308) */
export function nextRedirects(): { source: string; destination: string; permanent: boolean }[] {
  return LEGACY_REDIRECTS.map((r) => ({ source: r.from, destination: r.to, permanent: true }));
}

/** Bản kê cho bộ kiểm thử PowerShell (scripts/kiem-thu/menu-manifest.json) */
export function menuManifest() {
  const perm = (p: NavPerm | undefined) => (p ? (typeof p === "string" ? [p] : [...p]) : []);
  return {
    note: "Sinh tu packages/core/src/nav/menu.ts — KHONG sua tay. Cap nhat: CAP_NHAT_MENU=1 khi chay test core (xem docs/KIEN-TRUC-MENU.md).",
    groups: ADMIN_MENU.map((g) => ({
      key: g.key,
      label: g.label,
      roles: [...g.roles],
      tech: !!g.tech,
      items: g.items.map((i) => ({
        label: i.label,
        href: i.href,
        perm: perm(i.perm),
        tabs: (i.tabs ?? []).map((t) => ({ label: t.label, href: t.href, perm: perm(t.perm) })),
      })),
    })),
    redirects: LEGACY_REDIRECTS.map((r) => ({ from: r.from, to: r.to })),
    extraPages: MOVED_OUT_OF_SIDEBAR.map((m) => m.href),
  };
}
