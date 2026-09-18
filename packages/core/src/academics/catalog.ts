/**
 * Khoá học, khoá tiên quyết, giáo trình — luật dữ liệu học thuật.
 */

export const CURRICULUM_STATUSES = ["draft", "active", "archived"] as const;
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];
export const CURRICULUM_STATUS_VI: Record<CurriculumStatus, string> = { draft: "Nháp", active: "Đang sử dụng", archived: "Không sử dụng" };

export interface CourseInput {
  code: string;
  name: string;
  gradeFrom?: number | null;
  gradeTo?: number | null;
  totalSessions: number;
  sessionMinutes: number;
  listPrice: number;
}

export function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateCourse(c: CourseInput): string[] {
  const errs: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(normalizeCourseCode(c.code))) errs.push("Mã khoá chỉ gồm chữ in hoa, số, - hoặc _ (2–20 ký tự)");
  if (c.name.trim().length < 3) errs.push("Tên khoá tối thiểu 3 ký tự");
  if (c.gradeFrom != null && c.gradeTo != null && c.gradeFrom > c.gradeTo) errs.push("Lớp (độ tuổi) từ phải ≤ đến");
  if (c.totalSessions < 1 || c.totalSessions > 200) errs.push("Số buổi phải từ 1 đến 200");
  if (c.sessionMinutes < 30 || c.sessionMinutes > 300) errs.push("Thời lượng buổi phải từ 30 đến 300 phút");
  if (c.listPrice < 0) errs.push("Học phí không được âm");
  return errs;
}

/* ------------------------------------------------------------------ */
/* Phòng học                                                           */
/* ------------------------------------------------------------------ */

export const ROOM_STATUSES = ["active", "maintenance", "paused"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const ROOM_STATUS_VI: Record<RoomStatus, string> = { active: "Hoạt động", maintenance: "Bảo trì", paused: "Tạm ngừng" };
/** Chỉ phòng "Hoạt động" mới xếp được lớp / buổi học */
export const roomUsable = (status: RoomStatus) => status === "active";

/** Chuẩn hoá danh sách thiết bị: bỏ trắng, bỏ trùng (không phân biệt hoa thường), tối đa 20 mục */
export function normalizeEquipment(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const v = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!v) continue;
    if (out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Gói bán cho khách (course_packages)                                 */
/* ------------------------------------------------------------------ */

export interface CoursePackageInput {
  code: string;
  name: string;
  level?: string | null;
  sessions: number;
  listPrice: number;
  salePrice?: number | null;
  description?: string | null;
  sortOrder?: number | null;
}

export function normalizePackageCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Giá bán thực tế: có giá ưu đãi (> 0) thì dùng giá ưu đãi, không thì giá niêm yết */
export function packagePriceOf(p: { listPrice: number; salePrice?: number | null }): number {
  return p.salePrice != null && p.salePrice > 0 ? p.salePrice : p.listPrice;
}

/** % giảm so với giá niêm yết (làm tròn); 0 khi không có ưu đãi */
export function packageSavingPercent(p: { listPrice: number; salePrice?: number | null }): number {
  if (!p.listPrice || p.salePrice == null || p.salePrice <= 0 || p.salePrice >= p.listPrice) return 0;
  return Math.round(((p.listPrice - p.salePrice) / p.listPrice) * 100);
}

/** Đơn giá một buổi của gói (dùng để so sánh các gói cùng khoá) */
export function packageUnitPrice(p: { listPrice: number; salePrice?: number | null; sessions: number }): number {
  return p.sessions > 0 ? Math.round(packagePriceOf(p) / p.sessions) : 0;
}

export function validateCoursePackage(p: CoursePackageInput, opts: { courseSessions?: number | null } = {}): string[] {
  const errs: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9_.-]{1,29}$/.test(normalizePackageCode(p.code))) errs.push("Mã gói chỉ gồm chữ in hoa, số, . - _ (2–30 ký tự)");
  if (p.name.trim().length < 3) errs.push("Tên gói tối thiểu 3 ký tự");
  if (!Number.isInteger(p.sessions) || p.sessions < 1 || p.sessions > 500) errs.push("Số buổi của gói phải từ 1 đến 500");
  if (!Number.isInteger(p.listPrice) || p.listPrice < 0) errs.push("Giá niêm yết phải là số nguyên đồng, không âm");
  if (p.salePrice != null) {
    if (!Number.isInteger(p.salePrice) || p.salePrice < 0) errs.push("Giá ưu đãi phải là số nguyên đồng, không âm");
    else if (p.salePrice > p.listPrice) errs.push("Giá ưu đãi không được cao hơn giá niêm yết");
  }
  if (p.sortOrder != null && (!Number.isInteger(p.sortOrder) || p.sortOrder < 0 || p.sortOrder > 999)) errs.push("Thứ tự hiển thị từ 0 đến 999");
  if (opts.courseSessions != null && p.sessions > opts.courseSessions) errs.push(`Gói ${p.sessions} buổi nhiều hơn số buổi của khoá (${opts.courseSessions})`);
  return errs;
}

export interface PrereqEdge { courseId: string; requiredCourseId: string }

/** Thêm cạnh "courseId cần requiredCourseId" — chặn tự tham chiếu và vòng lặp */
export function validatePrerequisite(edges: readonly PrereqEdge[], add: PrereqEdge): string | null {
  if (add.courseId === add.requiredCourseId) return "Khoá không thể là tiên quyết của chính nó";
  if (edges.some((e) => e.courseId === add.courseId && e.requiredCourseId === add.requiredCourseId)) return "Đã có điều kiện này";
  // có đường đi required → ... → course ? thì thêm cạnh sẽ tạo vòng
  const need = new Map<string, string[]>();
  for (const e of edges) need.set(e.courseId, [...(need.get(e.courseId) ?? []), e.requiredCourseId]);
  const stack = [add.requiredCourseId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === add.courseId) return "Tạo vòng lặp tiên quyết (khoá A cần B và B lại cần A)";
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(need.get(cur) ?? []));
  }
  return null;
}

/** Khoá tiên quyết còn thiếu của học viên */
export function missingPrerequisites(required: readonly string[], completedCourseIds: readonly string[]): string[] {
  const done = new Set(completedCourseIds);
  return required.filter((r) => !done.has(r));
}

export interface LessonLite { id: string; sequenceNo: number }

/** Đổi chỗ bài học lên/xuống — trả về thứ tự mới [{id, sequenceNo}] */
export function moveLesson(lessons: readonly LessonLite[], id: string, dir: "up" | "down"): LessonLite[] {
  const sorted = [...lessons].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const i = sorted.findIndex((l) => l.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return sorted.map((l, k) => ({ id: l.id, sequenceNo: k + 1 }));
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  return sorted.map((l, k) => ({ id: l.id, sequenceNo: k + 1 }));
}

/** Kiểm tra giáo trình trước khi đưa vào sử dụng */
export function curriculumReadiness(lessonCount: number, courseSessions: number): string[] {
  const errs: string[] = [];
  if (lessonCount === 0) errs.push("Giáo trình chưa có bài học");
  if (lessonCount > courseSessions) errs.push(`Giáo trình có ${lessonCount} bài, nhiều hơn số buổi của khoá (${courseSessions})`);
  return errs;
}
