import { and, eq, inArray, sql, asc, desc, ilike, or, isNull, lte, gte, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  leads, leadActivities, leadTasks, leadAssignees, leadChildren, users, centers, courses, parents, parentPrivate, students, studentGuardians, enrollments, classes,
  consentRecords, orders, orderItems, payments, trialBookings,
} from "@satarobo/db";
import {
  leadTransition, computeSla, normalizeVnPhone, maskPhone, OPEN_LEAD_STATUSES, LEAD_STATUSES, visibleCenterIds, authorize, hasRole, buildStudentCode, CONSENT_TEXT_VERSION, normalizeRefCode,
  mergeIntake, appendNote, summarizeLeadOrders, conversionGate, checkScholarshipReason, isValidIdNumber, isFacebookUrl, intakeAssignmentSource,
  isDropEvent, checkDropReason, packagePrice, formatVnd, PLACEHOLDER_PARENT_NAME, LEAD_DROP_REASON_MAX,
  type LeadStatus, type LeadEvent, type AssignmentSource, type IntakeChild,
} from "@satarobo/core";
import { resolveAdmissionsPolicy, autoPickAssignee, recordAssignment, canSeeLeadPhone, type Db } from "./admissionsAdmin";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";
import { enforcePrerequisites } from "./catalog";
import { nextStudentCode } from "./students";
import { countLeadTrials } from "./trials";
import { todayISO } from "./sessions";
import { sealPii } from "./pii";
import { insertLeadOrderTx, pickBackfillMethod, localPhone } from "./finance";

const nowIso = () => new Date().toISOString();
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateLeadInput {
  parentName?: string | null;
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
  facebookUrl?: string | null;
  consent?: boolean;
  /** Đồng ý nhận thông tin tiếp thị (NĐ13: tách riêng mục đích) */
  marketingConsent?: boolean;
  referralCode?: string | null;
  autoAssign?: boolean;
  /** Giao tay ngay khi tạo (bỏ qua chế độ chia) */
  assignedToId?: string | null;
  /** Nhiều con / lead (LeadChild). Nếu rỗng nhưng có childName → tạo 1 dòng từ childName */
  children?: IntakeChild[];
}

/** Tuỳ chọn nội bộ (nhập file): ghi đè khi trùng, trạng thái ban đầu, ngày nhận, nguồn phân lead */
export interface CreateLeadOptions {
  overwrite?: boolean;
  status?: LeadStatus;
  receivedAt?: Date | null;
  assignSource?: AssignmentSource;
  /** Lead trùng chưa chốt: giao cho sale này (không tiêu lượt) */
  reassignExistingTo?: string | null;
}

async function refLabels(db: Db) {
  const [cs, cos] = await Promise.all([db.select({ id: centers.id, code: centers.code }).from(centers), db.select({ id: courses.id, code: courses.code }).from(courses)]);
  const map = new Map<string, string>([...cs.map((c) => [c.id, c.code] as const), ...cos.map((c) => [c.id, c.code] as const)]);
  return (_field: string, v: string) => map.get(v) ?? v;
}

/**
 * Tạo lead. Dùng bởi phiếu nhập của sale (có actor), form web công khai (actorId null) và nhập file.
 * - SĐT chuẩn hoá là căn cứ DUY NHẤT phát hiện trùng, so với mọi lead chưa xoá (mọi trạng thái).
 * - Trùng: gộp (chỉ điền ô trống, thêm con mới, giá trị khác ghi chú kèm ngày), tăng số lần nhập lại,
 *   KHÔNG đổi trạng thái phễu, ghi sổ chia nguồn "Nhập lại".
 * - Mới: chia theo chế độ của cơ sở (chỉ máy chia luân phiên tiêu lượt); emit lead.created.
 */
