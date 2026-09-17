/**
 * Sẵn sàng pilot: bài hướng dẫn theo vai trò (có câu hỏi kiểm tra) và kiểm tra dữ liệu trước pilot của từng cơ sở.
 */
import type { Role } from "../policy/policy.js";

export interface TrainingQuestion {
  q: string;
  options: string[];
  /** chỉ số đáp án đúng */
  answer: number;
}
export interface TrainingModule {
  key: string;
  title: string;
  roles: Role[];
  minutes: number;
  steps: { text: string; href?: string }[];
  quiz: TrainingQuestion[];
}

const MGR: Role[] = ["CENTER_MANAGER"];
const OPS: Role[] = ["CENTER_MANAGER", "CENTER_CLASS_MANAGER"];
const SALE: Role[] = ["CENTER_MANAGER", "CENTER_SALES_CSM"];
const ACC: Role[] = ["CENTER_ACCOUNTANT"];
const TEACH: Role[] = ["TEACHER", "ASSISTANT_TEACHER"];
const ALL_CENTER: Role[] = ["CENTER_MANAGER", "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER"];

export const TRAINING_MODULES: TrainingModule[] = [
  {
    key: "basics", title: "Làm quen hệ thống mới", roles: ALL_CENTER, minutes: 10,
    steps: [
      { text: "Đăng nhập, xem menu bên trái — tên và thứ tự giống admin cũ." },
      { text: "Chuông thông báo góc trên: việc cần làm, tin nhắn, sự cố." },
      { text: "Gặp lỗi hoặc chưa biết thao tác: ghi ở Go-live → Phản hồi pilot.", href: "/go-live?tab=phan-hoi" },
      { text: "Dữ liệu cá nhân phụ huynh bị che; xem đầy đủ phải ghi lý do và được lưu nhật ký." },
    ],
    quiz: [
      { q: "Muốn xem đầy đủ SĐT phụ huynh đang bị che thì cần làm gì?", options: ["Chụp màn hình gửi quản lý", "Bấm xem và ghi lý do — hệ thống lưu nhật ký", "Xuất CSV"], answer: 1 },
      { q: "Gặp lỗi trong thời gian pilot, ghi ở đâu?", options: ["Nhóm Zalo nội bộ", "Go-live → Phản hồi pilot", "Không cần báo"], answer: 1 },
    ],
  },
  {
    key: "teacher_session", title: "Giáo viên: buổi học, điểm danh, quét thẻ", roles: [...TEACH, "CENTER_CLASS_MANAGER"], minutes: 15,
    steps: [
      { text: "Mở app giáo viên → Hôm nay → chọn buổi.", href: "/teacher" },
      { text: "Bắt đầu buổi → điểm danh (hoặc Quét thẻ QR trong ngày học) → nhận xét → hoàn tất." },
      { text: "Quét thẻ quá 15 phút sau giờ bắt đầu tự ghi Đi muộn; quét lại không ghi trùng." },
      { text: "Chốt điểm danh ngay trong ngày — báo cáo sau go-live tính tỉ lệ này." },
    ],
    quiz: [
      { q: "Quét thẻ QR được khi nào?", options: ["Bất cứ lúc nào", "Chỉ trong ngày diễn ra buổi học", "Chỉ trước giờ học"], answer: 1 },
      { q: "Học viên đến muộn 20 phút, quét thẻ thì hệ thống ghi gì?", options: ["Có mặt", "Đi muộn", "Vắng không phép"], answer: 1 },
    ],
  },
  {
    key: "ops_classes", title: "Giáo vụ: lớp, lịch, học bù, thẻ học viên", roles: OPS, minutes: 20,
    steps: [
      { text: "Lớp học: tạo nháp → gửi duyệt → tuyển sinh (tự sinh buổi).", href: "/classes" },
      { text: "Điểm danh theo lớp: sửa hồi tố phải ghi lý do và báo giáo viên.", href: "/attendance" },
      { text: "In thẻ QR theo lớp; mất thẻ → Cấp lại (thẻ cũ hết hiệu lực).", href: "/the-hoc-vien" },
      { text: "Học bù, bảo lưu, chuyển lớp đều từ trang học viên." },
    ],
    quiz: [
      { q: "Học viên mất thẻ QR, làm gì?", options: ["In lại thẻ cũ", "Cấp lại thẻ (có lý do) — thẻ cũ hết hiệu lực", "Cho điểm danh tay mãi"], answer: 1 },
      { q: "Sửa điểm danh buổi đã qua cần gì?", options: ["Ghi lý do", "Không cần gì", "Xoá buổi"], answer: 0 },
    ],
  },
  {
    key: "sales_parents", title: "Tư vấn / CSKH: lead, ghi danh, cổng phụ huynh, tin nhắn", roles: SALE, minutes: 20,
    steps: [
      { text: "Lead → học thử → chốt: tạo học viên, phụ huynh (có đồng ý) và ghi danh.", href: "/leads" },
      { text: "Cấp mã kích hoạt cho phụ huynh; phụ huynh đăng nhập /ph bằng SĐT + mã (hoặc OTP)." },
      { text: "Hộp thư: trả lời phụ huynh trong 60 phút; không nhắc chuyển khoản vào tài khoản cá nhân.", href: "/tin-nhan" },
      { text: "Ghi nhận khoản thu → kế toán xác nhận; sale không tự xác nhận." },
    ],
    quiz: [
      { q: "Phụ huynh hỏi số tài khoản để chuyển học phí, trả lời thế nào?", options: ["Gửi STK cá nhân", "Hướng dẫn QR chuyển khoản trong cổng phụ huynh / phiếu thu", "Hẹn nộp tiền mặt ngoài trung tâm"], answer: 1 },
      { q: "Ai xác nhận khoản thu sale đã ghi nhận?", options: ["Chính sale", "Kế toán", "Giáo viên"], answer: 1 },
    ],
  },
  {
    key: "accounting", title: "Kế toán: xác nhận thu, đối khớp ngân hàng, hoá đơn điện tử", roles: ACC, minutes: 25,
    steps: [
      { text: "Thanh toán: xác nhận / điều chỉnh / từ chối khoản sale ghi nhận.", href: "/payments" },
      { text: "Biến động số dư: tiền về tự khớp theo mã đơn; mục cần kiểm tra xử lý trong ngày.", href: "/bien-dong-so-du" },
      { text: "Hoá đơn điện tử: kiểm tra nháp, thông tin người mua, phát hành; sai sót lập điều chỉnh / thay thế.", href: "/hoa-don" },
      { text: "Hoàn tiền đã chi → lập hoá đơn điều chỉnh giảm." },
    ],
    quiz: [
      { q: "Hoá đơn đã phát hành bị sai tên người mua, xử lý thế nào?", options: ["Huỷ hoá đơn", "Sửa trực tiếp", "Lập hoá đơn thay thế kèm văn bản thoả thuận"], answer: 2 },
      { q: "Chuyển khoản về có ghi mã đơn thì sao?", options: ["Hệ thống tự khớp và xác nhận", "Phải nhập tay", "Bỏ qua"], answer: 0 },
    ],
  },
  {
    key: "manager_golive", title: "Quản lý cơ sở: chạy song song và go-live", roles: MGR, minutes: 20,
    steps: [
      { text: "Mỗi tối ghi sổ chạy song song: điểm danh, tiền thu, ghi danh mới, ghi danh mở của hệ cũ.", href: "/go-live" },
      { text: "Ngày lệch phải ghi nguyên nhân; cần 5 ngày khớp liên tiếp để chuyển chính thức." },
      { text: "Theo dõi báo cáo sau go-live hằng tuần.", href: "/bao-cao/sau-go-live" },
      { text: "Xử lý mục đỏ trong Kiểm tra dữ liệu trước pilot." },
    ],
    quiz: [
      { q: "Cần bao nhiêu ngày chạy song song khớp liên tiếp để chuyển chính thức?", options: ["1", "5", "30"], answer: 1 },
      { q: "Ngày số liệu lệch thì làm gì?", options: ["Bỏ qua", "Ghi nguyên nhân và cách xử lý", "Sửa số hệ cũ cho khớp"], answer: 1 },
    ],
  },
];

