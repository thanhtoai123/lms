/**
 * Nhân bản mô hình mẫu thành một trung tâm (tenant) mới — "một chạm".
 *
 * Hai bước:
 *  1. `previewProvision` — bảng kê "sẽ tạo những gì, bao nhiêu bản ghi" (không ghi gì);
 *  2. `provision` — ghi trong MỘT transaction, bắt buộc nhập lý do, có audit.
 *
 * CHỈ sao chép KHUNG VẬN HÀNH: khoá học, gói học phí, chương trình học, mã ca làm việc,
 * chính sách hoa hồng, danh mục thông báo, cấu hình vận hành, phương thức thanh toán,
 * mẫu email/ZNS, nhóm quyền.
 *
 * KHÔNG sao chép bất kỳ dữ liệu cá nhân nào: không lead, không học viên, không phụ huynh,
 * không nhân sự, không giao dịch. Tài khoản quản trị của trung tâm mới ở trạng thái
 * "chờ kích hoạt" — KHÔNG đặt và KHÔNG sinh mật khẩu; người dùng tự kích hoạt qua luồng mời sẵn có.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  tenants, tenantSettings, centers, rooms, orgUnits, legalEntities, users, userRoles, appSettings,
  courses, coursePackages, curricula, lessons, workShifts, commissionPolicies, commissionPolicyShares, commissionPolicyTiers,
  notificationTypes, paymentMethods, emailTemplates, userGroups, userGroupPermissions,
} from "@satarobo/db";
import {
  validateTenantCode, defaultTenantSettings, requireReason, buildPath, isEmail,
  TENANT_TYPES, type TenantType,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { assertTenant } from "./tenantScope";

type Db = ProtectedContext["db"];
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });

/** Một dòng trong bảng kê "sẽ tạo những gì" */
export interface ProvisionLine {
  key: string;
  label: string;
  /** Số bản ghi sẽ sao chép / sẽ tạo */
  count: number;
  kind: "copy" | "create" | "skip";
  note?: string;
}