export async function createLead(db: ProtectedContext["db"], input: CreateLeadInput, actorId: string | null, opts: CreateLeadOptions = {}) {
  const phoneNormalized = normalizeVnPhone(input.phone);
  if (!phoneNormalized) throw bad("Số điện thoại không hợp lệ");
  if (input.facebookUrl?.trim() && !isFacebookUrl(input.facebookUrl)) throw bad("Link Facebook không hợp lệ (facebook.com/… hoặc m.me/…)");
  if (input.email?.trim() && !EMAIL_RE.test(input.email.trim())) throw bad("Email không hợp lệ");
  const parentName = input.parentName?.trim() || PLACEHOLDER_PARENT_NAME;
  const children: IntakeChild[] = (input.children ?? []).filter((c) => c.fullName?.trim()).map((c) => ({ ...c, fullName: c.fullName.trim() }));
  if (children.length === 0 && input.childName?.trim()) children.push({ fullName: input.childName.trim(), grade: input.childGrade ?? null, birthYear: input.childBirthYear ?? null, school: input.school ?? null, interestedCourseId: input.interestedCourseId ?? null });
  const referral = normalizeRefCode(input.referralCode);

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // hai phiếu cùng số gửi cùng lúc không tạo hai lead
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"lead-phone:" + phoneNormalized}))`);
    const policy = await resolveAdmissionsPolicy(t, input.centerId ?? null);
    const since = policy.dedupeDays > 0 ? new Date(Date.now() - policy.dedupeDays * 86_400_000) : null;
    const [existing] = await tx.select().from(leads)
      .where(and(eq(leads.phoneNormalized, phoneNormalized), isNull(leads.deletedAt), since ? gte(leads.lastTouchAt, since) : sql`true`))
      .orderBy(sql`case when ${inArray(leads.status, [...OPEN_LEAD_STATUSES])} then 0 else 1 end`, desc(leads.lastTouchAt))
      .limit(1);

    if (existing) {
      const kids = await tx.select().from(leadChildren).where(eq(leadChildren.leadId, existing.id));
      const merge = mergeIntake(
        {
          parentName: existing.parentName, email: existing.email, centerId: existing.centerId, source: existing.source, facebookUrl: existing.facebookUrl, childName: existing.childName, notes: existing.notes,
          children: kids.map((k) => ({ id: k.id, fullName: k.fullName, birthYear: k.birthYear, grade: k.grade, school: k.school, interestedCourseId: k.interestedCourseId })),
        },
        // tên con (cột cũ) chỉ điền khi trống — con khác được gộp ở danh sách con, không ghi là "khác"
        { parentName, email: input.email, centerId: input.centerId, source: input.source, facebookUrl: input.facebookUrl, childName: existing.childName ? null : (input.childName ?? children[0]?.fullName ?? null), notes: input.notes, children },
        { today: todayISO(), overwrite: opts.overwrite, display: await refLabels(t) },
      );
      const now = new Date();
      await tx.update(leads).set({
        ...merge.patch,
        ...(merge.noteAppend ? { notes: appendNote(existing.notes, merge.noteAppend) } : {}),
        reentryCount: sql`${leads.reentryCount} + 1`, lastReentryAt: now, lastTouchAt: now,
      }).where(eq(leads.id, existing.id));
      if (merge.childrenToAdd.length) {
        await tx.insert(leadChildren).values(merge.childrenToAdd.map((c) => ({ leadId: existing.id, fullName: c.fullName, birthYear: c.birthYear ?? null, grade: c.grade ?? null, school: c.school ?? null, interestedCourseId: c.interestedCourseId ?? null, notes: c.notes ?? null })));
      }
      for (const cp of merge.childPatches) await tx.update(leadChildren).set(cp.patch).where(eq(leadChildren.id, cp.id));
      const added = merge.childrenToAdd.length;
      await tx.insert(leadActivities).values({
        leadId: existing.id, type: "system", actorId,
        content: `Nhập lại (trùng số) từ ${input.source ?? "nguồn khác"}${added ? ` — đã thêm ${added} bé vào khách cũ` : ""}${merge.noteAppend ? " · có thông tin khác, xem ghi chú" : ""}`,
        meta: { duplicateOf: "phone", childrenAdded: added, merged: Object.keys(merge.patch), conflicts: merge.conflicts.length, overwrite: !!opts.overwrite, input: { source: input.source ?? null, phone: maskPhone(phoneNormalized) } },
      });
      const open = (OPEN_LEAD_STATUSES as readonly string[]).includes(existing.status) && !existing.convertedAt;
      const centerId = merge.patch.centerId ?? existing.centerId;
      let assignedToId = existing.assignedToId;
      if (open && opts.reassignExistingTo && opts.reassignExistingTo !== existing.assignedToId) {
        await recordAssignment(t, { leadId: existing.id, centerId, fromUserId: existing.assignedToId, toUserId: opts.reassignExistingTo, source: opts.assignSource ?? "import", mode: policy.distributionMode, actorId, content: "Giao theo cột sale trong file nhập" });
        assignedToId = opts.reassignExistingTo;
      } else if (existing.assignedToId) {
        await recordAssignment(t, { leadId: existing.id, centerId, toUserId: existing.assignedToId, source: "duplicate", mode: policy.distributionMode, actorId, updateLead: false, activity: false });
      } else if (open && input.autoAssign !== false) {
        const pick = await autoPickAssignee(t, centerId, policy.distributionMode);
        if (pick) {
          await recordAssignment(t, { leadId: existing.id, centerId, toUserId: pick, source: referral ? "affiliate" : "auto", mode: policy.distributionMode, actorId });
          assignedToId = pick;
        }
      }
      if (actorId) await writeAudit(t, { actorId, action: "UPDATE", module: "admissions", entity: "leads", entityId: existing.id, before: { reentryCount: existing.reentryCount }, after: { reentry: true, patch: merge.patch, childrenAdded: added } });
      return { lead: { ...existing, ...merge.patch, assignedToId }, duplicated: true as const, childrenAdded: added, merged: Object.keys(merge.patch), hasConflicts: merge.conflicts.length > 0 };
    }

    const centerId = input.centerId ?? null;
    let assignedToId: string | null = input.assignedToId ?? null;
    let source: AssignmentSource = opts.assignSource && assignedToId ? opts.assignSource : intakeAssignmentSource({ actorId, assignedToId, referral: !!referral });
    const convertedStatus = opts.status === "enrolled";
    if (!assignedToId && input.autoAssign !== false && !convertedStatus) {
      assignedToId = await autoPickAssignee(t, centerId, policy.distributionMode);
      source = referral ? "affiliate" : "auto";
    }
    const now = new Date();
    const [lead] = await tx
      .insert(leads)
      .values({
        parentName, phone: input.phone.trim(), phoneNormalized, email: input.email?.trim() || null,
        childName: input.childName?.trim() || children[0]?.fullName || null, childGrade: input.childGrade ?? children[0]?.grade ?? null, childBirthYear: input.childBirthYear ?? null, school: input.school ?? null,
        interestedCourseId: input.interestedCourseId ?? children[0]?.interestedCourseId ?? null, centerId, source: input.source ?? null,
        utmSource: input.utmSource ?? null, utmMedium: input.utmMedium ?? null, utmCampaign: input.utmCampaign ?? null,
        notes: input.notes?.trim() || null, facebookUrl: input.facebookUrl?.trim() || null, consentAt: input.consent ? now : null,
        referralCode: referral, status: opts.status ?? "new", createdBy: actorId,
        assignedToId, assignedAt: assignedToId ? now : null,
        ...(opts.receivedAt ? { createdAt: opts.receivedAt } : {}),
        ...(convertedStatus ? { convertedAt: opts.receivedAt ?? now } : {}),
      })
      .returning();

    if (children.length > 0) {
      await tx.insert(leadChildren).values(children.map((c) => ({ leadId: lead!.id, fullName: c.fullName, birthYear: c.birthYear ?? null, grade: c.grade ?? null, school: c.school ?? null, interestedCourseId: c.interestedCourseId ?? null, notes: c.notes ?? null })));
    }

    await tx.insert(leadActivities).values({ leadId: lead!.id, type: "system", actorId, content: `Tạo lead từ ${input.source ?? "Ops"}` });
    if (input.consent) {
      const src = input.source === "web-form" ? "web_form" : "counter";
      await tx.insert(consentRecords).values([
        { subjectType: "lead" as const, subjectId: lead!.id, purpose: "service" as const, granted: true, source: src, textVersion: CONSENT_TEXT_VERSION, recordedBy: actorId },
        ...(input.marketingConsent !== undefined ? [{ subjectType: "lead" as const, subjectId: lead!.id, purpose: "marketing" as const, granted: input.marketingConsent, source: src, textVersion: CONSENT_TEXT_VERSION, recordedBy: actorId }] : []),
      ]);
      if (input.marketingConsent === false) await tx.update(leads).set({ marketingOptOut: true }).where(eq(leads.id, lead!.id));
    }
    if (assignedToId) {
      await recordAssignment(t, { leadId: lead!.id, centerId, toUserId: assignedToId, source, mode: policy.distributionMode, actorId, updateLead: false });
    }
    await emit(t, { type: "lead.created", leadId: lead!.id, centerId: lead!.centerId, source: lead!.source });
    if (actorId) await writeAudit(t, { actorId, action: "CREATE", module: "admissions", entity: "leads", entityId: lead!.id, after: { source: input.source, assignSource: assignedToId ? source : null, status: lead!.status } });
    return { lead: lead!, duplicated: false as const, childrenAdded: children.length, merged: [] as string[], hasConflicts: false };
  });
}

export interface LeadInboxInput {
  scope: "mine" | "center" | "all";
  status?: LeadStatus;
  /** true = mọi trạng thái (kể cả đã đăng ký / mất) */
  allStatuses?: boolean;
  centerId?: string;
  q?: string;
  /** "none" = chưa phân */
  assignedToId?: string;
  source?: string;
  /** ngày nhận lead (YYYY-MM-DD, giờ VN) */
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

/** Inbox: lead của tôi / của cơ sở, kèm SLA. Trạng thái mở: quá hạn trước; mọi trạng thái / đã đóng: mới nhận trước. Có phân trang. */
export async function leadInbox(ctx: ProtectedContext, input: LeadInboxInput) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const scopeConds = [isNull(leads.deletedAt)];
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) scopeConds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  if (input.centerId) scopeConds.push(eq(leads.centerId, input.centerId));
  const conds = [...scopeConds];
  const openView = !input.allStatuses && (!input.status || (OPEN_LEAD_STATUSES as readonly string[]).includes(input.status));
  if (input.status) conds.push(eq(leads.status, input.status));
  else if (!input.allStatuses) conds.push(inArray(leads.status, [...OPEN_LEAD_STATUSES]));
  if (input.scope === "mine") conds.push(eq(leads.assignedToId, ctx.user.id));
  if (input.assignedToId === "none") conds.push(isNull(leads.assignedToId));
  else if (input.assignedToId) conds.push(eq(leads.assignedToId, input.assignedToId));
  if (input.source) conds.push(eq(leads.source, input.source));
  if (input.from) conds.push(sql`${leads.createdAt} >= (${input.from}::date)::timestamp at time zone 'Asia/Ho_Chi_Minh'`);
  if (input.to) conds.push(sql`${leads.createdAt} < ((${input.to}::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')`);
  if (input.q) {
    const q = input.q.trim();
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const pn = normalizeVnPhone(q);
    conds.push(or(ilike(leads.parentName, like), ilike(leads.childName, like), pn ? eq(leads.phoneNormalized, pn) : sql`false`)!);
  }

  const paged = input.page !== undefined;
  const pageSize = Math.min(200, input.pageSize ?? 50);
  const page = Math.max(1, input.page ?? 1);
  const [rows, light, facets] = await Promise.all([
    ctx.db
      .select({
        id: leads.id, status: leads.status, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, childName: leads.childName, childGrade: leads.childGrade,
        source: leads.source, centerId: leads.centerId, centerCode: centers.code, courseCode: courses.code, assignedToId: leads.assignedToId, assigneeName: users.fullName,
        lastTouchAt: leads.lastTouchAt, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, reentryCount: leads.reentryCount, lastReentryAt: leads.lastReentryAt,
        openTasks: sql<number>`(select count(*)::int from ${leadTasks} t where t.lead_id = ${leads.id} and t.done_at is null)`,
      })
      .from(leads)
      .leftJoin(centers, eq(centers.id, leads.centerId))
      .leftJoin(courses, eq(courses.id, leads.interestedCourseId))
      .leftJoin(users, eq(users.id, leads.assignedToId))
      .where(and(...conds))
      .orderBy(openView ? asc(leads.lastTouchAt) : desc(leads.createdAt))
      .limit(paged ? pageSize : (input.limit ?? 200))
      .offset(paged ? (page - 1) * pageSize : 0),
    // Cột nhẹ để đếm tổng + SLA trên toàn bộ kết quả lọc (không chỉ trang hiện tại)
    ctx.db.select({ status: leads.status, lastTouchAt: leads.lastTouchAt }).from(leads).where(and(...conds)).limit(20_000),
    Promise.all([
      ctx.db.selectDistinct({ id: users.id, name: users.fullName }).from(leads).innerJoin(users, eq(users.id, leads.assignedToId)).where(and(...scopeConds)).orderBy(asc(users.fullName)).limit(100),
      ctx.db.select({ source: leads.source, n: sql<number>`count(*)::int` }).from(leads).where(and(...scopeConds, sql`${leads.source} is not null`)).groupBy(leads.source).orderBy(desc(sql`count(*)`)).limit(30),
    ]),
  ]);

  const now = nowIso();
  const full = canSeeLeadPhone(ctx);
  const policy = await resolveAdmissionsPolicy(ctx.db, input.centerId ?? null);
  const slaOf = (st: LeadStatus, t: Date) => computeSla(st, t.toISOString(), now, policy.sla);
  const items = rows
    .map(({ phoneNormalized, ...r }) => ({
      ...r,
      phone: full ? phoneNormalized : maskPhone(phoneNormalized),
      sla: slaOf(r.status, r.lastTouchAt),
      canDelete: authorize(ctx.actor, "lead:delete", { centerId: r.centerId }).allowed && r.status !== "enrolled",
      canAssign: authorize(ctx.actor, "lead:update", { centerId: r.centerId }).allowed,
    }))
    .sort((a, b) => (openView ? b.sla.overdueMinutes - a.sla.overdueMinutes || a.lastTouchAt.getTime() - b.lastTouchAt.getTime() : 0));
  const levels = light.map((l) => slaOf(l.status, l.lastTouchAt).level);
  return {
    items,
    total: light.length,
    page,
    pageSize: paged ? pageSize : items.length,
    facets: { assignees: facets[0], sources: facets[1].map((x) => ({ source: x.source!, n: x.n })) },
    summary: {
      total: light.length,
      overdue: levels.filter((l) => l === "overdue").length,
      warning: levels.filter((l) => l === "warning").length,
      byStatus: Object.fromEntries(LEAD_STATUSES.map((st) => [st, light.filter((i) => i.status === st).length])) as Record<LeadStatus, number>,
    },
  };
}

/** Khối "Thanh toán" của lead: đơn (trừ huỷ / đã hoàn), đã nộp / tổng / còn thiếu, điều kiện chốt */
export async function leadPaymentSummary(db: Db, leadId: string) {
  const rows = await db
    .select({
      id: orders.id, code: orders.code, status: orders.status, total: orders.total, createdAt: orders.createdAt,
      confirmed: sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${orders.id} and p.status = 'confirmed'), 0)::bigint`,
      recorded: sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${orders.id} and p.status = 'recorded'), 0)::bigint`,
    })
    .from(orders)
    .where(eq(orders.leadId, leadId))
    .orderBy(desc(orders.createdAt));
  const list = rows.map((r) => ({ ...r, confirmed: Number(r.confirmed), recorded: Number(r.recorded) }));
  const sum = summarizeLeadOrders(list);
  return { orders: list, ...sum, gate: conversionGate({ orders: sum.count, total: sum.total, recorded: sum.recorded, confirmed: sum.confirmed }) };
}

