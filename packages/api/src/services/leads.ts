import { and, eq, inArray, sql, asc, desc, ilike, or, isNull, lte, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leads, leadActivities, leadTasks, leadAssignees, leadChildren, users, centers, courses, parents, students, studentGuardians, enrollments, classes } from "@satarobo/db";
import {
  leadTransition, computeSla, normalizeVnPhone, maskPhone, OPEN_LEAD_STATUSES, visibleCenterIds, hasRole, buildStudentCode,
  type LeadStatus, type LeadEvent,
} from "@satarobo/core";
import { resolveAdmissionsPolicy, autoPickAssignee, type Db } from "./admissionsAdmin";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";

const nowIso = () => new Date().toISOString();

/** Vai trò được xem SĐT đầy đủ; còn lại bị che (giảm rò rỉ PII như bảng cũ) */
function canSeeFullPhone(ctx: ProtectedContext) {
  return hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE", "HO_MARKETING");
}

export interface CreateLeadInput {
  parentName: string;
  phone: string;
  email?: string | null;
  childName?: string | null;
  childGrade?: number | null;
  childBirthYear?: number | null;
  school?: string | null;
  interestedCourseId?: string | null;
  centerId?: string | null;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  notes?: string | null;
  consent?: boolean;
  autoAssign?: boolean;
  /** Giao tay ngay khi tạo (bỏ qua chế độ chia) */
  assignedToId?: string | null;
  /** Nhiều con / lead (LeadChild). Nếu rỗng nhưng có childName → tạo 1 dòng từ childName */
  children?: { fullName: string; birthYear?: number | null; grade?: number | null; school?: string | null; interestedCourseId?: string | null; notes?: string | null }[];
}

/**
 * Tạo lead. Dùng bởi cả Ops (có actor) và form web công khai (actorId null).
 * - Chuẩn hoá SĐT; nếu đã có lead MỞ cùng SĐT → không tạo mới, ghi activity vào lead cũ (chống trùng).
 * - Tự phân bổ round-robin theo tải nếu autoAssign.
 * - Emit lead.created → automation tạo việc "gọi trong 15 phút".
 */