export function modulesForRoles(roles: readonly Role[]): TrainingModule[] {
  return TRAINING_MODULES.filter((m) => m.roles.some((r) => roles.includes(r)));
}

/** Chấm bài: đúng hết mới hoàn thành */
export function gradeQuiz(m: TrainingModule, answers: number[]): { passed: boolean; wrong: number[] } {
  const wrong = m.quiz.map((q, i) => (answers[i] === q.answer ? -1 : i)).filter((i) => i >= 0);
  return { passed: answers.length === m.quiz.length && wrong.length === 0, wrong };
}

/** Câu hỏi gửi xuống trình duyệt — không kèm đáp án */
export function publicModule(m: TrainingModule) {
  return { ...m, quiz: m.quiz.map(({ q, options }) => ({ q, options })) };
}

export interface StaffProgress { userId: string; name: string; roles: Role[]; required: string[]; done: string[] }
export function trainingStatus(staff: StaffProgress[]) {
  const rows = staff.map((s) => ({ ...s, missing: s.required.filter((k) => !s.done.includes(k)) }));
  const withReq = rows.filter((r) => r.required.length);
  return { rows, trained: withReq.filter((r) => !r.missing.length).length, total: withReq.length, ok: withReq.length > 0 && withReq.every((r) => !r.missing.length) };
}