export async function getLead(ctx: ProtectedContext, id: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, id), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:read", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  const [activities, tasks, assignee, course, center, children, creator, payment] = await Promise.all([
    ctx.db.select({ id: leadActivities.id, type: leadActivities.type, content: leadActivities.content, meta: leadActivities.meta, createdAt: leadActivities.createdAt, actorName: users.fullName })
      .from(leadActivities).leftJoin(users, eq(users.id, leadActivities.actorId)).where(eq(leadActivities.leadId, id)).orderBy(desc(leadActivities.createdAt)).limit(100),
    ctx.db.select().from(leadTasks).where(eq(leadTasks.leadId, id)).orderBy(asc(leadTasks.doneAt), asc(leadTasks.dueAt)),
    lead.assignedToId ? ctx.db.query.users.findFirst({ where: eq(users.id, lead.assignedToId), columns: { id: true, fullName: true } }) : null,
    lead.interestedCourseId ? ctx.db.query.courses.findFirst({ where: eq(courses.id, lead.interestedCourseId), columns: { id: true, code: true, name: true } }) : null,
    lead.centerId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, lead.centerId), columns: { id: true, code: true, name: true } }) : null,
    ctx.db.select({ id: leadChildren.id, fullName: leadChildren.fullName, birthYear: leadChildren.birthYear, grade: leadChildren.grade, school: leadChildren.school, interestedCourseId: leadChildren.interestedCourseId, courseCode: courses.code, notes: leadChildren.notes, convertedStudentId: leadChildren.convertedStudentId })
      .from(leadChildren).leftJoin(courses, eq(courses.id, leadChildren.interestedCourseId)).where(eq(leadChildren.leadId, id)).orderBy(asc(leadChildren.createdAt)),
    lead.createdBy ? ctx.db.query.users.findFirst({ where: eq(users.id, lead.createdBy), columns: { id: true, fullName: true } }) : null,
    leadPaymentSummary(ctx.db, id),
  ]);
  const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
  const full = canSeeLeadPhone(ctx);
  const owner = { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) };
  return {
    ...lead,
    phone: full ? lead.phone : maskPhone(lead.phoneNormalized),
    phoneNormalized: full ? lead.phoneNormalized : maskPhone(lead.phoneNormalized),
    sla: computeSla(lead.status, lead.lastTouchAt.toISOString(), nowIso(), policy.sla),
    activities, tasks, children, assignee: assignee ?? null, course: course ?? null, center: center ?? null, creator: creator ?? null,
    payment,
    distributionMode: policy.distributionMode,
    perms: {
      update: authorize(ctx.actor, "lead:update", owner).allowed,
      assign: authorize(ctx.actor, "lead:update", { centerId: lead.centerId }).allowed,
      delete: authorize(ctx.actor, "lead:delete", { centerId: lead.centerId }).allowed,
      createOrder: authorize(ctx.actor, "finance:create", { centerId: lead.centerId }).allowed,
      convert: authorize(ctx.actor, "enrollment:create", { centerId: lead.centerId }).allowed,
    },
  };
}

