/**
 * Kết thúc hợp đồng nhượng quyền — **bàn giao và khoá dữ liệu**.
 *
 * Bốn thủ tục, theo đúng thứ tự người vận hành làm:
 *  1. `previewOffboard`   — bảng kê: sẽ khoá những gì, bao nhiêu bản ghi, ai mất quyền truy cập;
 *  2. `exportTenantData`  — xuất TOÀN BỘ dữ liệu của trung tâm ra một tệp .zip (CSV + JSON + README);
 *  3. `suspendTenant`     — tạm ngừng: khoá mọi tài khoản, chặn đăng nhập, dữ liệu giữ nguyên;
 *  4. `closeTenant`       — đóng hẳn: như trên, cộng thêm mốc giữ dữ liệu theo `dataRetentionYears`.
 *
 * KHÔNG thủ tục nào xoá dữ liệu. Mọi thủ tục bắt buộc **lý do** và **gõ lại mã trung tâm**,
 * và đều ghi nhật ký ở cả tenant người thao tác lẫn tenant bị tác động.
 *
 * Luật thuần (chuyển trạng thái, xác nhận, mốc giữ dữ liệu) nằm ở `@satarobo/core/org/offboard`.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  tenants, tenantSettings, centers, users, students, parents, teachers, staff, classes, sessions, enrollments,
  leads, orders, payments, courses, coursePackages, trialClasses, attendance, auditLog,
} from "@satarobo/db";
import {
  requireReason, withSettingsDefaults, maskOutsideTenant,
  nextOffboardStatus, locksAccounts, lockReasonFor, validateOffboardConfirm, retentionUntil,
  offboardExportName, offboardWarnings, offboardNextSteps, OFFBOARD_ACTION_VI, OFFBOARD_EFFECT_VI,
  TENANT_STATUS_VI, TENANT_TYPE_VI, TenantOffboardError,
  type OffboardAction, type OffboardLine,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { buildStoredZip } from "../zip";
import { writeAudit } from "./audit";
import { assertTenant, canSeePiiOf } from "./tenantScope";

type Db = ProtectedContext["db"];
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy trung tâm" });

/** Lỗi luật thuần → mã tRPC chuẩn, giữ nguyên câu tiếng Việt */
function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TenantOffboardError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
    throw e;
  }
}

function reasonOf(reason: string | null | undefined, min: number) {
  try {
    return requireReason(reason, min);
  } catch (e) {
    throw bad((e as Error).message);
  }
}

/**
 * Ai được kết thúc hợp đồng: **Quản trị tối cao của chuỗi** (vai trò không gắn cơ sở),
 * và chỉ với trung tâm nằm trong phạm vi dữ liệu của mình. Trung tâm gốc không bao giờ đóng được.
 */
export function canOffboard(ctx: ProtectedContext, tenantId: string): boolean {
  const t = ctx.tenants.find((x) => x.id === tenantId);
  if (!t || t.isDefault) return false;
  if (!ctx.tenantIds.includes(tenantId)) return false;
  return ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN" && a.centerId === null);
}

function loadTenantOr404(ctx: ProtectedContext, tenantId: string) {
  assertTenant(ctx, { tenantId }, "Trung tâm");
  const t = ctx.tenants.find((x) => x.id === tenantId);
  if (!t) throw notFound();
  return t;
}

function requireOffboarder(ctx: ProtectedContext, tenantId: string) {
  requirePermission(ctx, "tenant:offboard");
  if (!canOffboard(ctx, tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chỉ Quản trị tối cao của chuỗi mới kết thúc được hợp đồng nhượng quyền — và không đụng được vào trung tâm gốc",
    });
  }
}

const n = (rows: { n: number }[]) => rows[0]?.n ?? 0;
const cnt = { n: sql<number>`count(*)::int` };