/* ------------------------------------------------------------------ */
/* Kiểm tra dữ liệu trước pilot                                         */
/* ------------------------------------------------------------------ */

export const PREFLIGHT_CHECKS = [
  { key: "noRooms", label: "Cơ sở chưa có phòng học", level: "block", href: "/rooms" },
  { key: "noManager", label: "Chưa có tài khoản Quản lý cơ sở", level: "block", href: "/users" },
  { key: "noAccountant", label: "Chưa có tài khoản Kế toán (cơ sở hoặc Hội sở)", level: "block", href: "/users" },
  { key: "studentsNoGuardian", label: "Học viên đang học chưa có phụ huynh", level: "block", href: "/students" },
  { key: "classesNoTeacher", label: "Lớp đang chạy / tuyển sinh chưa có giáo viên chính", level: "block", href: "/classes" },
  { key: "classesNoSessions", label: "Lớp đang chạy không còn buổi sắp tới", level: "block", href: "/classes" },
  { key: "sessionsNoTeacher", label: "Buổi 7 ngày tới chưa có giáo viên", level: "warn", href: "/lich" },
  { key: "parentsBadPhone", label: "Phụ huynh có SĐT sai định dạng (không nhận được OTP / ZNS)", level: "warn", href: "/students" },
  { key: "enrollmentsNoOrder", label: "Ghi danh đang học chưa có đơn học phí", level: "warn", href: "/thieu-hoc-phi" },
  { key: "enrollmentsOverused", label: "Ghi danh đã học vượt số buổi gói", level: "warn", href: "/students/sap-het-khoa" },
  { key: "noBankQr", label: "Chưa có phương thức chuyển khoản có QR (VietQR)", level: "warn", href: "/payment-methods" },
  { key: "teachersNoAccount", label: "Giáo viên chưa gắn tài khoản đăng nhập", level: "warn", href: "/teachers" },
] as const;
export type PreflightKey = (typeof PREFLIGHT_CHECKS)[number]["key"];

export function preflightSummary(counts: Record<PreflightKey, number>) {
  const rows = PREFLIGHT_CHECKS.map((c) => ({ ...c, count: counts[c.key] ?? 0, ok: (counts[c.key] ?? 0) === 0 }));
  return { rows, blocks: rows.filter((r) => r.level === "block" && !r.ok).length, warns: rows.filter((r) => r.level === "warn" && !r.ok).length, ok: rows.every((r) => r.level !== "block" || r.ok) };
}