async function loadForWrite(ctx: ProtectedContext, id: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, id), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  return lead;
}

export interface ActivityMeta { caller?: string | null; durationMin?: number | null; platform?: string | null; to?: string | null; subject?: string | null }

/** Ghi tương tác (gọi / nhắn / ghi chú / email kèm thông tin phụ) — cập nhật lastTouch để SLA reset */
export async function addActivity(ctx: ProtectedContext, input: { leadId: string; type: "note" | "call" | "message" | "email"; content: string; nextActionAt?: string | null; meta?: ActivityMeta | null }) {
  await loadForWrite(ctx, input.leadId);
  const meta = Object.fromEntries(Object.entries(input.meta ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  if (input.type === "email" && meta.to && !EMAIL_RE.test(String(meta.to))) throw bad("Email người nhận không hợp lệ");
  await ctx.db.transaction(async (tx) => {
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: input.type, content: input.content, actorId: ctx.user.id, meta: Object.keys(meta).length ? meta : null });
    await tx.update(leads).set({ lastTouchAt: new Date(), ...(input.nextActionAt !== undefined ? { nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null } : {}) }).where(eq(leads.id, input.leadId));
  });
  return getLead(ctx, input.leadId);
}

/** Số lượt học thử đã dùng: lượt xếp vào buổi (không tính đổi lịch / huỷ) + lần "Hẹn học thử" ghi tay không gắn buổi */
async function trialsUsed(db: Db, leadId: string) {
  const booked = await countLeadTrials(db, leadId);
  const [manual] = await db.select({ n: sql<number>`count(*)::int` }).from(leadActivities).where(and(
    eq(leadActivities.leadId, leadId), eq(leadActivities.type, "trial_booked"),
    sql`coalesce(${leadActivities.meta}->>'event', '') = 'schedule_trial'`, sql`(${leadActivities.meta}->>'trialBookingId') is null`,
  ));
  return booked + (manual?.n ?? 0);
}

/**
 * Chuyển trạng thái theo state machine + emit event. Rời phễu (nuôi dưỡng / mất) bắt buộc lý do 3–500 ký tự.
 * "Ghi danh" không đi qua đây — chỉ màn Chuyển đổi.
 */
export async function transitionLead(ctx: ProtectedContext, input: { leadId: string; event: LeadEvent; note?: string; reason?: string; lostReason?: string; trialAt?: string }) {
  if (input.event === "enroll") throw pre("Chốt lead chỉ qua màn Chuyển đổi (cần ghi nhận thanh toán trước)");
  const lead = await loadForWrite(ctx, input.leadId);
  const rawReason = input.reason ?? input.lostReason ?? null;
  const drop = isDropEvent(input.event);
  if (drop) {
    const c = checkDropReason(rawReason);
    if (!c.ok) throw bad(c.error);
  }
  const to = leadTransition(lead.status, input.event, { reason: rawReason });
  const reason = drop ? rawReason!.trim() : null;
  if (input.event === "schedule_trial") {
    const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
    const used = await trialsUsed(ctx.db, lead.id);
    if (used >= policy.maxTrialsPerLead) throw pre(`Khách đã hẹn học thử ${used} lần — vượt trần ${policy.maxTrialsPerLead} buổi thử/khách`);
  }
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    await tx.update(leads).set({
      status: to, lastTouchAt: now,
      ...(reason ? { dropReason: reason, droppedAt: now } : {}),
      ...(input.event === "lose" ? { lostReason: reason } : {}),
      ...(input.event === "schedule_trial" && input.trialAt ? { nextActionAt: new Date(input.trialAt) } : {}),
    }).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({
      leadId: lead.id, type: input.event === "schedule_trial" ? "trial_booked" : "status_change", actorId: ctx.user.id,
      content: input.note ?? (reason ? `Lý do: ${reason}` : null),
      meta: { from: lead.status, to, event: input.event, trialAt: input.trialAt ?? null, reason, lostReason: input.event === "lose" ? reason : null },
    });
    await emit(tx as unknown as Db, { type: "lead.status_changed", leadId: lead.id, from: lead.status, to, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "leads", entityId: lead.id, before: { status: lead.status }, after: { status: to }, reason: reason ?? input.note ?? null, ip: ctx.ip });
  });
  return getLead(ctx, input.leadId);
}