/** Đếm bản ghi của đúng một trung tâm, theo từng nhóm dữ liệu */
async function countsOf(db: Db, tenantId: string) {
  // Cột Drizzle truyền vào hàm dùng chung nhận kiểu AnyPgColumn (như provisionTenant.ts)
  const of = (col: AnyPgColumn) => eq(col, tenantId);
  const [ctr, usr, stu, par, tea, stf, cls, ses, enr, led, ord, pay, crs, pkg, trc, att] = await Promise.all([
    db.select(cnt).from(centers).where(of(centers.tenantId)),
    db.select(cnt).from(users).where(of(users.tenantId)),
    db.select(cnt).from(students).where(of(students.tenantId)),
    db.select(cnt).from(parents).where(of(parents.tenantId)),
    db.select(cnt).from(teachers).where(of(teachers.tenantId)),
    db.select(cnt).from(staff).where(of(staff.tenantId)),
    db.select(cnt).from(classes).where(of(classes.tenantId)),
    db.select(cnt).from(sessions).where(of(sessions.tenantId)),
    db.select(cnt).from(enrollments).where(of(enrollments.tenantId)),
    db.select(cnt).from(leads).where(of(leads.tenantId)),
    db.select(cnt).from(orders).where(of(orders.tenantId)),
    db.select(cnt).from(payments).where(of(payments.tenantId)),
    db.select(cnt).from(courses).where(of(courses.tenantId)),
    db.select(cnt).from(coursePackages).where(of(coursePackages.tenantId)),
    db.select(cnt).from(trialClasses).where(of(trialClasses.tenantId)),
    db.select(cnt).from(attendance).where(of(attendance.tenantId)),
  ]);
  return {
    centers: n(ctr), users: n(usr), students: n(stu), parents: n(par), teachers: n(tea), staff: n(stf),
    classes: n(cls), sessions: n(ses), enrollments: n(enr), leads: n(led), orders: n(ord), payments: n(pay),
    courses: n(crs), coursePackages: n(pkg), trialClasses: n(trc), attendance: n(att),
  };
}

/* ------------------------------------------------------------------ */
/* 1) Bảng kê                                                          */
/* ------------------------------------------------------------------ */

export async function previewOffboard(ctx: ProtectedContext, input: { tenantId: string }) {
  requirePermission(ctx, "tenant:read");
  const t = loadTenantOr404(ctx, input.tenantId);
  const db = ctx.db;
  const c = await countsOf(db, t.id);

  // Ai mất quyền truy cập — danh sách tài khoản sẽ bị khoá
  const accounts = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, isActive: users.isActive })
    .from(users).where(and(eq(users.tenantId, t.id), eq(users.isActive, true))).orderBy(asc(users.email)).limit(200);

  const [openCls] = await db.select(cnt).from(classes).where(and(eq(classes.tenantId, t.id), inArray(classes.status, ["recruiting", "running"])));
  const [activeStu] = await db.select(cnt).from(students).where(and(eq(students.tenantId, t.id), inArray(students.status, ["active", "trial"])));
  const [debtRow] = await db
    .select({
      debt: sql<number>`coalesce(sum(greatest(${orders.total} - coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${orders.id} and p.status = 'confirmed'), 0), 0)), 0)::bigint`,
      orders: sql<number>`count(*)::int`,
    })
    .from(orders).where(and(eq(orders.tenantId, t.id), inArray(orders.status, ["pending_payment", "partially_paid"])));

  const settings = withSettingsDefaults(t.type, t.settings);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const retentionEnd = retentionUntil(today, settings.dataRetentionYears);

  const lines: OffboardLine[] = [
    { key: "users", label: "Tài khoản đăng nhập", count: c.users, kind: "lock", note: "khoá ngay, không đăng nhập được nữa" },
    { key: "centers", label: "Cơ sở", count: c.centers, kind: "keep" },
    { key: "students", label: "Học viên", count: c.students, kind: "export" },
    { key: "parents", label: "Phụ huynh", count: c.parents, kind: "export" },
    { key: "enrollments", label: "Ghi danh", count: c.enrollments, kind: "export" },
    { key: "classes", label: "Lớp học", count: c.classes, kind: "export", note: `${c.sessions} buổi học · ${c.attendance} lượt điểm danh` },
    { key: "leads", label: "Lead / khách tiềm năng", count: c.leads, kind: "export" },
    { key: "orders", label: "Đơn hàng", count: c.orders, kind: "export", note: `${c.payments} phiếu thu` },
    { key: "staff", label: "Nhân sự & giáo viên", count: c.staff + c.teachers, kind: "export" },
    { key: "catalog", label: "Khoá học & gói học phí", count: c.courses + c.coursePackages, kind: "keep" },
    { key: "trialClasses", label: "Lớp học thử", count: c.trialClasses, kind: "keep" },
  ];

  return {
    tenant: { id: t.id, code: t.code, name: t.name, type: t.type, typeLabel: TENANT_TYPE_VI[t.type], status: t.status, statusLabel: TENANT_STATUS_VI[t.status] },
    lines,
    totalRecords: Object.values(c).reduce((a, b) => a + b, 0),
    accounts: accounts.map((a) => ({ id: a.id, email: a.email, fullName: a.fullName })),
    accountsTotal: c.users,
    warnings: offboardWarnings({
      openClasses: openCls?.n ?? 0,
      activeStudents: activeStu?.n ?? 0,
      debt: Number(debtRow?.debt ?? 0),
      openOrders: Number(debtRow?.orders ?? 0),
    }),
    retention: { years: settings.dataRetentionYears, until: retentionEnd },
    nextSteps: offboardNextSteps(t.code, retentionEnd),
    effects: OFFBOARD_EFFECT_VI,
    canOffboard: canOffboard(ctx, t.id),
    /** Người vận hành phải gõ lại đúng chuỗi này để xác nhận */
    confirmWord: t.code,
  };
}

