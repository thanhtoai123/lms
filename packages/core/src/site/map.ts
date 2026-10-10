/**
 * SƠ ĐỒ WEBSITE — danh sách trang của website công khai và đường dẫn của từng trang.
 *
 * Mọi trang "dựng bằng bộ khối" lưu trong bảng `landing_pages` (cùng trình soạn, xuất bản, lịch sử với landing).
 * Đường dẫn công khai suy ra từ `slug`:
 *   trang-chu → /            gioi-thieu → /gioi-thieu     khoa-hoc → /khoa-hoc     lien-he → /lien-he
 *   khoa-hoc-<x> → /khoa-hoc/<x>        chinh-sach-<x> → /chinh-sach/<x>
 * Landing quảng cáo (slug khác) vẫn ở /lp/<slug> và KHÔNG dùng khung chung.
 * Trang "hệ thống" (Tin tức, Tuyển dụng, Học thử) có màn quản trị riêng, chỉ dùng chung đầu / chân trang.
 */

export const COURSE_PREFIX = "khoa-hoc-";
export const POLICY_PREFIX = "chinh-sach-";

export type SiteGroup = "main" | "course" | "policy" | "system";
export interface SiteNode {
  key: string;
  /** null = trang hệ thống (không phải trang dựng khối) */
  slug: string | null;
  path: string;
  label: string;
  group: SiteGroup;
  desc: string;
  /** Link quản trị riêng (trang hệ thống) */
  manage?: string;
}

export const SITE_GROUP_LABEL: Record<SiteGroup, string> = {
  main: "Trang chính",
  course: "Khoá học",
  policy: "Chính sách",
  system: "Trang hệ thống",
};

export const SITE_NODES: readonly SiteNode[] = [
  { key: "home", slug: "trang-chu", path: "/", label: "Trang chủ", group: "main", desc: "Trang đầu tiên khách chưa đăng nhập nhìn thấy." },
  { key: "about", slug: "gioi-thieu", path: "/gioi-thieu", label: "Giới thiệu", group: "main", desc: "Câu chuyện, giá trị, đội ngũ của trung tâm." },
  { key: "courses", slug: "khoa-hoc", path: "/khoa-hoc", label: "Khoá học", group: "main", desc: "Danh sách các khoá học, dẫn sang trang chi tiết từng khoá." },
  { key: "contact", slug: "lien-he", path: "/lien-he", label: "Liên hệ", group: "main", desc: "Địa chỉ cơ sở, giờ làm việc, form để lại thông tin." },
  { key: "course-robot", slug: "khoa-hoc-lap-trinh-robot", path: "/khoa-hoc/lap-trinh-robot", label: "Lập trình Robot", group: "course", desc: "Chi tiết khoá học tại trung tâm." },
  { key: "course-robosim", slug: "khoa-hoc-luyen-thi-robosim", path: "/khoa-hoc/luyen-thi-robosim", label: "Luyện thi RoboSim", group: "course", desc: "Chi tiết khoá luyện thi." },
  { key: "course-online", slug: "khoa-hoc-hoc-online", path: "/khoa-hoc/hoc-online", label: "Học online", group: "course", desc: "Chi tiết khoá học từ xa." },
  { key: "policy-privacy", slug: "chinh-sach-bao-mat", path: "/chinh-sach/bao-mat", label: "Chính sách bảo mật", group: "policy", desc: "Cách trung tâm thu thập và bảo vệ dữ liệu." },
  { key: "policy-terms", slug: "chinh-sach-dieu-khoan", path: "/chinh-sach/dieu-khoan", label: "Điều khoản sử dụng", group: "policy", desc: "Điều khoản khi dùng website và dịch vụ." },
  { key: "news", slug: null, path: "/tin-tuc", label: "Tin tức", group: "system", desc: "Bài viết, sự kiện, góc phụ huynh.", manage: "/news" },
  { key: "jobs", slug: null, path: "/tuyen-dung", label: "Tuyển dụng", group: "system", desc: "Vị trí đang mở và nộp hồ sơ.", manage: "/jobs" },
  { key: "register", slug: null, path: "/dang-ky", label: "Đăng ký học thử", group: "system", desc: "Form đăng ký học thử, gửi vào CRM.", manage: "/site-content" },
];

const FIXED: Record<string, string> = { "trang-chu": "/", "gioi-thieu": "/gioi-thieu", "khoa-hoc": "/khoa-hoc", "lien-he": "/lien-he" };

/** Đường dẫn công khai của một trang thuộc website; null nếu slug là landing quảng cáo thường (/lp/<slug>) */
export function sitePathOf(slug: string): string | null {
  const f = FIXED[slug];
  if (f) return f;
  if (slug.startsWith(COURSE_PREFIX) && slug.length > COURSE_PREFIX.length) return `/khoa-hoc/${slug.slice(COURSE_PREFIX.length)}`;
  if (slug.startsWith(POLICY_PREFIX) && slug.length > POLICY_PREFIX.length) return `/chinh-sach/${slug.slice(POLICY_PREFIX.length)}`;
  return null;
}
export const isSiteSlug = (slug: string): boolean => sitePathOf(slug) !== null;

export function siteGroupOf(slug: string): SiteGroup | null {
  if (FIXED[slug]) return "main";
  if (slug.startsWith(COURSE_PREFIX) && slug.length > COURSE_PREFIX.length) return "course";
  if (slug.startsWith(POLICY_PREFIX) && slug.length > POLICY_PREFIX.length) return "policy";
  return null;
}

/** slug trang con từ đoạn đường dẫn: /khoa-hoc/<x> → khoa-hoc-<x> */
export const courseSlug = (x: string): string => COURSE_PREFIX + x;
export const policySlug = (x: string): string => POLICY_PREFIX + x;
