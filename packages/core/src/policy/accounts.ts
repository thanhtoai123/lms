import { type Role, type Actor, hasRole, permissionsOf, type Permission } from "./policy.js";

/** Vai trò cấp Hội sở — luôn gán toàn hệ thống (centerId null) */
export const GLOBAL_ROLES: readonly Role[] = ["SUPER_ADMIN", "HO_ACCOUNTANT", "HO_HR", "HO_MARKETING", "HO_SALE", "TRAINING", "AUDITOR"];
/** Vai trò cơ sở — bắt buộc chọn cơ sở */
export const CENTER_ROLES: readonly Role[] = ["CENTER_MANAGER", "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER"];
/** Vai trò gán được từ màn Tài khoản (PH/HV có luồng kích hoạt riêng) */
export const ASSIGNABLE_ROLES: readonly Role[] = [...GLOBAL_ROLES, ...CENTER_ROLES];

export interface RoleGrantCheck { actor: Actor; role: Role; centerId: string | null; targetUserId: string }

export function validateRoleGrant(c: RoleGrantCheck): string[] {
  const errs: string[] = [];
  if (!ASSIGNABLE_ROLES.includes(c.role)) errs.push("Vai trò này không gán từ màn Tài khoản");
  if (GLOBAL_ROLES.includes(c.role) && c.centerId) errs.push("Vai trò Hội sở áp dụng toàn hệ thống, không chọn cơ sở");
  if (CENTER_ROLES.includes(c.role) && !c.centerId) errs.push("Vai trò cơ sở cần chọn cơ sở");
  if (c.role === "SUPER_ADMIN" && !hasRole(c.actor, "SUPER_ADMIN")) errs.push("Chỉ Quản trị tối cao được cấp vai trò Quản trị tối cao");
  return errs;
}

export function validateRoleRevoke(c: { actor: Actor; role: Role; targetUserId: string; remainingSuperAdmins: number }): string[] {
  const errs: string[] = [];
  if (c.role === "SUPER_ADMIN") {
    if (c.targetUserId === c.actor.userId) errs.push("Không tự gỡ vai trò Quản trị tối cao của chính mình");
    if (c.remainingSuperAdmins <= 1) errs.push("Hệ thống phải còn ít nhất một Quản trị tối cao");
    if (!hasRole(c.actor, "SUPER_ADMIN")) errs.push("Chỉ Quản trị tối cao được gỡ vai trò này");
  }
  return errs;
}

export function validateLock(c: { actor: Actor; targetUserId: string; targetIsSuperAdmin: boolean; activeSuperAdmins: number; lock: boolean; reason?: string | null }): string[] {
  const errs: string[] = [];
  if (!c.lock) return errs;
  if (c.targetUserId === c.actor.userId) errs.push("Không tự khoá tài khoản của chính mình");
  if (c.targetIsSuperAdmin && c.activeSuperAdmins <= 1) errs.push("Không khoá Quản trị tối cao cuối cùng");
  if ((c.reason ?? "").trim().length < 5) errs.push("Khoá tài khoản cần lý do (tối thiểu 5 ký tự)");
  return errs;
}

/** Nhóm tài nguyên hiển thị ở ma trận Vai trò & quyền */
export const PERMISSION_RESOURCES: { key: string; label: string; group: string }[] = [
  { key: "lead", label: "Lead / CRM", group: "Tuyển sinh" },
  { key: "student", label: "Học viên", group: "Học viên" },
  { key: "parent_account", label: "Tài khoản PH", group: "Học viên" },
  { key: "enrollment", label: "Đăng ký học", group: "Học viên" },
  { key: "class", label: "Lớp học", group: "Đào tạo" },
  { key: "session", label: "Buổi học", group: "Đào tạo" },
  { key: "attendance", label: "Điểm danh", group: "Đào tạo" },
  { key: "session_note", label: "Nhận xét buổi", group: "Đào tạo" },
  { key: "media", label: "Ảnh lớp học", group: "Đào tạo" },
  { key: "makeup", label: "Học bù", group: "Đào tạo" },
  { key: "report_card", label: "Học bạ", group: "Đào tạo" },
  { key: "curriculum", label: "Chương trình học", group: "Học thuật" },
  { key: "course", label: "Khoá học", group: "Học thuật" },
  { key: "document", label: "Tài liệu", group: "Học thuật" },
  { key: "assignment", label: "Bài tập về nhà", group: "Học thuật" },
  { key: "care", label: "Chăm sóc HV", group: "Chăm sóc" },
  { key: "coin", label: "SataCoin", group: "Chăm sóc" },
  { key: "automation", label: "Tự động hoá", group: "Chăm sóc" },
  { key: "teacher", label: "Giáo viên", group: "Nhân sự" },
  { key: "staff", label: "Nhân sự", group: "Nhân sự" },
  { key: "timesheet", label: "Chấm công", group: "Nhân sự" },
  { key: "finance", label: "Tài chính", group: "Tài chính" },
  { key: "inventory", label: "Kho / học cụ", group: "Vận hành" },
  { key: "center", label: "Cơ sở", group: "Vận hành" },
  { key: "room", label: "Phòng học", group: "Vận hành" },
  { key: "marketing", label: "Marketing", group: "Marketing" },
  { key: "site", label: "Website", group: "Marketing" },
  { key: "report", label: "Báo cáo", group: "Báo cáo" },
  { key: "compliance", label: "Tuân thủ dữ liệu cá nhân", group: "Hệ thống" },
  { key: "recruit", label: "Tuyển dụng", group: "Nhân sự" },
  { key: "message", label: "Tin nhắn / hội thoại", group: "CSKH" },
  { key: "affiliate", label: "Nguồn giới thiệu", group: "Tuyển sinh" },
  { key: "trials", label: "Lớp trải nghiệm", group: "Tuyển sinh" },
  { key: "system", label: "Hệ thống / tài khoản", group: "Hệ thống" },
  { key: "audit", label: "Audit Log", group: "Hệ thống" },
];

export type AccessLevel = "full" | "write" | "read" | "own" | "none";

/** Mức truy cập của vai trò trên một tài nguyên (tóm tắt để hiển thị) */
export function accessLevel(role: Role, resource: string): { level: AccessLevel; actions: string[] } {
  const perms = permissionsOf(role) as readonly Permission[];
  const actions: string[] = [];
  let level: AccessLevel = "none";
  const rank: Record<AccessLevel, number> = { none: 0, own: 1, read: 2, write: 3, full: 4 };
  const up = (l: AccessLevel) => { if (rank[l] > rank[level]) level = l; };
  for (const p of perms) {
    const [r, a] = p.split(":") as [string, string];
    if (r !== "*" && r !== resource) continue;
    actions.push(a);
    if (a === "*") up("full");
    else if (a === "read") up("read");
    else if (a.endsWith("_own")) up("own");
    else up("write");
  }
  return { level, actions };
}