export async function createLead(db: ProtectedContext["db"], input: CreateLeadInput, actorId: string | null) {
  const phoneNormalized = normalizeVnPhone(input.phone);
  if (!phoneNormalized) throw new TRPCError({ code: "BAD_REQUEST", message: "Số điện thoại không hợp lệ" });

  return db.transaction(async (tx) => {
    const policy = await resolveAdmissionsPolicy(tx as unknown as Db, input.centerId ?? null);
    const dedupeSince = new Date(Date.now() - policy.dedupeDays * 86_400_000);
    const existing = await tx.query.leads.findFirst({
      where: and(eq(leads.phoneNormalized, phoneNormalized), inArray(leads.status, [...OPEN_LEAD_STATUSES]), isNull(leads.deletedAt), gte(leads.lastTouchAt, dedupeSince)),
    });
    if (existing) {
      await tx.insert(leadActivities).values({
        leadId: existing.id, type: "system", actorId,
        content: `Đăng ký lại từ ${input.source ?? "nguồn khác"}${input.childName ? ` — con: ${input.childName}` : ""}`,
        meta: { duplicateOf: "phone", input: { ...input, phone: maskPhone(phoneNormalized) } },
      });
      await tx.update(leads).set({ lastTouchAt: new Date() }).where(eq(leads.id, existing.id));
      return { lead: existing, duplicated: true as const };
    }

    let assignedToId: string | null = input.assignedToId ?? null;
    let assignMode: string = assignedToId ? "manual" : policy.distributionMode;
    if (!assignedToId && input.autoAssign !== false) {
      assignedToId = await autoPickAssignee(tx as unknown as Db, input.centerId ?? null, policy.distributionMode);
      assignMode = policy.distributionMode;
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        parentName: input.parentName.trim(), phone: input.phone.trim(), phoneNormalized, email: input.email ?? null,
        childName: input.childName ?? null, childGrade: input.childGrade ?? null, childBirthYear: input.childBirthYear ?? null, school: input.school ?? null,
        interestedCourseId: input.interestedCourseId ?? null, centerId: input.centerId ?? null, source: input.source ?? null,
        utmSource: input.utmSource ?? null, utmMedium: input.utmMedium ?? null, utmCampaign: input.utmCampaign ?? null,
        notes: input.notes ?? null, consentAt: input.consent ? new Date() : null,
        assignedToId, assignedAt: assignedToId ? new Date() : null,
      })
      .returning();

    const children = (input.children ?? []).filter((c) => c.fullName?.trim());
    if (children.length === 0 && input.childName?.trim()) children.push({ fullName: input.childName.trim(), grade: input.childGrade ?? null, birthYear: input.childBirthYear ?? null, school: input.school ?? null, interestedCourseId: input.interestedCourseId ?? null });
    if (children.length > 0) {
      await tx.insert(leadChildren).values(children.map((c) => ({ leadId: lead!.id, fullName: c.fullName.trim(), birthYear: c.birthYear ?? null, grade: c.grade ?? null, school: c.school ?? null, interestedCourseId: c.interestedCourseId ?? null, notes: c.notes ?? null })));
      if (!lead!.childName) await tx.update(leads).set({ childName: children[0]!.fullName, childGrade: children[0]!.grade ?? null }).where(eq(leads.id, lead!.id));
    }

    await tx.insert(leadActivities).values({ leadId: lead!.id, type: "system", actorId, content: `Tạo lead từ ${input.source ?? "Ops"}` });
    if (assignedToId) {
      await tx.insert(leadActivities).values({ leadId: lead!.id, type: "assignment", actorId, content: assignMode === "manual" ? "Giao tay" : `Chia tự động (${assignMode})`, meta: { assignedToId, mode: assignMode } });
      await tx.update(leadAssignees).set({ roundsReceived: sql`${leadAssignees.roundsReceived} + 1`, lastAssignedAt: new Date() })
        .where(and(eq(leadAssignees.userId, assignedToId), input.centerId ? or(eq(leadAssignees.centerId, input.centerId), isNull(leadAssignees.centerId))! : sql`true`));
      await emit(tx as unknown as typeof db, { type: "lead.assigned", leadId: lead!.id, assigneeId: assignedToId, mode: assignMode, actorId });
    }
    await emit(tx as unknown as typeof db, { type: "lead.created", leadId: lead!.id, centerId: lead!.centerId, source: lead!.source });
    if (actorId) await writeAudit(tx as unknown as typeof db, { actorId, action: "CREATE", module: "admissions", entity: "leads", entityId: lead!.id, after: { source: input.source } });
    return { lead: lead!, duplicated: false as const };
  });
}

/** Inbox: lead mở của tôi / của cơ sở, kèm SLA, sắp xếp quá hạn trước */
export async function leadInbox(ctx: ProtectedContext, input: { scope: "mine" | "center" | "all"; status?: LeadStatus; centerId?: string; q?: string; limit?: number }) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const conds = [isNull(leads.deletedAt)];
  if (input.status) conds.push(eq(leads.status, input.status));
  else conds.push(inArray(leads.status, [...OPEN_LEAD_STATUSES]));
  if (input.scope === "mine") conds.push(eq(leads.assignedToId, ctx.user.id));
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  if (input.q) {
    const pn = normalizeVnPhone(input.q);
    conds.push(or(ilike(leads.parentName, `%${input.q}%`), ilike(leads.childName, `%${input.q}%`), pn ? eq(leads.phoneNormalized, pn) : sql`false`)!);
  }
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);

  const rows = await ctx.db
    .select({
      id: leads.id, status: leads.status, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, childName: leads.childName, childGrade: leads.childGrade,
      source: leads.source, centerCode: centers.code, courseCode: courses.code, assignedToId: leads.assignedToId, assigneeName: users.fullName,
      lastTouchAt: leads.lastTouchAt, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt,
      openTasks: sql<number>`(select count(*)::int from ${leadTasks} t where t.lead_id = ${leads.id} and t.done_at is null)`,
    })
    .from(leads)
    .leftJoin(centers, eq(centers.id, leads.centerId))
    .leftJoin(courses, eq(courses.id, leads.interestedCourseId))
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...conds))
    .orderBy(asc(leads.lastTouchAt))
    .limit(input.limit ?? 200);

  const now = nowIso();
  const full = canSeeFullPhone(ctx);
  const policy = await resolveAdmissionsPolicy(ctx.db, input.centerId ?? null);
  const items = rows
    .map((r) => ({ ...r, phone: full ? r.phoneNormalized : maskPhone(r.phoneNormalized), sla: computeSla(r.status, r.lastTouchAt.toISOString(), now, policy.sla) }))
    .sort((a, b) => b.sla.overdueMinutes - a.sla.overdueMinutes || a.lastTouchAt.getTime() - b.lastTouchAt.getTime());
  return {
    items,
    summary: {
      total: items.length,
      overdue: items.filter((i) => i.sla.level === "overdue").length,
      warning: items.filter((i) => i.sla.level === "warning").length,
      byStatus: Object.fromEntries(OPEN_LEAD_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])),
    },
  };
}