/* ------------------------------------------------------------------ */
/* 2) Bàn giao: xuất toàn bộ dữ liệu ra .zip                            */
/* ------------------------------------------------------------------ */

type Cell = string | number | boolean | Date | null | undefined;

/** Một ô CSV: chặn công thức khi mở bằng Excel, bọc ngoặc khi có dấu phẩy / xuống dòng */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, Cell>[]): string {
  if (!rows.length) return "﻿";
  const headers = Object.keys(rows[0]!);
  const body = rows.map((r) => headers.map((h) => csvCell(r[h])).join(","));
  return `﻿${[headers.join(","), ...body].join("\r\n")}\r\n`;
}

const file = (name: string, text: string) => ({ name, data: Buffer.from(text, "utf8") });

/** Tối đa mỗi bảng — gói bàn giao là ảnh chụp, không phải bản sao lưu toàn hệ thống */
const EXPORT_MAX_ROWS = 50_000;

export async function exportTenantData(ctx: ProtectedContext, input: { tenantId: string; reason: string }) {
  requirePermission(ctx, "tenant:export");
  const t = loadTenantOr404(ctx, input.tenantId);
  if (!canOffboard(ctx, t.id) && ctx.tenantId !== t.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ trung tâm đó hoặc Quản trị tối cao của chuỗi mới xuất được gói bàn giao" });
  }
  const reason = reasonOf(input.reason, 10);
  const db = ctx.db;
  const lim = EXPORT_MAX_ROWS;
  // Người không được xem dữ liệu cá nhân của trung tâm này thì gói bàn giao cũng bị che
  const masked = !canSeePiiOf(ctx, t.id);
  const hide = <T,>(rows: T[]): T[] => (masked ? rows.map((r) => maskOutsideTenant(r)) : rows);

  const [ctr, usr, stu, par, tea, stf, cls, ses, enr, led, ord, pay] = await Promise.all([
    db.select().from(centers).where(eq(centers.tenantId, t.id)).limit(lim),
    db.select({ id: users.id, email: users.email, fullName: users.fullName, isActive: users.isActive, createdAt: users.createdAt }).from(users).where(eq(users.tenantId, t.id)).limit(lim),
    db.select().from(students).where(eq(students.tenantId, t.id)).limit(lim),
    db.select().from(parents).where(eq(parents.tenantId, t.id)).limit(lim),
    db.select().from(teachers).where(eq(teachers.tenantId, t.id)).limit(lim),
    db.select().from(staff).where(eq(staff.tenantId, t.id)).limit(lim),
    db.select().from(classes).where(eq(classes.tenantId, t.id)).limit(lim),
    db.select().from(sessions).where(eq(sessions.tenantId, t.id)).limit(lim),
    db.select().from(enrollments).where(eq(enrollments.tenantId, t.id)).limit(lim),
    db.select().from(leads).where(eq(leads.tenantId, t.id)).limit(lim),
    db.select().from(orders).where(eq(orders.tenantId, t.id)).limit(lim),
    db.select().from(payments).where(eq(payments.tenantId, t.id)).limit(lim),
  ]);

  const parts: { name: string; label: string; rows: Record<string, Cell>[] }[] = [
    { name: "co-so", label: "Cơ sở", rows: ctr as unknown as Record<string, Cell>[] },
    { name: "tai-khoan", label: "Tài khoản đăng nhập (không kèm mật khẩu)", rows: usr as unknown as Record<string, Cell>[] },
    { name: "hoc-vien", label: "Học viên", rows: hide(stu) as unknown as Record<string, Cell>[] },
    { name: "phu-huynh", label: "Phụ huynh", rows: hide(par) as unknown as Record<string, Cell>[] },
    { name: "giao-vien", label: "Giáo viên", rows: hide(tea) as unknown as Record<string, Cell>[] },
    { name: "nhan-su", label: "Nhân sự", rows: hide(stf) as unknown as Record<string, Cell>[] },
    { name: "lop-hoc", label: "Lớp học", rows: cls as unknown as Record<string, Cell>[] },
    { name: "buoi-hoc", label: "Buổi học", rows: ses as unknown as Record<string, Cell>[] },
    { name: "ghi-danh", label: "Ghi danh", rows: enr as unknown as Record<string, Cell>[] },
    { name: "lead", label: "Lead / khách tiềm năng", rows: hide(led) as unknown as Record<string, Cell>[] },
    { name: "don-hang", label: "Đơn hàng", rows: hide(ord) as unknown as Record<string, Cell>[] },
    { name: "phieu-thu", label: "Phiếu thu", rows: hide(pay) as unknown as Record<string, Cell>[] },
  ];

  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const settings = withSettingsDefaults(t.type, t.settings);
  const readme = [
    `# Gói bàn giao dữ liệu — ${t.code} · ${t.name}`,
    "",
    `Ngày xuất: ${today.split("-").reverse().join("/")}`,
    `Người xuất: ${ctx.user.fullName} <${ctx.user.email}>`,
    `Lý do: ${reason}`,
    `Loại trung tâm: ${TENANT_TYPE_VI[t.type]} · Trạng thái: ${TENANT_STATUS_VI[t.status]}`,
    `Thời gian giữ dữ liệu theo cấu hình: ${settings.dataRetentionYears} năm (đến ${retentionUntil(today, settings.dataRetentionYears).split("-").reverse().join("/")})`,
    masked ? "\n> **Lưu ý:** người xuất không có quyền xem dữ liệu cá nhân của trung tâm này, nên tên / SĐT / email / địa chỉ trong gói đã bị che." : "",
    "",
    "## Cấu trúc gói",
    "",
    "Mỗi bảng có hai tệp: `csv/<tên>.csv` (mở bằng Excel, có BOM UTF-8) và `json/<tên>.json` (giữ nguyên kiểu dữ liệu).",
    "",
    "| Tệp | Nội dung | Số dòng |",
    "|---|---|---|",
    ...parts.map((p) => `| \`${p.name}\` | ${p.label} | ${p.rows.length} |`),
    "",
    "## Những gì KHÔNG nằm trong gói",
    "",
    "- Mật khẩu và khoá đăng nhập (hệ thống không lưu mật khẩu dạng đọc được).",
    "- Ảnh lớp và tệp đính kèm — tải riêng từ kho tệp nếu hợp đồng yêu cầu.",
    "- Nhật ký thao tác (audit log) — dữ liệu nội bộ của hệ thống, cung cấp theo yêu cầu bằng văn bản.",
    `- Dữ liệu của trung tâm khác: gói này **chỉ** chứa dòng có \`tenant_id\` của ${t.code}.`,
    "",
    "## Trách nhiệm bảo vệ dữ liệu cá nhân",
    "",
    "Gói này chứa dữ liệu cá nhân của phụ huynh, học viên và nhân sự. Bên nhận có trách nhiệm bảo quản,",
    "sử dụng đúng mục đích đã thoả thuận và xoá / ẩn danh theo cam kết trong hợp đồng và thông báo xử lý dữ liệu.",
    "",
  ].filter(Boolean).join("\n");

  const files = [
    file("README.md", readme),
    ...parts.flatMap((p) => [
      file(`csv/${p.name}.csv`, toCsv(p.rows)),
      file(`json/${p.name}.json`, JSON.stringify(p.rows, null, 2)),
    ]),
  ];
  const zip = buildStoredZip(files);

  const after = { rows: Object.fromEntries(parts.map((p) => [p.name, p.rows.length])), bytes: zip.length, masked };
  await writeAudit(db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "tenant", entity: "tenants", entityId: t.id, after, reason, ip: ctx.ip });
  await writeAudit(db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "tenant", entity: "tenants", entityId: t.id, after, reason, ip: ctx.ip, tenantId: t.id });

  return {
    fileName: offboardExportName(t.code, today),
    /** Nội dung .zip dạng base64 — giao diện dựng Blob rồi tải về */
    contentBase64: zip.toString("base64"),
    bytes: zip.length,
    rows: after.rows,
    masked,
  };
}