export interface ProvisionInput {
  /** Tenant nguồn dùng làm mô hình mẫu */
  sourceTenantId: string;
  type?: TenantType;
  code: string;
  name: string;
  legalName?: string | null;
  taxCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contractNo?: string | null;
  contractFrom?: string | null;
  contractTo?: string | null;
  /** Cơ sở đầu tiên */
  centerCode: string;
  centerName: string;
  centerAddress?: string | null;
  /** Số phòng học mẫu tạo sẵn (0–10) */
  roomCount?: number;
  /** Tài khoản quản trị của trung tâm mới — chờ kích hoạt, không có mật khẩu */
  adminEmail: string;
  adminFullName: string;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Đếm để lập bảng kê                                                  */
/* ------------------------------------------------------------------ */

/** Danh mục của mô hình mẫu: hàng của chính tenant đó + hàng dùng chung (chưa gắn tenant) */
const ofSource = (col: typeof courses.tenantId, tenantId: string) => or(eq(col, tenantId), isNull(col))!;
const n = (rows: { n: number }[]) => rows[0]?.n ?? 0;

/** Bảng kê: sao chép gì, tạo mới gì, KHÔNG đụng gì */
export async function previewProvision(ctx: ProtectedContext, input: { sourceTenantId: string; roomCount?: number }) {
  requirePermission(ctx, "tenant:provision");
  const source = ctx.tenants.find((t) => t.id === input.sourceTenantId);
  if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy mô hình mẫu" });
  assertTenant(ctx, { tenantId: source.id }, "Mô hình mẫu");
  const t = source.id;
  const db = ctx.db;
  const roomCount = Math.min(10, Math.max(0, input.roomCount ?? 2));
  const cnt = { n: sql<number>`count(*)::int` };

  const [courseR, packageR, curriculumR, lessonR, shiftR, policyR, notifR, methodR, emailR, groupR, permR, opsRow] = await Promise.all([
    db.select(cnt).from(courses).where(and(eq(courses.isActive, true), ofSource(courses.tenantId, t))),
    db.select(cnt).from(coursePackages).where(and(eq(coursePackages.isActive, true), ofSource(coursePackages.tenantId, t))),
    db.select(cnt).from(curricula).where(and(eq(curricula.isActive, true), ofSource(curricula.tenantId, t))),
    db.select(cnt).from(lessons).where(sql`exists (select 1 from ${curricula} c where c.id = ${lessons.curriculumId} and c.is_active and (c.tenant_id = ${t} or c.tenant_id is null))`),
    db.select(cnt).from(workShifts).where(and(eq(workShifts.isActive, true), isNull(workShifts.centerId), ofSource(workShifts.tenantId, t))),
    db.select(cnt).from(commissionPolicies).where(and(eq(commissionPolicies.isActive, true), isNull(commissionPolicies.centerId), ofSource(commissionPolicies.tenantId, t))),
    db.select(cnt).from(notificationTypes).where(ofSource(notificationTypes.tenantId, t)),
    db.select(cnt).from(paymentMethods).where(and(eq(paymentMethods.isActive, true), isNull(paymentMethods.centerId), ofSource(paymentMethods.tenantId, t))),
    db.select(cnt).from(emailTemplates).where(ofSource(emailTemplates.tenantId, t)),
    db.select(cnt).from(userGroups).where(and(isNull(userGroups.centerId), ofSource(userGroups.tenantId, t))),
    db.select(cnt).from(userGroupPermissions).where(sql`exists (select 1 from ${userGroups} g where g.id = ${userGroupPermissions.groupId} and g.center_id is null and (g.tenant_id = ${t} or g.tenant_id is null))`),
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "ops")).limit(1),
  ]);
  const courseN = n(courseR), packageN = n(packageR), curriculumN = n(curriculumR), lessonN = n(lessonR);
  const shiftN = n(shiftR), policyN = n(policyR), notifN = n(notifR), methodN = n(methodR);
  const emailN = n(emailR), groupN = n(groupR), permN = n(permR);

  const copy: ProvisionLine[] = [
    { key: "courses", label: "Khoá học", count: courseN, kind: "copy" },
    { key: "coursePackages", label: "Gói học phí", count: packageN, kind: "copy" },
    { key: "curricula", label: "Chương trình học (giáo trình)", count: curriculumN, kind: "copy", note: `${lessonN} bài học` },
    { key: "workShifts", label: "Mã ca làm việc", count: shiftN, kind: "copy" },
    { key: "commissionPolicies", label: "Chính sách hoa hồng", count: policyN, kind: "copy", note: "kèm mức chia theo vai và bảng bậc" },
    { key: "notificationTypes", label: "Danh mục loại thông báo", count: notifN, kind: "copy" },
    { key: "paymentMethods", label: "Phương thức thanh toán", count: methodN, kind: "copy" },
    { key: "emailTemplates", label: "Mẫu email / ZNS", count: emailN, kind: "copy" },
    { key: "userGroups", label: "Nhóm quyền", count: groupN, kind: "copy", note: `${permN} dòng quyền` },
    { key: "opsSettings", label: "Cấu hình vận hành", count: opsRow.length ? 1 : 0, kind: "copy", note: "áp cho cơ sở đầu tiên" },
  ];

  const create: ProvisionLine[] = [
    { key: "tenant", label: "Trung tâm (tenant) mới", count: 1, kind: "create" },
    { key: "tenantSettings", label: "Tuỳ chọn quyền riêng tư", count: 1, kind: "create", note: "mặc định: Hội sở KHÔNG thấy PII và chi tiết tài chính" },
    { key: "orgUnits", label: "Đơn vị tổ chức (gốc → hội sở → cơ sở)", count: 3, kind: "create" },
    { key: "legalEntities", label: "Pháp nhân", count: 1, kind: "create", note: "khai mã số thuế thì tạo, để trống thì bỏ qua" },
    { key: "centers", label: "Cơ sở đầu tiên", count: 1, kind: "create" },
    { key: "rooms", label: "Phòng học mẫu", count: roomCount, kind: "create" },
    { key: "adminUser", label: "Tài khoản quản trị trung tâm", count: 1, kind: "create", note: "trạng thái CHỜ KÍCH HOẠT — không đặt mật khẩu, người dùng tự kích hoạt qua thư mời" },
  ];

  const skip: ProvisionLine[] = [
    { key: "leads", label: "Lead / khách tiềm năng", count: 0, kind: "skip", note: "không sao chép dữ liệu cá nhân" },
    { key: "students", label: "Học viên & phụ huynh", count: 0, kind: "skip", note: "không sao chép dữ liệu cá nhân" },
    { key: "staff", label: "Nhân sự & chấm công", count: 0, kind: "skip", note: "không sao chép dữ liệu cá nhân" },
    { key: "finance", label: "Đơn hàng, phiếu thu, công nợ", count: 0, kind: "skip", note: "không sao chép giao dịch" },
    { key: "classes", label: "Lớp học & buổi học", count: 0, kind: "skip", note: "trung tâm mới tự mở lớp" },
  ];

  return {
    source: { id: source.id, code: source.code, name: source.name },
    lines: [...copy, ...create, ...skip],
    totalCopy: copy.reduce((a, l) => a + l.count, 0) + lessonN + permN,
    totalCreate: create.reduce((a, l) => a + l.count, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Nhân bản thật                                                       */
/* ------------------------------------------------------------------ */

function normCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

export async function provision(ctx: ProtectedContext, input: ProvisionInput) {
  requirePermission(ctx, "tenant:provision");
  const reason = requireReason(input.reason, 10);
  const code = normCode(input.code);
  const codeErr = validateTenantCode(code);
  if (codeErr) throw bad(codeErr);
  const type: TenantType = input.type && TENANT_TYPES.includes(input.type) ? input.type : "FRANCHISE";
  const name = input.name.trim();
  if (name.length < 3) throw bad("Tên trung tâm tối thiểu 3 ký tự");
  const centerCode = normCode(input.centerCode);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(centerCode)) throw bad("Mã cơ sở gồm 2–20 ký tự IN HOA / số / gạch");
  const centerName = input.centerName.trim();
  if (centerName.length < 3) throw bad("Tên cơ sở tối thiểu 3 ký tự");
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!isEmail(adminEmail)) throw bad("Email quản trị không hợp lệ");
  const adminFullName = input.adminFullName.trim();
  if (adminFullName.length < 2) throw bad("Họ tên quản trị tối thiểu 2 ký tự");
  const roomCount = Math.min(10, Math.max(0, input.roomCount ?? 2));

  const source = ctx.tenants.find((t) => t.id === input.sourceTenantId);
  if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy mô hình mẫu" });
  assertTenant(ctx, { tenantId: source.id }, "Mô hình mẫu");
  const src = source.id;

  const dupTenant = await ctx.db.query.tenants.findFirst({ where: eq(tenants.code, code), columns: { id: true } });
  if (dupTenant) throw new TRPCError({ code: "CONFLICT", message: `Mã trung tâm ${code} đã tồn tại` });
  const dupCenter = await ctx.db.query.centers.findFirst({ where: eq(centers.code, centerCode), columns: { id: true } });
  if (dupCenter) throw new TRPCError({ code: "CONFLICT", message: `Mã cơ sở ${centerCode} đã tồn tại — mã cơ sở phải khác nhau trên toàn hệ thống` });
  const dupUser = await ctx.db.query.users.findFirst({ where: eq(users.email, adminEmail), columns: { id: true } });
  if (dupUser) throw new TRPCError({ code: "CONFLICT", message: `Email ${adminEmail} đã có tài khoản` });

  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const created: Record<string, number> = {};
    const bump = (k: string, n = 1) => { created[k] = (created[k] ?? 0) + n; };

    /* 1) Trung tâm (tenant) + tuỳ chọn quyền riêng tư */
    const [tenant] = await tx.insert(tenants).values({
      code, name, type, status: "onboarding",
      parentTenantId: ctx.tenantId, provisionedFromTenantId: src,
      legalName: input.legalName?.trim() || null, taxCode: input.taxCode?.trim() || null,
      address: input.address?.trim() || null, phone: input.phone?.trim() || null, email: input.email?.trim() || null,
      contractNo: input.contractNo?.trim() || null, contractFrom: input.contractFrom || null, contractTo: input.contractTo || null,
      createdBy: ctx.user.id,
    }).returning();
    const tid = tenant!.id;
    bump("tenants");
    await tx.insert(tenantSettings).values({ tenantId: tid, ...defaultTenantSettings(type), updatedBy: ctx.user.id });
    bump("tenantSettings");

    /* 2) Pháp nhân (chỉ khi khai mã số thuế) */
    let legalEntityId: string | null = null;
    if (input.taxCode?.trim()) {
      const [le] = await tx.insert(legalEntities).values({
        tenantId: tid, legalName: input.legalName?.trim() || name, taxCode: input.taxCode.trim(),
        address: input.address?.trim() || null, representative: null,
      }).returning();
      legalEntityId = le!.id;
      bump("legalEntities");
    }

    /* 3) Cơ sở đầu tiên + phòng học mẫu */
    const [center] = await tx.insert(centers).values({
      tenantId: tid, code: centerCode, name: centerName,
      address: input.centerAddress?.trim() || input.address?.trim() || null, phone: input.phone?.trim() || null,
    }).returning();
    bump("centers");
    if (roomCount > 0) {
      await tx.insert(rooms).values(
        Array.from({ length: roomCount }, (_, i) => ({
          tenantId: tid, centerId: center!.id, code: `P${i + 1}`, name: `Phòng ${i + 1}`, capacity: 12, equipment: ["Bảng trắng"] as string[],
        })),
      );
      bump("rooms", roomCount);
    }

    /* 4) Đơn vị tổ chức: gốc → hội sở → cơ sở (mã có tiền tố mã trung tâm để không đụng chuỗi gốc) */
    const rootPath = buildPath(null, code);
    const [rootUnit] = await tx.insert(orgUnits).values({
      tenantId: tid, code, name, type: "root", parentId: null, path: rootPath,
      relationshipType: type === "FRANCHISE" ? "franchise" : "owned", legalEntityId, address: input.address?.trim() || null,
    }).returning();
    const hoCode = `${code}_HO`;
    const [hoUnit] = await tx.insert(orgUnits).values({
      tenantId: tid, code: hoCode, name: `${name} — Văn phòng`, type: "ho", parentId: rootUnit!.id, path: buildPath(rootPath, hoCode),
      relationshipType: type === "FRANCHISE" ? "franchise" : "owned", legalEntityId,
    }).returning();
    await tx.insert(orgUnits).values({
      tenantId: tid, code: centerCode, name: centerName, type: "center", parentId: hoUnit!.id, path: buildPath(hoUnit!.path, centerCode),
      relationshipType: type === "FRANCHISE" ? "franchise" : "owned", legalEntityId, centerId: center!.id,
      address: input.centerAddress?.trim() || null,
    });
    bump("orgUnits", 3);

    /* 5) Sao chép danh mục vận hành — KHÔNG kèm bất kỳ dữ liệu cá nhân nào */
    const mineOrShared = (col: typeof courses.tenantId) => ofSource(col, src);

    // 5a. Khoá học → gói học phí → giáo trình → bài học (giữ liên kết bằng bảng ánh xạ id cũ → id mới)
    const srcCourses = await tx.select().from(courses).where(and(eq(courses.isActive, true), mineOrShared(courses.tenantId)));
    const courseMap = new Map<string, string>();
    for (const c of srcCourses) {
      const [row] = await tx.insert(courses).values({
        tenantId: tid, code: c.code, name: c.name, slug: c.slug ? `${c.slug}-${code.toLowerCase()}` : null,
        gradeFrom: c.gradeFrom, gradeTo: c.gradeTo, totalSessions: c.totalSessions, sessionMinutes: c.sessionMinutes,
        listPrice: c.listPrice, description: c.description, level: c.level, isActive: true,
      }).returning({ id: courses.id });
      courseMap.set(c.id, row!.id);
    }
    bump("courses", srcCourses.length);

    const srcPackages = srcCourses.length
      ? await tx.select().from(coursePackages).where(and(eq(coursePackages.isActive, true), inArray(coursePackages.courseId, srcCourses.map((c) => c.id))))
      : [];
    if (srcPackages.length) {
      await tx.insert(coursePackages).values(srcPackages.map((p) => ({
        tenantId: tid, courseId: courseMap.get(p.courseId)!, code: p.code, name: p.name, level: p.level, sessions: p.sessions,
        listPrice: p.listPrice, salePrice: p.salePrice, description: p.description, isFeatured: p.isFeatured, isActive: true, sortOrder: p.sortOrder,
      })));
      bump("coursePackages", srcPackages.length);
    }

    const srcCurricula = srcCourses.length
      ? await tx.select().from(curricula).where(and(eq(curricula.isActive, true), inArray(curricula.courseId, srcCourses.map((c) => c.id))))
      : [];
    let lessonCount = 0;
    for (const cu of srcCurricula) {
      const [row] = await tx.insert(curricula).values({
        tenantId: tid, courseId: courseMap.get(cu.courseId)!, name: cu.name, version: cu.version, status: cu.status,
        description: cu.description, isActive: true,
      }).returning({ id: curricula.id });
      const srcLessons = await tx.select().from(lessons).where(eq(lessons.curriculumId, cu.id));
      if (srcLessons.length) {
        await tx.insert(lessons).values(srcLessons.map((l) => ({
          curriculumId: row!.id, sequenceNo: l.sequenceNo, title: l.title, objectives: l.objectives, materials: l.materials,
          isReportCardMilestone: l.isReportCardMilestone,
        })));
        lessonCount += srcLessons.length;
      }
    }
    bump("curricula", srcCurricula.length);
    bump("lessons", lessonCount);

    // 5b. Mã ca làm việc dùng chung (center_id null)
    const srcShifts = await tx.select().from(workShifts).where(and(eq(workShifts.isActive, true), isNull(workShifts.centerId), mineOrShared(workShifts.tenantId)));
    if (srcShifts.length) {
      await tx.insert(workShifts).values(srcShifts.map((s) => ({
        tenantId: tid, centerId: null, code: s.code, name: s.name, kind: s.kind, units: s.units, segments: s.segments,
        plannedMinutes: s.plannedMinutes, workplace: s.workplace, punchRequired: s.punchRequired, dayCredit: s.dayCredit,
        isLeave: s.isLeave, nominalMinutes: s.nominalMinutes, payMode: s.payMode, attendanceMode: s.attendanceMode,
        sortOrder: s.sortOrder, isActive: true, note: s.note,
      })));
      bump("workShifts", srcShifts.length);
    }

    // 5c. Chính sách hoa hồng + mức chia theo vai + bảng bậc
    const srcPolicies = await tx.select().from(commissionPolicies).where(and(eq(commissionPolicies.isActive, true), isNull(commissionPolicies.centerId), mineOrShared(commissionPolicies.tenantId)));
    let shareCount = 0;
    let tierCount = 0;
    for (const p of srcPolicies) {
      const [row] = await tx.insert(commissionPolicies).values({
        tenantId: tid, name: p.name, event: p.event, orderScope: p.orderScope, centerId: null, calcMethod: p.calcMethod,
        sourceRef: p.sourceRef, note: p.note, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo, isActive: true, createdBy: ctx.user.id,
      }).returning({ id: commissionPolicies.id });
      const shares = await tx.select().from(commissionPolicyShares).where(eq(commissionPolicyShares.policyId, p.id));
      for (const sh of shares) {
        const [newShare] = await tx.insert(commissionPolicyShares).values({
          policyId: row!.id, role: sh.role, value: sh.value, maxAmount: sh.maxAmount, sortOrder: sh.sortOrder,
        }).returning({ id: commissionPolicyShares.id });
        shareCount += 1;
        const tiers = await tx.select().from(commissionPolicyTiers).where(eq(commissionPolicyTiers.shareId, sh.id));
        if (tiers.length) {
          await tx.insert(commissionPolicyTiers).values(tiers.map((ti) => ({
            shareId: newShare!.id, fromAmount: ti.fromAmount, toAmount: ti.toAmount, amount: ti.amount, percent: ti.percent, sortOrder: ti.sortOrder,
          })));
          tierCount += tiers.length;
        }
      }
    }
    bump("commissionPolicies", srcPolicies.length);
    bump("commissionPolicyShares", shareCount);
    bump("commissionPolicyTiers", tierCount);

    // 5d. Danh mục loại thông báo
    const srcNotif = await tx.select().from(notificationTypes).where(mineOrShared(notificationTypes.tenantId));
    if (srcNotif.length) {
      await tx.insert(notificationTypes).values(srcNotif.map((n) => ({
        tenantId: tid, prefix: n.prefix, label: n.label, groupKey: n.groupKey, groupLabel: n.groupLabel,
        priority: n.priority, recipients: n.recipients, pushEnabled: n.pushEnabled, isActive: n.isActive, updatedBy: ctx.user.id,
      })));
      bump("notificationTypes", srcNotif.length);
    }

    // 5e. Phương thức thanh toán dùng chung — KHÔNG chép số tài khoản ngân hàng của chuỗi
    const srcMethods = await tx.select().from(paymentMethods).where(and(eq(paymentMethods.isActive, true), isNull(paymentMethods.centerId), mineOrShared(paymentMethods.tenantId)));
    if (srcMethods.length) {
      await tx.insert(paymentMethods).values(srcMethods.map((m) => ({
        tenantId: tid, code: m.code, name: m.name, kind: m.kind, centerId: null,
        // Thông tin ngân hàng là của riêng từng trung tâm → để trống, trung tâm mới tự khai
        bankBin: null, bankName: null, bankBranch: null, accountNo: null, accountName: null,
        description: m.description, allowFor: m.allowFor,
        canBuyCourse: m.canBuyCourse, canBuyPackage: m.canBuyPackage, canBuyExam: m.canBuyExam, canBuyProduct: m.canBuyProduct, canDeposit: m.canDeposit,
        gatewayConfig: null, sortOrder: m.sortOrder, isActive: true,
      })));
      bump("paymentMethods", srcMethods.length);
    }

    // 5f. Mẫu email / ZNS
    const srcEmails = await tx.select().from(emailTemplates).where(mineOrShared(emailTemplates.tenantId));
    if (srcEmails.length) {
      await tx.insert(emailTemplates).values(srcEmails.map((e) => ({
        tenantId: tid, eventKey: e.eventKey, subject: e.subject, body: e.body, isActive: e.isActive, updatedBy: ctx.user.id,
      })));
      bump("emailTemplates", srcEmails.length);
    }

    // 5g. Nhóm quyền (KHÔNG chép thành viên — thành viên là người thật)
    const srcGroups = await tx.select().from(userGroups).where(and(isNull(userGroups.centerId), mineOrShared(userGroups.tenantId)));
    let permCount = 0;
    for (const g of srcGroups) {
      const [row] = await tx.insert(userGroups).values({
        tenantId: tid, name: g.name, description: g.description, centerId: null, createdBy: ctx.user.id,
      }).returning({ id: userGroups.id });
      const perms = await tx.select().from(userGroupPermissions).where(eq(userGroupPermissions.groupId, g.id));
      if (perms.length) {
        await tx.insert(userGroupPermissions).values(perms.map((p) => ({
          groupId: row!.id, permission: p.permission, centerId: null, grantedBy: ctx.user.id, reason: `Nhân bản từ ${source.code}`,
        })));
        permCount += perms.length;
      }
    }
    bump("userGroups", srcGroups.length);
    bump("userGroupPermissions", permCount);

    // 5h. Cấu hình vận hành: lấy mặc định toàn hệ thống của mô hình mẫu, áp cho cơ sở đầu tiên
    const [ops] = await tx.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "ops")).limit(1);
    if (ops?.value) {
      await tx.insert(appSettings).values({ key: `ops:${center!.id}`, value: ops.value, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: ops.value, updatedBy: ctx.user.id, updatedAt: new Date() } });
      bump("opsSettings");
    }

    /* 6) Tài khoản quản trị của trung tâm mới — CHỜ KÍCH HOẠT, không mật khẩu */
    const [admin] = await tx.insert(users).values({
      tenantId: tid, email: adminEmail, fullName: adminFullName, isActive: false,
      lockedReason: "Chờ kích hoạt — người dùng tự đặt mật khẩu qua thư mời",
    }).returning({ id: users.id });
    await tx.insert(userRoles).values({ userId: admin!.id, role: "SUPER_ADMIN", centerId: null, grantedBy: ctx.user.id });
    bump("adminUser");

    /* 7) Nhật ký: ghi ở tenant của người thao tác VÀ ở tenant mới */
    const after = { code, name, type, centerCode, adminEmail, source: source.code, created };
    await writeAudit(db, {
      actorId: ctx.user.id, action: "CREATE", module: "tenant", entity: "tenants", entityId: tid,
      after, reason, ip: ctx.ip,
    });
    await writeAudit(db, {
      actorId: ctx.user.id, action: "CREATE", module: "tenant", entity: "tenants", entityId: tid,
      after, reason, ip: ctx.ip, tenantId: tid,
    });

    return {
      tenantId: tid, code, name, type, centerId: center!.id, centerCode,
      adminUserId: admin!.id, adminEmail,
      created,
      /** Việc người dùng phải tự làm sau khi nhân bản */
      nextSteps: [
        "Gửi thư mời kích hoạt cho tài khoản quản trị trung tâm (Hệ thống → Người dùng → Gửi liên kết đăng nhập)",
        "Khai số tài khoản ngân hàng / mã QR cho từng phương thức thanh toán",
        "Kiểm tra lại giá gói học phí theo hợp đồng nhượng quyền",
        "Đổi trạng thái trung tâm sang Đang hoạt động khi đã sẵn sàng",
      ],
    };
  });
}