export async function getLead(ctx: ProtectedContext, id: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, id), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:read", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  const [activities, tasks, assignee, course, center, children] = await Promise.all([
    ctx.db.select({ id: leadActivities.id, type: leadActivities.type, content: leadActivities.content, meta: leadActivities.meta, createdAt: leadActivities.createdAt, actorName: users.fullName })
      .from(leadActivities).leftJoin(users, eq(users.id, leadActivities.actorId)).where(eq(leadActivities.leadId, id)).orderBy(desc(leadActivities.createdAt)).limit(100),
    ctx.db.select().from(leadTasks).where(eq(leadTasks.leadId, id)).orderBy(asc(leadTasks.doneAt), asc(leadTasks.dueAt)),
    lead.assignedToId ? ctx.db.query.users.findFirst({ where: eq(users.id, lead.assignedToId), columns: { id: true, fullName: true } }) : null,
    lead.interestedCourseId ? ctx.db.query.courses.findFirst({ where: eq(courses.id, lead.interestedCourseId), columns: { id: true, code: true, name: true } }) : null,
    lead.centerId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, lead.centerId), columns: { id: true, code: true, name: true } }) : null,
    ctx.db.select({ id: leadChildren.id, fullName: leadChildren.fullName, birthYear: leadChildren.birthYear, grade: leadChildren.grade, school: leadChildren.school, interestedCourseId: leadChildren.interestedCourseId, courseCode: courses.code, notes: leadChildren.notes, convertedStudentId: leadChildren.convertedStudentId })
      .from(leadChildren).leftJoin(courses, eq(courses.id, leadChildren.interestedCourseId)).where(eq(leadChildren.leadId, id)).orderBy(asc(leadChildren.createdAt)),
  ]);
  const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
  const full = canSeeFullPhone(ctx);
  return {
    ...lead,
    phone: full ? lead.phone : maskPhone(lead.phoneNormalized),
    phoneNormalized: full ? lead.phoneNormalized : maskPhone(lead.phoneNormalized),
    sla: computeSla(lead.status, lead.lastTouchAt.toISOString(), nowIso(), policy.sla),
    activities, tasks, children, assignee: assignee ?? null, course: course ?? null, center: center ?? null,
  };
}

async function loadForWrite(ctx: ProtectedContext, id: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, id), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  return lead;
}

/** Ghi tương tác (gọi/nhắn/ghi chú) — cập nhật lastTouch để SLA reset */
export async function addActivity(ctx: ProtectedContext, input: { leadId: string; type: "note" | "call" | "message"; content: string; nextActionAt?: string | null }) {
  await loadForWrite(ctx, input.leadId);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: input.type, content: input.content, actorId: ctx.user.id });
    await tx.update(leads).set({ lastTouchAt: new Date(), ...(input.nextActionAt !== undefined ? { nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null } : {}) }).where(eq(leads.id, input.leadId));
  });
  return getLead(ctx, input.leadId);
}