/* ------------------------------------------------------------------ */
/* 3) Tạm ngừng / Đóng / Mở lại                                         */
/* ------------------------------------------------------------------ */

export interface OffboardInput {
  tenantId: string;
  /** Gõ lại mã trung tâm để xác nhận */
  confirm: string;
  reason: string;
}

async function applyOffboard(ctx: ProtectedContext, action: OffboardAction, input: OffboardInput) {
  requireOffboarder(ctx, input.tenantId);
  const t = loadTenantOr404(ctx, input.tenantId);
  const confirmErr = validateOffboardConfirm(t.code, input.confirm);
  if (confirmErr) throw bad(confirmErr);
  const reason = reasonOf(input.reason, 10);
  const status = rule(() => nextOffboardStatus(t.status, action, { isDefault: t.isDefault }));
  const settings = withSettingsDefaults(t.type, t.settings);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const retentionEnd = retentionUntil(today, settings.dataRetentionYears);

  const result = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    await db.update(tenants).set({ status, updatedAt: new Date() }).where(eq(tenants.id, t.id));

    let lockedAccounts = 0;
    if (locksAccounts(action)) {
      // Khoá mọi tài khoản của trung tâm: `is_active = false` chặn đăng nhập ngay ở bước dựng ngữ cảnh
      const locked = await db.update(users)
        .set({ isActive: false, lockedAt: new Date(), lockedReason: lockReasonFor(action, t.code) })
        .where(and(eq(users.tenantId, t.id), eq(users.isActive, true)))
        .returning({ id: users.id });
      lockedAccounts = locked.length;
    }

    // Ghi mốc giữ dữ liệu vào ghi chú của trung tâm để đọc lại được sau nhiều năm
    if (action === "close") {
      const note = `Kết thúc hợp đồng ngày ${today} — giữ dữ liệu đến ${retentionEnd} (${settings.dataRetentionYears} năm). Lý do: ${reason}`;
      await db.update(tenants).set({ note, updatedAt: new Date() }).where(eq(tenants.id, t.id));
      await db.insert(tenantSettings).values({ tenantId: t.id, ...settings, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { updatedBy: ctx.user.id, updatedAt: new Date() } });
    }

    const after = { action, status, lockedAccounts, retentionUntil: action === "close" ? retentionEnd : null };
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "tenant", entity: "tenants", entityId: t.id, before: { status: t.status }, after, reason, ip: ctx.ip });
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "tenant", entity: "tenants", entityId: t.id, before: { status: t.status }, after, reason, ip: ctx.ip, tenantId: t.id });
    return { lockedAccounts };
  });

  return {
    ok: true as const,
    action,
    actionLabel: OFFBOARD_ACTION_VI[action],
    status,
    statusLabel: TENANT_STATUS_VI[status],
    lockedAccounts: result.lockedAccounts,
    retentionUntil: action === "close" ? retentionEnd : null,
    nextSteps: action === "close" ? offboardNextSteps(t.code, retentionEnd) : [],
  };
}

/** Tạm ngừng: khoá tài khoản, giữ nguyên dữ liệu, mở lại được */
export function suspendTenant(ctx: ProtectedContext, input: OffboardInput) {
  return applyOffboard(ctx, "suspend", input);
}

/** Đóng hẳn: kết thúc hợp đồng, khoá tài khoản, giữ dữ liệu theo `dataRetentionYears` */
export function closeTenant(ctx: ProtectedContext, input: OffboardInput) {
  return applyOffboard(ctx, "close", input);
}

/** Mở lại trung tâm đã tạm ngừng / đóng nhầm — tài khoản vẫn phải mở khoá bằng tay */
export function reopenTenant(ctx: ProtectedContext, input: OffboardInput) {
  return applyOffboard(ctx, "reopen", input);
}

/** Số dòng nhật ký của trung tâm — chỉ để hiện trong bảng kê, không trả nội dung */
export async function auditCountOf(ctx: ProtectedContext, tenantId: string) {
  loadTenantOr404(ctx, tenantId);
  const [r] = await ctx.db.select(cnt).from(auditLog).where(eq(auditLog.tenantId, tenantId));
  return r?.n ?? 0;
}