/** Gán tay cho sale (hoặc bỏ phân công) — quản lý giao / sale tự nhận: không tiêu lượt */
export async function assignLead(ctx: ProtectedContext, input: { leadId: string; assigneeId: string | null; reason?: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId }); // chỉ quản lý/CSKH cơ sở, không phải owner
  if (input.assigneeId === lead.assignedToId) return getLead(ctx, input.leadId);
  if (input.assigneeId) {
    const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.assigneeId), columns: { isActive: true } });
    if (!u?.isActive) throw bad("Sale không tồn tại hoặc đã khoá");
  }
  await ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (input.assigneeId) {
      const policy = await resolveAdmissionsPolicy(t, lead.centerId);
      await recordAssignment(t, {
        leadId: lead.id, centerId: lead.centerId, fromUserId: lead.assignedToId, toUserId: input.assigneeId,
        source: input.assigneeId === ctx.user.id ? "self" : "manager", mode: policy.distributionMode, actorId: ctx.user.id, content: input.reason ?? "Giao tay",
      });
    } else {
      await tx.update(leads).set({ assignedToId: null, assignedAt: null, lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
      await tx.update(leadTasks).set({ assigneeId: null }).where(and(eq(leadTasks.leadId, lead.id), isNull(leadTasks.doneAt)));
      await tx.insert(leadActivities).values({ leadId: lead.id, type: "assignment", actorId: ctx.user.id, content: input.reason ?? "Bỏ phân công", meta: { from: lead.assignedToId, to: null, mode: "manual" } });
    }
    await writeAudit(t, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "leads", entityId: lead.id, before: { assignedToId: lead.assignedToId }, after: { assignedToId: input.assigneeId }, reason: input.reason ?? null, ip: ctx.ip });
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

/* ------------------------------------------------------------------ */
/* Sửa / xoá lead, sửa con                                             */
/* ------------------------------------------------------------------ */

export interface UpdateLeadInput {
  leadId: string;
  parentName: string;
  phone: string;
  email?: string | null;
  centerId?: string | null;
  source?: string | null;
  notes?: string | null;
  facebookUrl?: string | null;
  childName?: string | null;
  childGrade?: number | null;
}

export async function updateLead(ctx: ProtectedContext, input: UpdateLeadInput) {
  const lead = await loadForWrite(ctx, input.leadId);
  const patch: Partial<typeof leads.$inferInsert> = {
    parentName: input.parentName.trim(),
    ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    ...(input.source !== undefined ? { source: input.source?.trim() || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    ...(input.facebookUrl !== undefined ? { facebookUrl: input.facebookUrl?.trim() || null } : {}),
    ...(input.childName !== undefined ? { childName: input.childName?.trim() || null } : {}),
    ...(input.childGrade !== undefined ? { childGrade: input.childGrade } : {}),
  };
  if (patch.email && !EMAIL_RE.test(patch.email)) throw bad("Email không hợp lệ");
  if (patch.facebookUrl && !isFacebookUrl(patch.facebookUrl)) throw bad("Link Facebook không hợp lệ (facebook.com/… hoặc m.me/…)");
  // Người không xem được SĐT đầy đủ thì không đổi SĐT (ô đang hiển thị số đã che)
  if (canSeeLeadPhone(ctx) && input.phone.trim() !== lead.phone) {
    const pn = normalizeVnPhone(input.phone);
    if (!pn) throw bad("Số điện thoại không hợp lệ");
    if (pn !== lead.phoneNormalized) {
      const [dup] = await ctx.db.select({ id: leads.id, parentName: leads.parentName }).from(leads).where(and(eq(leads.phoneNormalized, pn), ne(leads.id, lead.id), isNull(leads.deletedAt))).limit(1);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Số điện thoại đã thuộc lead khác: ${dup.parentName} (/leads/${dup.id}) — mở lead đó để gộp thông tin` });
    }
    patch.phone = input.phone.trim();
    patch.phoneNormalized = pn;
  }
  if (input.centerId !== undefined && input.centerId !== lead.centerId) {
    if (lead.convertedAt) throw pre("Lead đã chốt — không đổi cơ sở");
    if (input.centerId) requirePermission(ctx, "lead:update", { centerId: input.centerId });
    const [openOrder] = await ctx.db.select({ code: orders.code }).from(orders).where(and(eq(orders.leadId, lead.id), ne(orders.status, "cancelled"))).limit(1);
    if (openOrder) throw pre(`Lead đã có đơn ${openOrder.code} ở cơ sở hiện tại — dùng "Chuyển lead" sau khi huỷ đơn`);
    patch.centerId = input.centerId;
  }
  const keys = Object.keys(patch) as (keyof typeof patch & string)[];
  const changed = keys.filter((k) => String(patch[k] ?? "") !== String((lead as Record<string, unknown>)[k] ?? ""));
  if (!changed.length) return getLead(ctx, lead.id);
  const before = Object.fromEntries(changed.map((k) => [k, (lead as Record<string, unknown>)[k] ?? null]));
  const after = Object.fromEntries(changed.map((k) => [k, patch[k] ?? null]));
  const upd: Partial<typeof leads.$inferInsert> = { lastTouchAt: new Date() };
  for (const k of changed) (upd as Record<string, unknown>)[k] = patch[k];
  await ctx.db.transaction(async (tx) => {
    await tx.update(leads).set(upd).where(eq(leads.id, lead.id));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "system", actorId: ctx.user.id, content: `Sửa thông tin lead (${changed.length} trường)`, meta: { fields: changed } });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "leads", entityId: lead.id, before, after, ip: ctx.ip });
  });
  return getLead(ctx, lead.id);
}

/** Xoá mềm (có lý do, ghi nhật ký). Lead đã chốt / có đơn còn hiệu lực không xoá được. */
export async function deleteLead(ctx: ProtectedContext, input: { leadId: string; reason: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "lead:delete", { centerId: lead.centerId });
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > LEAD_DROP_REASON_MAX) throw bad(`Lý do xoá 3–${LEAD_DROP_REASON_MAX} ký tự`);
  if (lead.status === "enrolled" || lead.convertedAt) throw pre("Lead đã chốt học viên — không xoá được");
  const [o] = await ctx.db.select({ code: orders.code }).from(orders).where(and(eq(orders.leadId, lead.id), ne(orders.status, "cancelled"))).limit(1);
  if (o) throw pre(`Lead có đơn ${o.code} — huỷ đơn trước khi xoá`);
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    await tx.update(leads).set({ deletedAt: now }).where(eq(leads.id, lead.id));
    await tx.update(leadTasks).set({ doneAt: now, doneBy: ctx.user.id }).where(and(eq(leadTasks.leadId, lead.id), isNull(leadTasks.doneAt)));
    await tx.update(trialBookings).set({ status: "cancelled", reason: `Xoá lead: ${reason}` }).where(and(eq(trialBookings.leadId, lead.id), eq(trialBookings.status, "booked")));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "system", actorId: ctx.user.id, content: `Xoá lead: ${reason}` });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "admissions", entity: "leads", entityId: lead.id, before: { parentName: lead.parentName, status: lead.status, assignedToId: lead.assignedToId }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/** Thêm / sửa / xoá con trong lead */
export async function addLeadChild(ctx: ProtectedContext, input: { leadId: string } & IntakeChild) {
  await loadForWrite(ctx, input.leadId);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(leadChildren).values({ leadId: input.leadId, fullName: input.fullName.trim(), birthYear: input.birthYear ?? null, grade: input.grade ?? null, school: input.school ?? null, interestedCourseId: input.interestedCourseId ?? null, notes: input.notes ?? null });
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: "system", actorId: ctx.user.id, content: `Thêm con: ${input.fullName.trim()}` });
    await tx.update(leads).set({ lastTouchAt: new Date() }).where(eq(leads.id, input.leadId));
  });
  return getLead(ctx, input.leadId);
}

export async function updateLeadChild(ctx: ProtectedContext, input: { leadId: string; childId: string } & Partial<IntakeChild>) {
  await loadForWrite(ctx, input.leadId);
  const child = await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, input.leadId)) });
  if (!child) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy con trong lead" });
  if (child.convertedStudentId) throw pre("Con đã chốt — sửa ở hồ sơ học viên");
  const patch = {
    ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
    ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
    ...(input.grade !== undefined ? { grade: input.grade } : {}),
    ...(input.school !== undefined ? { school: input.school?.trim() || null } : {}),
    ...(input.interestedCourseId !== undefined ? { interestedCourseId: input.interestedCourseId } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
  };
  if (patch.fullName === "") throw bad("Nhập họ tên con");
  if (!Object.keys(patch).length) return getLead(ctx, input.leadId);
  await ctx.db.transaction(async (tx) => {
    await tx.update(leadChildren).set(patch).where(eq(leadChildren.id, child.id));
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: "system", actorId: ctx.user.id, content: `Sửa thông tin con: ${patch.fullName ?? child.fullName}`, meta: { childId: child.id, fields: Object.keys(patch) } });
  });
  return getLead(ctx, input.leadId);
}

export async function removeLeadChild(ctx: ProtectedContext, input: { leadId: string; childId: string }) {
  await loadForWrite(ctx, input.leadId);
  const child = await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, input.leadId)) });
  if (!child) throw new TRPCError({ code: "NOT_FOUND" });
  if (child.convertedStudentId) throw pre("Con đã chốt, không xoá được");
  const [line] = await ctx.db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.leadChildId, child.id)).limit(1);
  if (line) throw pre("Con đã có dòng trong đơn hàng — không xoá được");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(leadChildren).where(eq(leadChildren.id, child.id));
    await tx.insert(leadActivities).values({ leadId: input.leadId, type: "system", actorId: ctx.user.id, content: `Xoá con: ${child.fullName}` });
  });
  return getLead(ctx, input.leadId);
}

/* ------------------------------------------------------------------ */
/* Chuyển đổi lead → học viên                                           */
/* ------------------------------------------------------------------ */

export interface ConvertItemInput {
  /** Con trong lead (bỏ trống khi lead chưa có danh sách con) */
  childId?: string | null;
  studentName?: string | null;
  dateOfBirth?: string | null;
  grade?: number | null;
  classId: string;
  packageSessions: number;
  status?: "active" | "trial";
  /** Học bổng toàn phần: học phí em này về 0đ (lý do bắt buộc) */
  scholarshipFull?: boolean;
  scholarshipReason?: string | null;
}

export interface ConvertLeadInput {
  leadId: string;
  parent?: { fullName?: string | null; email?: string | null; idNumber?: string | null; address?: string | null; province?: string | null; ward?: string | null } | null;
  items: ConvertItemInput[];
  /** PH đồng ý cho đăng ảnh con (NĐ13) */
  mediaConsent?: boolean;
  /** Miễn khoá tiên quyết (quản lý cơ sở, kèm lý do) — khách mới xếp lớp theo năng lực */
  waiverReason?: string | null;
}

export interface ConvertOptions {
  /** Chốt hàng loạt: "Đã đóng" → tạo đơn giá niêm yết + khoản thu lùi ngày chờ kế toán */
  backfill?: { amount: number; paidAt: string } | null;
  /** Chốt hàng loạt không có tiền (luồng nhập liệu ban đầu) — chỉ lead "Đã đăng ký" hoặc người có quyền duyệt tài chính */
  bulk?: boolean;
}

export type ConvertResult = { studentId: string; enrollmentId: string; studentIds: string[]; enrollmentIds: string[]; parentId: string; leadClosed: boolean; accountPending: boolean; orderCode: string | null };

/**
 * CHUYỂN ĐỔI: lead → phụ huynh (ghép theo SĐT) + nhiều học viên + ghi danh, trong một transaction.
 * Chặn khi lead chưa có đơn đã ghi nhận thu (đơn 0đ học bổng cho qua). Mã HV sinh theo max của cơ sở + năm.
 * Lead sang "Đã đăng ký" khi mọi con đã chốt. Tài khoản PH ở trạng thái "chờ kích hoạt".
 */
export async function convertLead(ctx: ProtectedContext, input: ConvertLeadInput, opts: ConvertOptions = {}): Promise<ConvertResult> {
  const lead = await loadForWrite(ctx, input.leadId);
  if (!input.items.length) throw bad("Chọn ít nhất một học viên để chốt");
  if (input.items.length > 10) throw bad("Tối đa 10 học viên mỗi lần chốt");
  if (lead.status === "lost") throw pre("Lead đã mất — mở lại lead trước khi chốt");
  const allKids = await ctx.db.select().from(leadChildren).where(eq(leadChildren.leadId, lead.id)).orderBy(asc(leadChildren.createdAt));
  const openKids = allKids.filter((k) => !k.convertedStudentId);
  if (lead.status === "enrolled" && openKids.length === 0) throw pre("Lead đã chuyển đổi");
  if (lead.convertedAt && allKids.length === 0) throw pre("Lead đã chuyển đổi");

  const parentIn = input.parent ?? {};
  if (parentIn.idNumber?.trim() && !isValidIdNumber(parentIn.idNumber)) throw bad("CCCD / CMND gồm 9 hoặc 12 chữ số");
  if (parentIn.email?.trim() && !EMAIL_RE.test(parentIn.email.trim())) throw bad("Email phụ huynh không hợp lệ");

  const loadClass = (id: string) => ctx.db.query.classes.findFirst({ where: eq(classes.id, id), with: { center: true, course: true } });
  type PlanRow = { it: ConvertItemInput; child: (typeof allKids)[number] | null; cls: NonNullable<Awaited<ReturnType<typeof loadClass>>>; listPrice: number; totalSessions: number };
  const plan: PlanRow[] = [];
  const seen = new Set<string>();
  for (const [i, it] of input.items.entries()) {
    const n = `Học viên ${i + 1}`;
    let child: PlanRow["child"] = null;
    if (it.childId) {
      child = allKids.find((k) => k.id === it.childId) ?? null;
      if (!child) throw bad(`${n}: không thuộc lead này`);
      if (child.convertedStudentId) throw pre(`${child.fullName} đã được chốt`);
      if (seen.has(child.id)) throw bad(`${child.fullName} bị chọn hai lần`);
      seen.add(child.id);
    } else if (openKids.length > 0 && !it.studentName?.trim()) {
      throw bad(`${n}: chọn con trong lead hoặc nhập tên học viên`);
    }
    if (it.scholarshipFull) {
      const e = checkScholarshipReason(it.scholarshipReason);
      if (e) throw bad(`${n}: ${e}`);
    }
    const cls = await loadClass(it.classId);
    if (!cls || cls.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: `${n}: lớp không tồn tại` });
    if (cls.status === "finished" || cls.status === "cancelled") throw pre(`Lớp ${cls.code} đã kết thúc / huỷ`);
    requirePermission(ctx, "enrollment:create", { centerId: cls.centerId });
    const courseId = child?.interestedCourseId ?? (openKids.length ? null : lead.interestedCourseId);
    const otherCenter = !!lead.centerId && cls.centerId !== lead.centerId;
    const otherCourse = !!courseId && cls.courseId !== courseId;
    if ((otherCenter || otherCourse) && !authorize(ctx.actor, "class:approve", { centerId: cls.centerId }).allowed) {
      throw pre(`Lớp ${cls.code} khác ${otherCenter ? "cơ sở của khách" : "khoá quan tâm"} — cần quyền quản lý cơ sở`);
    }
    plan.push({ it, child, cls, listPrice: Number(cls.course?.listPrice ?? 0), totalSessions: cls.course?.totalSessions ?? 0 });
  }

  // Chặn chốt khi chưa ghi nhận thanh toán
  const pay = await leadPaymentSummary(ctx.db, lead.id);
  const allScholarship = plan.every((p) => p.it.scholarshipFull);
  const backfill = opts.backfill && opts.backfill.amount > 0 ? opts.backfill : null;
  const orderCenterId = lead.centerId ?? plan[0]!.cls.centerId;
  if (backfill) {
    if (pay.count > 0) throw pre("Lead đã có đơn hàng — ghi khoản thu ở trang đơn thay vì nhập \"Đã đóng\"");
    if (plan.length !== 1 || plan[0]!.it.scholarshipFull) throw bad("Ghi \"Đã đóng\" cho từng học viên không có học bổng");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(backfill.paidAt) || backfill.paidAt > todayISO()) throw bad("Ngày đóng không hợp lệ (không được ở tương lai)");
    requirePermission(ctx, "finance:create", { centerId: orderCenterId });
  }
  let unpaidBypass = false;
  if (pay.gate && !allScholarship && !backfill) {
    const allowed = !!opts.bulk && (lead.status === "enrolled" || authorize(ctx.actor, "finance:approve", { centerId: orderCenterId }).allowed);
    if (!allowed) throw pre(pay.gate);
    unpaidBypass = true;
  }
  const waivers: (string | null)[] = [];
  for (const p of plan) waivers.push(await enforcePrerequisites(ctx, { studentId: null, courseId: p.cls.courseId, centerId: p.cls.centerId, waiverReason: input.waiverReason }));
  const backfillMethodId = backfill ? await pickBackfillMethod(ctx.db, orderCenterId) : null;
  const parentName = parentIn.fullName?.trim() || lead.parentName;
  const today = todayISO();

  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    let parent = await tx.query.parents.findFirst({ where: and(eq(parents.phone, lead.phoneNormalized), isNull(parents.deletedAt)) });
    let accountPending = false;
    if (!parent) {
      [parent] = await tx.insert(parents).values({
        fullName: parentName, phone: lead.phoneNormalized, email: parentIn.email?.trim() || lead.email || null,
        mediaConsent: !!input.mediaConsent, mediaConsentAt: input.mediaConsent ? new Date() : null,
        accountStatus: "pending_activation", activationRequestedAt: new Date(),
      }).returning();
      accountPending = true;
    } else {
      const patch: Partial<typeof parents.$inferInsert> = {};
      if (input.mediaConsent && !parent.mediaConsent) { patch.mediaConsent = true; patch.mediaConsentAt = new Date(); }
      if (!parent.email && (parentIn.email?.trim() || lead.email)) patch.email = parentIn.email?.trim() || lead.email;
      if (parent.accountStatus === "none" && !parent.userId) { patch.accountStatus = "pending_activation"; patch.activationRequestedAt = new Date(); accountPending = true; }
      if (Object.keys(patch).length) await tx.update(parents).set(patch).where(eq(parents.id, parent.id));
    }
    // CCCD / địa chỉ phụ huynh: mã hoá tầng ứng dụng
    const addressText = [parentIn.address, parentIn.ward, parentIn.province].map((x) => x?.trim()).filter(Boolean).join(", ");
    const priv = {
      ...(parentIn.idNumber?.trim() ? { nationalIdEnc: sealPii(parentIn.idNumber.replace(/\s/g, "")) } : {}),
      ...(addressText ? { addressEnc: sealPii(JSON.stringify({ address: parentIn.address?.trim() || null, ward: parentIn.ward?.trim() || null, province: parentIn.province?.trim() || null })) } : {}),
    };
    if (Object.keys(priv).length) {
      await tx.insert(parentPrivate).values({ parentId: parent!.id, ...priv }).onConflictDoUpdate({ target: parentPrivate.parentId, set: { ...priv, updatedAt: new Date() } });
    }

    const created: { p: PlanRow; studentId: string; studentName: string; enrollmentId: string }[] = [];
    for (const p of plan) {
      const centerCode = p.cls.center.code.toUpperCase();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"student-code:" + centerCode}))`);
      const code = await nextStudentCode(t as unknown as Db, centerCode);
      const [student] = await tx.insert(students).values({
        code,
        fullName: p.it.studentName?.trim() || p.child?.fullName || lead.childName || `Con của ${parentName}`,
        dateOfBirth: p.it.dateOfBirth || null,
        grade: p.it.grade ?? p.child?.grade ?? lead.childGrade ?? null,
        school: p.child?.school ?? lead.school ?? null,
        homeCenterId: p.cls.centerId,
        status: p.it.status === "trial" ? "trial" : "active",
      }).returning({ id: students.id, fullName: students.fullName });
      await tx.insert(studentGuardians).values({ studentId: student!.id, parentId: parent!.id, isPrimary: true });
      const [enr] = await tx.insert(enrollments).values({ studentId: student!.id, classId: p.cls.id, packageSessions: p.it.packageSessions, status: p.it.status ?? "active", createdBy: ctx.user.id }).returning({ id: enrollments.id });
      if (p.child) {
        await tx.update(leadChildren).set({ convertedStudentId: student!.id }).where(eq(leadChildren.id, p.child.id));
        await tx.update(orderItems).set({ studentId: student!.id, enrollmentId: enr!.id }).where(and(eq(orderItems.leadChildId, p.child.id), isNull(orderItems.studentId)));
      }
      created.push({ p, studentId: student!.id, studentName: student!.fullName, enrollmentId: enr!.id });
    }

    const customer = { name: parentName, phone: localPhone(lead.phoneNormalized), email: parentIn.email?.trim() || lead.email || null };
    let orderCode: string | null = null;
    // Học bổng toàn phần → đơn 0đ (lý do trên từng dòng) để khối thanh toán / công nợ đúng
    const scholarship = created.filter((c) => c.p.it.scholarshipFull);
    if (scholarship.length) {
      const one = scholarship.length === 1 ? scholarship[0]! : null;
      const o = await insertLeadOrderTx(t, {
        leadId: lead.id, centerId: orderCenterId, parentId: parent!.id, studentId: one?.studentId ?? null, enrollmentId: one?.enrollmentId ?? null, customer,
        items: scholarship.map((c) => ({
          courseId: c.p.cls.courseId, description: `Học bổng toàn phần — ${c.p.cls.course?.code ?? c.p.cls.code} (${c.studentName}; giá lớp ${formatVnd(packagePrice(c.p.listPrice, c.p.totalSessions, c.p.it.packageSessions))}) · ${c.p.it.scholarshipReason!.trim()}`,
          unitPrice: 0, packageSessions: c.p.it.packageSessions, leadChildId: c.p.child?.id ?? null, studentId: c.studentId, enrollmentId: c.enrollmentId,
        })),
        paymentMethodId: null, internalNote: `Học bổng toàn phần: ${scholarship.map((c) => c.p.it.scholarshipReason!.trim()).join("; ")}`, dueDate: today, actorId: ctx.user.id,
      });
      orderCode = o.code;
    }
    // Chốt hàng loạt có "Đã đóng": đơn giá niêm yết + khoản thu lùi ngày (chờ kế toán)
    if (backfill) {
      const c = created[0]!;
      const price = Math.max(packagePrice(c.p.listPrice, c.p.totalSessions, c.p.it.packageSessions), backfill.amount);
      const o = await insertLeadOrderTx(t, {
        leadId: lead.id, centerId: orderCenterId, parentId: parent!.id, studentId: c.studentId, enrollmentId: c.enrollmentId, customer,
        items: [{ courseId: c.p.cls.courseId, description: `Học phí ${c.p.cls.course?.code ?? ""} — gói ${c.p.it.packageSessions} buổi (${c.studentName}, lớp ${c.p.cls.code})`, unitPrice: price, packageSessions: c.p.it.packageSessions, leadChildId: c.p.child?.id ?? null, studentId: c.studentId, enrollmentId: c.enrollmentId }],
        paymentMethodId: backfillMethodId, internalNote: "Chốt hàng loạt — học phí đã đóng trước khi lên hệ thống", dueDate: backfill.paidAt, actorId: ctx.user.id,
        payment: { amount: backfill.amount, paidAt: backfill.paidAt, note: "Nhập liệu ban đầu (chốt hàng loạt)" },
      });
      orderCode = o.code;
    }
    // Đơn đã có của lead: gắn phụ huynh, và học viên / ghi danh khi đơn chỉ thuộc một em
    const leadOrders = await tx.select({ id: orders.id, parentId: orders.parentId, studentId: orders.studentId, enrollmentId: orders.enrollmentId }).from(orders).where(and(eq(orders.leadId, lead.id), ne(orders.status, "cancelled")));
    for (const o of leadOrders) {
      const lines = await tx.select({ leadChildId: orderItems.leadChildId }).from(orderItems).where(eq(orderItems.orderId, o.id));
      const kidIds = [...new Set(lines.map((l) => l.leadChildId).filter((x): x is string => !!x))];
      const target = kidIds.length === 1 ? created.find((c) => c.p.child?.id === kidIds[0]) : kidIds.length === 0 && created.length === 1 ? created[0] : undefined;
      const set: Partial<typeof orders.$inferInsert> = {};
      if (!o.parentId) set.parentId = parent!.id;
      if (target && !o.studentId) set.studentId = target.studentId;
      if (target && !o.enrollmentId) set.enrollmentId = target.enrollmentId;
      if (Object.keys(set).length) await tx.update(orders).set(set).where(eq(orders.id, o.id));
    }

    // Lead đóng khi không còn con nào chưa chốt
    const [remaining] = await tx.select({ n: sql<number>`count(*)::int` }).from(leadChildren).where(and(eq(leadChildren.leadId, lead.id), isNull(leadChildren.convertedStudentId)));
    const closeLead = (remaining?.n ?? 0) === 0;
    await tx.update(leads).set({
      ...(closeLead ? { status: "enrolled" as const } : {}),
      convertedParentId: parent!.id, convertedStudentId: lead.convertedStudentId ?? created[0]!.studentId, convertedAt: lead.convertedAt ?? new Date(), lastTouchAt: new Date(),
    }).where(eq(leads.id, lead.id));
    for (const [i, c] of created.entries()) {
      await tx.insert(leadActivities).values({
        leadId: lead.id, type: "status_change", actorId: ctx.user.id,
        content: `Ghi danh ${c.studentName} vào lớp ${c.p.cls.code}${c.p.it.scholarshipFull ? " · học bổng toàn phần" : ""}${i === 0 && backfill ? ` · đã đóng ${formatVnd(backfill.amount)} (${backfill.paidAt}, chờ kế toán)` : ""}${i === 0 && accountPending ? " · tài khoản PH chờ kích hoạt" : ""}${i === 0 && unpaidBypass ? " · chốt khi chưa có khoản thu (nhập liệu ban đầu)" : ""}`,
        meta: { from: lead.status, to: closeLead ? "enrolled" : lead.status, event: "enroll", studentId: c.studentId, enrollmentId: c.enrollmentId, mediaConsent: !!input.mediaConsent, prerequisiteWaiver: waivers[i] ?? null, scholarship: c.p.it.scholarshipFull ? c.p.it.scholarshipReason : null },
      });
      await emit(t, { type: "enrollment.created", enrollmentId: c.enrollmentId, studentId: c.studentId, classId: c.p.cls.id });
    }
    if (closeLead && lead.status !== "enrolled") await emit(t, { type: "lead.status_changed", leadId: lead.id, from: lead.status, to: "enrolled", actorId: ctx.user.id });
    if (accountPending) await emit(t, { type: "parent.account_pending", parentId: parent!.id, phone: parent!.phone });
    await writeAudit(t, {
      actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "conversion", entityId: lead.id,
      after: {
        students: created.map((c) => c.studentId), enrollments: created.map((c) => c.enrollmentId), parentId: parent!.id,
        payment: { orders: pay.count, total: pay.total, recorded: pay.recorded, confirmed: pay.confirmed }, unpaidBypass, backfill, orderCode,
        scholarship: scholarship.map((c) => ({ studentId: c.studentId, reason: c.p.it.scholarshipReason })), parentPrivate: Object.keys(priv),
      },
      reason: unpaidBypass ? "Chốt không tiền — luồng nhập liệu ban đầu" : null,
      ip: ctx.ip,
    });
    return {
      studentId: created[0]!.studentId, enrollmentId: created[0]!.enrollmentId,
      studentIds: created.map((c) => c.studentId), enrollmentIds: created.map((c) => c.enrollmentId),
      parentId: parent!.id, leadClosed: closeLead, accountPending, orderCode,
    };
  });
}

/** Chốt hàng loạt từng dòng (dùng cho bulkConvert) */
export function convertBulkItem(ctx: ProtectedContext, item: { leadId: string; childId?: string | null; classId: string; packageSessions: number; mediaConsent?: boolean; paidAmount?: number | null; paidAt?: string | null; status?: "active" | "trial" }) {
  return convertLead(
    ctx,
    { leadId: item.leadId, items: [{ childId: item.childId ?? null, classId: item.classId, packageSessions: item.packageSessions, status: item.status }], mediaConsent: item.mediaConsent },
    { bulk: true, backfill: item.paidAmount && item.paidAmount > 0 ? { amount: item.paidAmount, paidAt: item.paidAt || todayISO() } : null },
  );
}

/** Việc lead đến hạn/quá hạn của tôi — cho widget "Hôm nay" của sale */
export async function myLeadTasks(ctx: ProtectedContext) {
  const rows = await ctx.db
    .select({ id: leadTasks.id, title: leadTasks.title, dueAt: leadTasks.dueAt, leadId: leadTasks.leadId, parentName: leads.parentName, status: leads.status })
    .from(leadTasks)
    .innerJoin(leads, eq(leads.id, leadTasks.leadId))
    .where(and(isNull(leadTasks.doneAt), isNull(leads.deletedAt), or(eq(leadTasks.assigneeId, ctx.user.id), eq(leads.assignedToId, ctx.user.id))!, lte(leadTasks.dueAt, new Date(Date.now() + 24 * 3600 * 1000))))
    .orderBy(asc(leadTasks.dueAt))
    .limit(50);
  const now = Date.now();
  return rows.map((r) => ({ ...r, overdue: r.dueAt.getTime() < now }));
}

/** Danh sách sale/CSKH có thể nhận lead (cho dropdown phân bổ) */
export async function assigneeOptions(ctx: ProtectedContext, centerId?: string | null) {
  return ctx.db
    .select({ id: users.id, fullName: users.fullName, email: users.email, isAvailable: leadAssignees.isAvailable, centerId: leadAssignees.centerId })
    .from(leadAssignees)
    .innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(and(eq(users.isActive, true), centerId ? or(eq(leadAssignees.centerId, centerId), isNull(leadAssignees.centerId))! : sql`true`))
    .orderBy(asc(users.fullName));
}