/** Chuyển trạng thái theo state machine + emit event */
export async function transitionLead(ctx: ProtectedContext, input: { leadId: string; event: LeadEvent; note?: string; lostReason?: string; trialAt?: string }) {
  const lead = await loadForWrite(ctx, input.leadId);
  const to = leadTransition(lead.status, input.event);
  if (input.event === "schedule_trial") {
    const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
    const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leadActivities).where(and(eq(leadActivities.leadId, lead.id), eq(leadActivities.type, "trial_booked")));
    if ((c?.n ?? 0) >= policy.maxTrialsPerLead) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Khách đã hẹn học thử ${c?.n} lần — vượt trần ${policy.maxTrialsPerLead} buổi thử/khách` });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.update(leads).set({
      status: to, lastTouchAt: new Date(),
      ...(input.event === "lose" ? { lostReason: input.lostReason ?? null } : {}),
      ...(input.event === "schedule_trial" && input.trialAt ? { nextActionAt: new Date(input.trialAt) } : {}),
    }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({
      leadId: lead.id, type: input.event === "schedule_trial" ? "trial_booked" : "status_change", actorId: ctx.user.id,
      content: input.note ?? null, meta: { from: lead.status, to, event: input.event, trialAt: input.trialAt ?? null, lostReason: input.lostReason ?? null },
    });
    await emit(tx as unknown as typeof ctx.db, { type: "lead.status_changed", leadId: lead.id, from: lead.status, to, actorId: ctx.user.id });
    await writeAudit(tx as unknown as typeof ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "leads", entityId: lead.id, before: { status: lead.status }, after: { status: to }, reason: input.note ?? null, ip: ctx.ip });
  });
  return getLead(ctx, input.leadId);
}

export async function assignLead(ctx: ProtectedContext, input: { leadId: string; assigneeId: string | null; reason?: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId }); // chỉ quản lý/CSKH cơ sở, không phải owner
  await ctx.db.transaction(async (tx) => {
    await tx.update(leads).set({ assignedToId: input.assigneeId, assignedAt: input.assigneeId ? new Date() : null, lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "assignment", actorId: ctx.user.id, content: input.reason ?? "Giao tay", meta: { from: lead.assignedToId, to: input.assigneeId, mode: "manual" } });
    await tx.update(leadTasks).set({ assigneeId: input.assigneeId }).where(and(eq(leadTasks.leadId, lead.id), isNull(leadTasks.doneAt)));
    if (input.assigneeId) {
      await tx.update(leadAssignees).set({ roundsReceived: sql`${leadAssignees.roundsReceived} + 1`, lastAssignedAt: new Date() })
        .where(and(eq(leadAssignees.userId, input.assigneeId), lead.centerId ? or(eq(leadAssignees.centerId, lead.centerId), isNull(leadAssignees.centerId))! : sql`true`));
      await emit(tx as unknown as typeof ctx.db, { type: "lead.assigned", leadId: lead.id, assigneeId: input.assigneeId, mode: "manual", actorId: ctx.user.id });
    }
  });
  return getLead(ctx, input.leadId);
}

export async function completeTask(ctx: ProtectedContext, input: { taskId: string; note?: string }) {
  const task = await ctx.db.query.leadTasks.findFirst({ where: eq(leadTasks.id, input.taskId) });
  if (!task) throw new TRPCError({ code: "NOT_FOUND" });
  await loadForWrite(ctx, task.leadId);
  await ctx.db.transaction(async (tx) => {
    await tx.update(leadTasks).set({ doneAt: new Date(), doneBy: ctx.user.id }).where(eq(leadTasks.id, task.id));
    await tx.insert(leadActivities).values({ leadId: task.leadId, type: "task_done", actorId: ctx.user.id, content: `${task.title}${input.note ? ` — ${input.note}` : ""}` });
    await tx.update(leads).set({ lastTouchAt: new Date() }).where(eq(leads.id, task.leadId));
  });
  return getLead(ctx, task.leadId);
}

/**
 * CHUYỂN ĐỔI: lead → parent (ghép theo SĐT nếu đã có) + student + enrollment vào lớp.
 * Một transaction; emit enrollment.created; lead sang enrolled.
 */
export interface ConvertLeadInput {
  leadId: string;
  classId: string;
  packageSessions: number;
  studentName?: string;
  grade?: number | null;
  status?: "active" | "trial";
  /** Chốt cho một con cụ thể (LeadChild); nếu bỏ trống dùng childName của lead */
  childId?: string | null;
  /** PH đồng ý cho đăng ảnh con (NĐ13) */
  mediaConsent?: boolean;
  /** Ghi nhận đã đóng tiền (đ) và ngày — chỉ ghi chú; đối soát ở module Tài chính */
  paidAmount?: number | null;
  paidAt?: string | null;
}

/**
 * CHUYỂN ĐỔI: lead → parent (ghép theo SĐT nếu đã có) + student + enrollment vào lớp.
 * Một transaction; emit enrollment.created; lead sang enrolled (nếu mọi con đã chốt) hoặc giữ mở khi còn con chưa chốt.
 * Quy tắc sau chốt: tài khoản PH ở trạng thái "chờ kích hoạt" (PH nhập SĐT nhận OTP Zalo, tự đặt mật khẩu).
 */
export async function convertLead(ctx: ProtectedContext, input: ConvertLeadInput) {
  const lead = await loadForWrite(ctx, input.leadId);
  if (lead.status === "enrolled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Lead đã chuyển đổi" });
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId), with: { center: true } });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Lớp không tồn tại" });
  requirePermission(ctx, "enrollment:create", { centerId: cls.centerId });
  const child = input.childId ? await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, lead.id)) }) : null;
  if (input.childId && !child) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy con trong lead" });
  if (child?.convertedStudentId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Con này đã được chốt" });

  return ctx.db.transaction(async (tx) => {
    let parent = await tx.query.parents.findFirst({ where: eq(parents.phone, lead.phoneNormalized) });
    let accountPending = false;
    if (!parent) {
      [parent] = await tx.insert(parents).values({
        fullName: lead.parentName, phone: lead.phoneNormalized, email: lead.email ?? null,
        mediaConsent: !!input.mediaConsent, mediaConsentAt: input.mediaConsent ? new Date() : null,
        accountStatus: "pending_activation", activationRequestedAt: new Date(),
      }).returning();
      accountPending = true;
    } else {
      const patch: Partial<typeof parents.$inferInsert> = {};
      if (input.mediaConsent && !parent.mediaConsent) { patch.mediaConsent = true; patch.mediaConsentAt = new Date(); }
      if (parent.accountStatus === "none" && !parent.userId) { patch.accountStatus = "pending_activation"; patch.activationRequestedAt = new Date(); accountPending = true; }
      if (Object.keys(patch).length) await tx.update(parents).set(patch).where(eq(parents.id, parent.id));
    }
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(eq(students.homeCenterId, cls.centerId));
    const [student] = await tx
      .insert(students)
      .values({
        code: buildStudentCode(cls.center.code, new Date().getFullYear(), (cnt?.n ?? 0) + 1),
        fullName: input.studentName ?? child?.fullName ?? lead.childName ?? `Con của ${lead.parentName}`,
        grade: input.grade ?? child?.grade ?? lead.childGrade ?? null, school: child?.school ?? lead.school ?? null, homeCenterId: cls.centerId, status: input.status === "trial" ? "trial" : "active",
      })
      .returning();
    await tx.insert(studentGuardians).values({ studentId: student!.id, parentId: parent!.id, isPrimary: true });
    const [enr] = await tx.insert(enrollments).values({ studentId: student!.id, classId: cls.id, packageSessions: input.packageSessions, status: input.status ?? "active", createdBy: ctx.user.id }).returning();
    if (child) await tx.update(leadChildren).set({ convertedStudentId: student!.id }).where(eq(leadChildren.id, child.id));

    // Lead đóng khi không còn con nào chưa chốt
    const [remaining] = await tx.select({ n: sql<number>`count(*)::int` }).from(leadChildren).where(and(eq(leadChildren.leadId, lead.id), isNull(leadChildren.convertedStudentId)));
    const closeLead = (remaining?.n ?? 0) === 0;
    await tx.update(leads).set({
      ...(closeLead ? { status: "enrolled" as const } : {}),
      convertedParentId: parent!.id, convertedStudentId: lead.convertedStudentId ?? student!.id, convertedAt: new Date(), lastTouchAt: new Date(),
    }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({
      leadId: lead.id, type: "status_change", actorId: ctx.user.id,
      content: `Ghi danh ${student!.fullName} vào lớp ${cls.code}${input.paidAmount ? ` · đã đóng ${input.paidAmount.toLocaleString("vi-VN")}đ` : ""}${accountPending ? " · tài khoản PH chờ kích hoạt" : ""}`,
      meta: { from: lead.status, to: closeLead ? "enrolled" : lead.status, studentId: student!.id, enrollmentId: enr!.id, paidAmount: input.paidAmount ?? null, paidAt: input.paidAt ?? null, mediaConsent: !!input.mediaConsent },
    });
    if (closeLead) await emit(tx as unknown as typeof ctx.db, { type: "lead.status_changed", leadId: lead.id, from: lead.status, to: "enrolled", actorId: ctx.user.id });
    await emit(tx as unknown as typeof ctx.db, { type: "enrollment.created", enrollmentId: enr!.id, studentId: student!.id, classId: cls.id });
    if (accountPending) await emit(tx as unknown as typeof ctx.db, { type: "parent.account_pending", parentId: parent!.id, phone: parent!.phone });
    await writeAudit(tx as unknown as typeof ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "conversion", entityId: lead.id, after: { studentId: student!.id, enrollmentId: enr!.id, paidAmount: input.paidAmount ?? null }, ip: ctx.ip });
    return { studentId: student!.id, enrollmentId: enr!.id, parentId: parent!.id, leadClosed: closeLead, accountPending };
  });
}

/** Thêm / xoá con trong lead */
export async function addLeadChild(ctx: ProtectedContext, input: { leadId: string; fullName: string; birthYear?: number | null; grade?: number | null; school?: string | null; interestedCourseId?: string | null; notes?: string | null }) {
  await loadForWrite(ctx, input.leadId);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(leadChildren).values({ leadId: input.leadId, fullName: input.fullName.trim(), birthYear: input.birthYear ?? null, grade: input.grade ?? null, school: input.school ?? null, interestedCourseId: input.interestedCourseId ?? null, notes: input.notes ?? null });
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: "system", actorId: ctx.user.id, content: `Thêm con: ${input.fullName.trim()}` });
  });
  return getLead(ctx, input.leadId);
}
export async function removeLeadChild(ctx: ProtectedContext, input: { leadId: string; childId: string }) {
  await loadForWrite(ctx, input.leadId);
  const child = await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, input.leadId)) });
  if (!child) throw new TRPCError({ code: "NOT_FOUND" });
  if (child.convertedStudentId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Con đã chốt, không xoá được" });
  await ctx.db.delete(leadChildren).where(eq(leadChildren.id, child.id));
  return getLead(ctx, input.leadId);
}

/** Việc lead đến hạn/quá hạn của tôi — cho widget "Hôm nay" của sale */
export async function myLeadTasks(ctx: ProtectedContext) {
  const rows = await ctx.db
    .select({ id: leadTasks.id, title: leadTasks.title, dueAt: leadTasks.dueAt, leadId: leadTasks.leadId, parentName: leads.parentName, status: leads.status })
    .from(leadTasks)
    .innerJoin(leads, eq(leads.id, leadTasks.leadId))
    .where(and(isNull(leadTasks.doneAt), or(eq(leadTasks.assigneeId, ctx.user.id), eq(leads.assignedToId, ctx.user.id))!, lte(leadTasks.dueAt, new Date(Date.now() + 24 * 3600 * 1000))))
    .orderBy(asc(leadTasks.dueAt))
    .limit(50);
  const now = Date.now();
  return rows.map((r) => ({ ...r, overdue: r.dueAt.getTime() < now }));
}

/** Danh sách sale/CSKH có thể nhận lead (cho dropdown phân bổ) */
export async function assigneeOptions(ctx: ProtectedContext, centerId?: string | null) {
  return ctx.db
    .select({ id: users.id, fullName: users.fullName, isAvailable: leadAssignees.isAvailable, centerId: leadAssignees.centerId })
    .from(leadAssignees)
    .innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(centerId ? or(eq(leadAssignees.centerId, centerId), isNull(leadAssignees.centerId))! : sql`true`)
    .orderBy(asc(users.fullName));
}
