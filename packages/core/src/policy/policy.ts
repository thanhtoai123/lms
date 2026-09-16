/**
 * Policy engine: phân quyền theo (role × scope cơ sở × ownership).
 * Nguồn sự thật cho quyền là ở đây (service layer); RLS trong Postgres chỉ là lớp phòng thủ cuối.
 *
 * Quyền viết dạng "resource:action". Wildcard "*" cho cả hai vế.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "HO_ACCOUNTANT",
  "HO_HR",
  "HO_MARKETING",
  "HO_SALE",
  "TRAINING",
  "AUDITOR",
  "CENTER_MANAGER",
  "CENTER_CLASS_MANAGER",
  "CENTER_SALES_CSM",
  "CENTER_ACCOUNTANT",
  "CENTER_HR",
  "TEACHER",
  "ASSISTANT_TEACHER",
  "PARENT",
  "STUDENT",
] as const;
export type Role = (typeof ROLES)[number];

/** Nhãn hiển thị (khớp cách gọi trên admin.satarobo.vn) */
export const ROLE_LABEL_VI: Record<Role, string> = {
  SUPER_ADMIN: "Quản trị tối cao",
  HO_ACCOUNTANT: "Kế toán Hội sở",
  HO_HR: "Nhân sự Hội sở",
  HO_MARKETING: "Marketing Hội sở",
  HO_SALE: "Tư vấn Hội sở",
  TRAINING: "Đào tạo",
  AUDITOR: "Kiểm soát",
  CENTER_MANAGER: "Quản lý cơ sở",
  CENTER_CLASS_MANAGER: "Giáo vụ cơ sở",
  CENTER_SALES_CSM: "Tư vấn / CSKH cơ sở",
  CENTER_ACCOUNTANT: "Kế toán cơ sở",
  CENTER_HR: "Nhân sự cơ sở",
  TEACHER: "Giáo viên",
  ASSISTANT_TEACHER: "Trợ giảng",
  PARENT: "Phụ huynh",
  STUDENT: "Học viên",
};

/** Vai trò được vào khu quản trị (admin). PH/HV dùng app riêng. */
export const STAFF_ROLES: readonly Role[] = ROLES.filter((r) => r !== "PARENT" && r !== "STUDENT");

export type Permission = `${string}:${string}`;

/** Role được gán theo phạm vi: null centerId = toàn hệ thống (Hội sở) */
export interface RoleAssignment {
  role: Role;
  centerId: string | null;
}

export interface Actor {
  userId: string;
  assignments: RoleAssignment[];
  /** Với TEACHER: id giáo viên; với PARENT: id phụ huynh */
  personId?: string | null;
}

export interface ResourceRef {
  centerId?: string | null;
  /** id chủ sở hữu (vd teacherId của buổi học, parentId của học viên) */
  ownerIds?: string[];
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ["*:*"],
  HO_ACCOUNTANT: ["finance:*", "student:read", "enrollment:read", "class:read", "report:read", "course:read"],
  HO_HR: ["staff:*", "teacher:*", "timesheet:*", "report:read"],
  HO_MARKETING: ["lead:read", "lead:create", "marketing:*", "site:*", "report:read"],
  HO_SALE: ["lead:create", "lead:read_own", "lead:update_own"],
  TRAINING: ["curriculum:*", "course:*", "lesson:*", "document:*", "class:read", "session:read", "report_card:*", "report:read", "teacher:read", "teacher:evaluate", "holiday:read"],
  AUDITOR: ["*:read"],
  CENTER_MANAGER: [
    "lead:*", "student:*", "enrollment:*", "class:*", "session:*", "attendance:*", "session_note:*", "media:*",
    "teacher:read", "staff:read", "finance:read", "finance:create", "finance:approve", "report_card:*", "report:read", "makeup:*", "automation:*", "care:*", "inventory:*",
    "room:*", "center:read", "parent_account:*", "teacher:evaluate", "holiday:*", "course:read", "curriculum:read",
  ],
  CENTER_CLASS_MANAGER: ["class:read", "class:create", "class:update", "session:*", "attendance:*", "session_note:*", "media:*", "student:read", "student:update", "enrollment:read", "enrollment:update", "makeup:*", "teacher:read", "room:*", "center:read", "report_card:*", "holiday:read", "course:read", "curriculum:read"],
  CENTER_SALES_CSM: ["lead:*", "student:read", "student:create", "student:update", "enrollment:create", "enrollment:read", "enrollment:update", "class:read", "session:read", "makeup:*", "care:*", "parent_account:*", "center:read", "course:read", "finance:read", "finance:create"],
  CENTER_ACCOUNTANT: ["finance:*", "enrollment:read", "student:read", "class:read", "course:read", "center:read"],
  CENTER_HR: ["staff:*", "teacher:*", "timesheet:*"],
  TEACHER: ["course:read", "curriculum:read", "class:read_own", "session:read_own", "session:update_own", "attendance:write_own", "session_note:write_own", "media:write_own", "report_card:write_own", "report_card:read_own", "student:read_own"],
  ASSISTANT_TEACHER: ["course:read", "curriculum:read", "class:read_own", "session:read_own", "attendance:write_own", "media:write_own", "student:read_own"],
  PARENT: ["student:read_own", "session:read_own", "attendance:read_own", "finance:read_own", "makeup:request_own"],
  STUDENT: ["session:read_own", "assignment:*_own"],
};

function matches(granted: Permission, wanted: Permission): boolean {
  const [gr, ga] = granted.split(":") as [string, string];
  const [wr, wa] = wanted.split(":") as [string, string];
  const resOk = gr === "*" || gr === wr;
  if (!resOk) return false;
  if (ga === "*") return true;
  if (ga === wa) return true;
  // "*_own" khớp mọi action có hậu tố _own
  if (ga === "*_own" && wa.endsWith("_own")) return true;
  return false;
}

export interface Decision {
  allowed: boolean;
  reason: string;
  via?: RoleAssignment;
}

/**
 * Kiểm tra actor có thể thực hiện action trên resource không.
 * Thứ tự: quyền global (centerId null) → quyền theo đúng cơ sở → quyền *_own khi actor là owner.
 */
export function authorize(actor: Actor, wanted: Permission, resource: ResourceRef = {}): Decision {
  const [res, act] = wanted.split(":") as [string, string];
  const ownVariant: Permission = act.endsWith("_own") ? wanted : `${res}:${act}_own`;
  const isOwner = !!actor.personId && (resource.ownerIds ?? []).includes(actor.personId);

  for (const a of actor.assignments) {
    const perms = ROLE_PERMISSIONS[a.role] ?? [];
    const scopeOk = a.centerId === null || resource.centerId === undefined || resource.centerId === null || a.centerId === resource.centerId;

    for (const p of perms) {
      if (matches(p, wanted) && scopeOk) {
        // quyền không _own yêu cầu đúng scope; quyền _own thêm yêu cầu owner
        if (!wanted.endsWith("_own")) return { allowed: true, reason: `${a.role} có ${p}`, via: a };
        if (isOwner) return { allowed: true, reason: `${a.role} có ${p} và là chủ sở hữu`, via: a };
      }
      if (matches(p, ownVariant) && scopeOk && isOwner) {
        return { allowed: true, reason: `${a.role} có ${p} (own) và là chủ sở hữu`, via: a };
      }
    }
  }
  return { allowed: false, reason: `Không có quyền ${wanted}` };
}

export function assertAuthorized(actor: Actor, wanted: Permission, resource?: ResourceRef): void {
  const d = authorize(actor, wanted, resource);
  if (!d.allowed) throw new ForbiddenError(d.reason);
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Danh sách centerId actor được thấy; null = tất cả */
export function visibleCenterIds(actor: Actor): string[] | null {
  if (actor.assignments.some((a) => a.centerId === null)) return null;
  return [...new Set(actor.assignments.map((a) => a.centerId!).filter(Boolean))];
}

/**
 * Kiểm tra "có quyền này ở đâu đó không" — bỏ qua phạm vi cơ sở và quyền sở hữu.
 * Dùng để hiện/ẩn menu; kiểm tra thật vẫn là authorize() ở service.
 */
export function hasPermission(actor: Actor, wanted: Permission): boolean {
  const [res, act] = wanted.split(":") as [string, string];
  const own: Permission = act.endsWith("_own") ? wanted : `${res}:${act}_own`;
  return actor.assignments.some((a) => (ROLE_PERMISSIONS[a.role] ?? []).some((p) => matches(p, wanted) || matches(p, own)));
}

export function hasRole(actor: Actor, ...roles: Role[]): boolean {
  return actor.assignments.some((a) => roles.includes(a.role));
}

/** Phơi bày để test và để trang "Vai trò & quyền" hiển thị */
export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
