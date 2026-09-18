import { and, eq, inArray, sql, desc, asc, or, isNull, lt, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  dataRequests, dataRequestEvents, consentRecords, leads, leadChildren, leadActivities, parents, parentPrivate, studentGuardians, students, enrollments, classes,
  orders, payments, parentNotifications, parentFeedback, parentRequests, auditLog, users, centers, dataIncidents, type Database,
} from "@satarobo/db";
import {
  authorize, authorizeGlobal, visibleCenterIds, hasRole, normalizeVnPhone, maskPhone, dsrAckDue, dsrCanExtend,
  incidentNotifyDue, validateIncident, incidentCloseCheck, incidentCode, INCIDENT_SEVERITY_VI, INCIDENT_STATUS_VI, DSR_SLA_DAYS,
  type IncidentSeverity, type IncidentStatus,
  dsrTransition, dsrDue, dsrSlaState, erasureDecision, validateDsr, dsrCode, retentionCutoff, anonymizedPhone, ANON_NAME, CONSENT_TEXT_VERSION,
  DSR_TYPE_VI, DSR_STATUS_VI, CONSENT_PURPOSE_VI, CONSENT_PURPOSES,
  type DsrType, type DsrStatus, type DsrAction, type SubjectType, type ConsentPurpose,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { putObject, signedFileUrl } from "../storage";
import { todayISO } from "./sessions";
import { getMarketingSettings } from "./growth";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const asDb = (d: Database) => d as unknown as Db;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "GrowthRuleError") throw pre((e as Error).message);
    throw e;
  }
}
/** Người xử lý yêu cầu dữ liệu: quản trị hệ thống (DPO) */
const isProcessor = (ctx: ProtectedContext) => authorizeGlobal(ctx.actor, "compliance:update");
const isGlobalReader = (ctx: ProtectedContext) => isProcessor(ctx) || authorizeGlobal(ctx.actor, "compliance:read");
function reqScope(ctx: ProtectedContext): SQL {
  if (isGlobalReader(ctx)) return sql`true`;
  const v = visibleCenterIds(ctx.actor) ?? [];
  return v.length ? or(inArray(dataRequests.centerId, v), eq(dataRequests.createdBy, ctx.user.id))! : eq(dataRequests.createdBy, ctx.user.id);
}

/* ------------------------------------------------------------------ */
/* Tìm chủ thể dữ liệu                                                  */
/* ------------------------------------------------------------------ */

export async function findSubjects(ctx: ProtectedContext, input: { phone: string }) {
  if (!authorize(ctx.actor, "compliance:read", {}).allowed && !authorize(ctx.actor, "compliance:create", {}).allowed) throw forbid("Không có quyền");
  const pn = normalizeVnPhone(input.phone);
  if (!pn) throw bad("Số điện thoại không hợp lệ");
  const v = visibleCenterIds(ctx.actor);
  const ls = await ctx.db.select({ id: leads.id, name: leads.parentName, status: leads.status, centerId: leads.centerId, createdAt: leads.createdAt, anonymizedAt: leads.anonymizedAt })
    .from(leads).where(and(eq(leads.phoneNormalized, pn), isNull(leads.deletedAt), tenantCond(ctx, leads))).orderBy(desc(leads.createdAt)).limit(10);
  const phoneVariants = [pn, `0${pn.slice(2)}`, pn.replace(/^84/, "0")];
  const ps = await ctx.db.select({ id: parents.id, name: parents.fullName, anonymizedAt: parents.anonymizedAt,
    children: sql<string>`(select string_agg(s.full_name, ', ') from ${studentGuardians} g join ${students} s on s.id = g.student_id where g.parent_id = ${parents.id})` })
    .from(parents).where(and(inArray(parents.phone, [...new Set(phoneVariants)]), isNull(parents.deletedAt), tenantCond(ctx, parents))).limit(10);
  return {
    phone: maskPhone(pn),
    subjects: [
      ...ls.filter((l) => v === null || !l.centerId || v.includes(l.centerId)).map((l) => ({ type: "lead" as SubjectType, id: l.id, label: `Lead: ${l.name} (${l.status})`, anonymized: !!l.anonymizedAt })),
      ...ps.map((p) => ({ type: "parent" as SubjectType, id: p.id, label: `Phụ huynh: ${p.name}${p.children ? ` — con: ${p.children}` : ""}`, anonymized: !!p.anonymizedAt })),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Yêu cầu của chủ thể dữ liệu                                          */
/* ------------------------------------------------------------------ */

export async function listRequests(ctx: ProtectedContext, input: { status?: DsrStatus; open?: boolean }) {
  if (!hasPermissionAny(ctx, "compliance:read") && !hasPermissionAny(ctx, "compliance:create")) throw forbid("Không có quyền xem yêu cầu dữ liệu");
  const conds: SQL[] = [reqScope(ctx)];
  if (input.status) conds.push(eq(dataRequests.status, input.status));
  else if (input.open !== false) conds.push(inArray(dataRequests.status, ["received", "verifying", "in_progress"]));
  const r = await ctx.db.select({ d: dataRequests, centerCode: centers.code, byName: users.fullName }).from(dataRequests)
    .leftJoin(centers, eq(centers.id, dataRequests.centerId)).leftJoin(users, eq(users.id, dataRequests.createdBy))
    .where(and(...conds)).orderBy(asc(dataRequests.dueAt)).limit(200);
  const [c] = await ctx.db.select({
    open: sql<number>`count(*) filter (where ${dataRequests.status} in ('received','verifying','in_progress'))::int`,
    overdue: sql<number>`count(*) filter (where ${dataRequests.status} in ('received','verifying','in_progress') and ${dataRequests.dueAt} < now())::int`,
    completed: sql<number>`count(*) filter (where ${dataRequests.status} = 'completed')::int`,
    onTime: sql<number>`count(*) filter (where ${dataRequests.status} = 'completed' and ${dataRequests.completedAt} <= ${dataRequests.dueAt})::int`,
  }).from(dataRequests).where(reqScope(ctx));
  const now = new Date();
  const vis = visibleCenterIds(ctx.actor);
  const centerList = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers)
    .where(and(eq(centers.isActive, true), vis === null ? sql`true` : vis.length ? inArray(centers.id, vis) : sql`false`)).orderBy(asc(centers.code));
  return {
    counts: c, canProcess: isProcessor(ctx), canCreate: hasPermissionAny(ctx, "compliance:create"), centers: centerList,
    globalCreate: authorizeGlobal(ctx.actor, "compliance:create"),
    items: r.map((x) => ({
      ...x.d, requesterPhone: maskPhone(normalizeVnPhone(x.d.requesterPhone) ?? x.d.requesterPhone), typeLabel: DSR_TYPE_VI[x.d.type as DsrType], statusLabel: DSR_STATUS_VI[x.d.status as DsrStatus],
      sla: dsrSlaState(x.d.dueAt, x.d.status as DsrStatus, now), centerCode: x.centerCode, byName: x.byName,
      ackOverdue: !x.d.acknowledgedAt && !!x.d.ackDueAt && x.d.ackDueAt < now && (x.d.status === "received"),
    })),
  };
}
function hasPermissionAny(ctx: ProtectedContext, p: "compliance:read" | "compliance:create") {
  return ctx.actor.assignments.some((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, p, { centerId: a.centerId }).allowed);
}

async function nextCode(db: Db) {
  const y = Number(todayISO().slice(0, 4));
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(dataRequests).where(sql`${dataRequests.code} like ${`YC-DL${String(y).slice(-2)}-%`}`);
  return dsrCode(y, (r?.n ?? 0) + 1);
}

export async function createRequest(ctx: ProtectedContext, input: { type: DsrType; requesterName: string; requesterPhone: string; channel: string; details: string; subjectType?: SubjectType | null; subjectId?: string | null; centerId?: string | null }) {
  const centerId = input.centerId ?? null;
  if (!authorize(ctx.actor, "compliance:create", { centerId }).allowed) throw forbid("Không có quyền ghi nhận yêu cầu dữ liệu");
  if (!centerId && !authorizeGlobal(ctx.actor, "compliance:create")) throw bad("Chọn cơ sở tiếp nhận yêu cầu");
  const errs = validateDsr(input);
  if (errs.length) throw bad(errs);
  if ((input.subjectType && !input.subjectId) || (!input.subjectType && input.subjectId)) throw bad("Chọn đủ loại và hồ sơ chủ thể");
  if (input.subjectType && input.subjectId) await loadSubject(ctx.db, input.subjectType, input.subjectId);
  const receivedAt = new Date();
  const dueAt = dsrDue(input.type, receivedAt);
  const ackDueAt = dsrAckDue(receivedAt);
  const code = await nextCode(ctx.db);
  const [r] = await ctx.db.insert(dataRequests).values({
    code, type: input.type, requesterName: input.requesterName.trim(), requesterPhone: input.requesterPhone.replace(/\D/g, ""), channel: input.channel, details: input.details.trim(),
    subjectType: input.subjectType ?? null, subjectId: input.subjectId ?? null, centerId, receivedAt, dueAt, ackDueAt, createdBy: ctx.user.id,
  }).returning({ id: dataRequests.id });
  await ctx.db.insert(dataRequestEvents).values({ requestId: r!.id, action: "received", note: `Kênh: ${input.channel}`, userId: ctx.user.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "compliance", entity: "data_requests", entityId: r!.id, after: { code, type: input.type, subjectType: input.subjectType ?? null }, ip: ctx.ip });
  return { id: r!.id, code, dueAt, ackDueAt };
}

async function loadSubject(db: Db, type: SubjectType, id: string) {
  if (type === "lead") {
    const l = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!l) throw notFound("Không tìm thấy lead");
    return { type, id, name: l.parentName, phone: l.phone, email: l.email, centerId: l.centerId, anonymizedAt: l.anonymizedAt, record: l as unknown as Record<string, unknown> };
  }
  const p = await db.query.parents.findFirst({ where: eq(parents.id, id) });
  if (!p) throw notFound("Không tìm thấy phụ huynh");
  return { type, id, name: p.fullName, phone: p.phone, email: p.email, centerId: null as string | null, anonymizedAt: p.anonymizedAt, record: p as unknown as Record<string, unknown> };
}

async function subjectFacts(db: Db, type: SubjectType, id: string) {
  if (type === "lead") {
    const l = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    const converted = !!l?.convertedParentId;
    return { hasFinancialRecords: false, hasActiveEnrollment: false, hasOpenDebt: false, note: converted ? "Lead đã chuyển thành phụ huynh — xử lý thêm hồ sơ phụ huynh" : null };
  }
  const kids = (await db.select({ s: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.parentId, id))).map((r) => r.s);
  const [act] = kids.length ? await db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(inArray(enrollments.studentId, kids), inArray(enrollments.status, ["active", "trial", "paused"]))) : [{ n: 0 }];
  const [fin] = await db.select({ n: sql<number>`count(*)::int`, open: sql<number>`count(*) filter (where ${orders.status} in ('pending_payment','partially_paid'))::int` })
    .from(orders).where(or(eq(orders.parentId, id), kids.length ? inArray(orders.studentId, kids) : sql`false`));
  return { hasFinancialRecords: (fin?.n ?? 0) > 0, hasActiveEnrollment: (act?.n ?? 0) > 0, hasOpenDebt: (fin?.open ?? 0) > 0, note: null as string | null };
}

export async function getRequest(ctx: ProtectedContext, id: string) {
  if (!hasPermissionAny(ctx, "compliance:read") && !hasPermissionAny(ctx, "compliance:create")) throw forbid("Không có quyền xem yêu cầu dữ liệu");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, id) });
  if (!d) throw notFound("Không tìm thấy yêu cầu");
  const [visible] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(dataRequests).where(and(eq(dataRequests.id, id), reqScope(ctx)));
  if (!visible?.n) throw forbid("Không xem được yêu cầu này");
  const events = await ctx.db.select({ e: dataRequestEvents, byName: users.fullName }).from(dataRequestEvents).leftJoin(users, eq(users.id, dataRequestEvents.userId))
    .where(eq(dataRequestEvents.requestId, d.id)).orderBy(asc(dataRequestEvents.createdAt));
  const processor = isProcessor(ctx);
  let subject: null | { type: SubjectType; id: string; name: string; phone: string; anonymized: boolean; consents: { purpose: ConsentPurpose; label: string; granted: boolean | null; at: Date | null }[]; erasure: ReturnType<typeof erasureDecision>; note: string | null } = null;
  if (d.subjectType && d.subjectId) {
    const s = await loadSubject(ctx.db, d.subjectType as SubjectType, d.subjectId);
    const facts = await subjectFacts(ctx.db, s.type, s.id);
    const cons = await consentState(ctx.db, s.type, s.id);
    subject = {
      type: s.type, id: s.id, name: s.name, phone: processor ? s.phone : maskPhone(normalizeVnPhone(s.phone) ?? s.phone), anonymized: !!s.anonymizedAt,
      consents: cons, erasure: erasureDecision({ subjectType: s.type, ...facts }), note: facts.note,
    };
  }
  const status = d.status as DsrStatus;
  const open = status !== "completed" && status !== "rejected";
  return {
    ...d, requesterPhone: processor ? d.requesterPhone : maskPhone(normalizeVnPhone(d.requesterPhone) ?? d.requesterPhone),
    typeLabel: DSR_TYPE_VI[d.type as DsrType], statusLabel: DSR_STATUS_VI[status], sla: dsrSlaState(d.dueAt, status, new Date()),
    events: events.map((x) => ({ ...x.e, byName: x.byName })), subject,
    exportUrl: processor && d.exportKey ? signedFileUrl(d.exportKey, `${d.code}.json`, 900) : null,
    slaDays: DSR_SLA_DAYS[d.type as DsrType],
    can: { extend: processor && open && !d.extendedAt, process: processor && open, link: processor && open && !d.subjectId, export: processor && open && !!d.subjectId, erase: processor && open && d.type === "delete" && !!subject && !subject.anonymized, consent: processor && open && !!subject },
  };
}

async function consentState(db: Db, type: SubjectType, id: string) {
  const r = await db.select().from(consentRecords).where(and(eq(consentRecords.subjectType, type), eq(consentRecords.subjectId, id))).orderBy(desc(consentRecords.createdAt));
  return CONSENT_PURPOSES.map((p) => {
    const last = r.find((x) => x.purpose === p);
    return { purpose: p, label: CONSENT_PURPOSE_VI[p], granted: last ? last.granted : null, at: last?.createdAt ?? null };
  });
}

async function logEvent(db: Db, requestId: string, action: string, note: string | null, userId: string) {
  await db.insert(dataRequestEvents).values({ requestId, action, note, userId });
}

export async function requestAction(ctx: ProtectedContext, input: { id: string; action: DsrAction; note?: string | null }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách bảo vệ dữ liệu (quản trị) xử lý yêu cầu");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d) throw notFound("Không tìm thấy yêu cầu");
  const to = rule(() => dsrTransition(d.status as DsrStatus, input.action));
  const note = input.note?.trim() || null;
  if ((input.action === "reject" || input.action === "complete") && (!note || note.length < 10)) throw bad("Cần ghi kết quả / lý do (≥ 10 ký tự) — nội dung này dùng để phản hồi người yêu cầu");
  if (input.action === "complete") {
    if (!d.subjectId) throw pre("Chưa liên kết hồ sơ chủ thể");
    if (d.type === "access" && !d.exportKey) throw pre("Chưa xuất bản sao dữ liệu cho người yêu cầu");
    if (d.type === "delete") {
      const s = await loadSubject(ctx.db, d.subjectType as SubjectType, d.subjectId);
      if (!s.anonymizedAt) throw pre("Chưa thực hiện ẩn danh hoá — hoặc từ chối kèm lý do (nghĩa vụ lưu giữ)");
    }
    if (d.type === "withdraw_consent" || d.type === "object") {
      const cons = await consentState(ctx.db, d.subjectType as SubjectType, d.subjectId);
      const need: ConsentPurpose = d.type === "object" ? "marketing" : "marketing";
      if (cons.find((c) => c.purpose === need)?.granted !== false) throw pre("Chưa ghi nhận rút đồng ý tiếp thị");
    }
  }
  const now = new Date();
  await ctx.db.update(dataRequests).set({
    status: to, handledBy: ctx.user.id, ...(d.acknowledgedAt ? {} : { acknowledgedAt: now }),
    ...(input.action === "verify" || (input.action === "start" && !d.verifiedAt) ? { verifiedAt: now } : {}),
    ...(to === "completed" || to === "rejected" ? { completedAt: now, resolution: note } : {}),
  }).where(eq(dataRequests.id, d.id));
  await logEvent(ctx.db, d.id, input.action, note, ctx.user.id);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "compliance", entity: "data_requests", entityId: d.id, before: { status: d.status }, after: { status: to }, reason: note, ip: ctx.ip });
  return { status: to, onTime: to === "completed" ? now <= d.dueAt : null };
}

export async function linkSubject(ctx: ProtectedContext, input: { id: string; subjectType: SubjectType; subjectId: string }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách xử lý");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d) throw notFound("Không tìm thấy yêu cầu");
  if (d.status === "completed" || d.status === "rejected") throw pre("Yêu cầu đã đóng");
  const s = await loadSubject(ctx.db, input.subjectType, input.subjectId);
  await ctx.db.update(dataRequests).set({ subjectType: input.subjectType, subjectId: s.id, centerId: d.centerId ?? s.centerId }).where(eq(dataRequests.id, d.id));
  await logEvent(ctx.db, d.id, "link", `${input.subjectType}: ${s.name}`, ctx.user.id);
  return { ok: true };
}

/** Xuất bản sao dữ liệu cá nhân (JSON) — cho yêu cầu xem dữ liệu */
export async function exportSubjectData(ctx: ProtectedContext, input: { id: string }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách xử lý");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d?.subjectId || !d.subjectType) throw pre("Chưa liên kết hồ sơ chủ thể");
  const type = d.subjectType as SubjectType;
  const s = await loadSubject(ctx.db, type, d.subjectId);
  const pack: Record<string, unknown> = { yeuCau: d.code, xuatLuc: new Date().toISOString(), loaiChuThe: type, phienBanDieuKhoan: CONSENT_TEXT_VERSION };
  const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !/hash|Enc$|assignedToId|createdBy|updatedBy|userId/i.test(k)));
  pack.hoSo = strip(s.record);
  pack.dongY = await ctx.db.select({ mucDich: consentRecords.purpose, dongY: consentRecords.granted, nguon: consentRecords.source, luc: consentRecords.createdAt }).from(consentRecords)
    .where(and(eq(consentRecords.subjectType, type), eq(consentRecords.subjectId, s.id))).orderBy(asc(consentRecords.createdAt));
  if (type === "lead") {
    pack.con = await ctx.db.select({ hoTen: leadChildren.fullName, namSinh: leadChildren.birthYear, lop: leadChildren.grade, truong: leadChildren.school }).from(leadChildren).where(eq(leadChildren.leadId, s.id));
    pack.lichSuLienHe = await ctx.db.select({ loai: leadActivities.type, noiDung: leadActivities.content, luc: leadActivities.createdAt }).from(leadActivities).where(eq(leadActivities.leadId, s.id)).orderBy(asc(leadActivities.createdAt));
  } else {
    const kids = await ctx.db.select({ id: students.id, hoTen: students.fullName, ngaySinh: students.dateOfBirth, lop: students.grade, truong: students.school, trangThai: students.status })
      .from(studentGuardians).innerJoin(students, eq(students.id, studentGuardians.studentId)).where(eq(studentGuardians.parentId, s.id));
    pack.con = kids.map(({ id: _id, ...k }) => k);
    const kidIds = kids.map((k) => k.id);
    pack.ghiDanh = kidIds.length ? await ctx.db.select({ lop: classes.code, trangThai: enrollments.status, tuNgay: enrollments.createdAt }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(inArray(enrollments.studentId, kidIds)) : [];
    pack.donHang = await ctx.db.select({ ma: orders.code, tongTien: orders.total, trangThai: orders.status, luc: orders.createdAt }).from(orders).where(or(eq(orders.parentId, s.id), kidIds.length ? inArray(orders.studentId, kidIds) : sql`false`));
    pack.thanhToan = await ctx.db.select({ soTien: payments.amount, trangThai: payments.status, ngay: payments.paidAt }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(or(eq(orders.parentId, s.id), kidIds.length ? inArray(orders.studentId, kidIds) : sql`false`));
    pack.thongBao = await ctx.db.select({ tieuDe: parentNotifications.title, kenh: parentNotifications.channel, luc: parentNotifications.createdAt }).from(parentNotifications).where(eq(parentNotifications.parentId, s.id)).limit(500);
    pack.yeuCauPhuHuynh = await ctx.db.select({ ma: parentRequests.code, loai: parentRequests.type, trangThai: parentRequests.status, luc: parentRequests.createdAt }).from(parentRequests).where(eq(parentRequests.parentId, s.id));
    pack.danhGia = await ctx.db.select({ sao: parentFeedback.rating, luc: parentFeedback.createdAt }).from(parentFeedback).where(eq(parentFeedback.parentId, s.id));
  }
  const key = `docs/dsr/${d.id}/${Date.now()}.json`;
  await putObject(key, new TextEncoder().encode(JSON.stringify(pack, null, 2)));
  await ctx.db.update(dataRequests).set({ exportKey: key }).where(eq(dataRequests.id, d.id));
  await logEvent(ctx.db, d.id, "export", `Xuất ${Object.keys(pack).length} nhóm dữ liệu`, ctx.user.id);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "compliance", entity: type === "lead" ? "leads" : "parents", entityId: s.id, reason: `Xuất dữ liệu theo yêu cầu ${d.code}`, ip: ctx.ip });
  return { url: signedFileUrl(key, `${d.code}.json`, 900), groups: Object.keys(pack) };
}

/** Ghi nhận đồng ý / rút đồng ý theo mục đích */
export async function setConsent(ctx: ProtectedContext, input: { id: string; purpose: ConsentPurpose; granted: boolean }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách xử lý");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d?.subjectId || !d.subjectType) throw pre("Chưa liên kết hồ sơ chủ thể");
  const type = d.subjectType as SubjectType;
  await ctx.db.transaction(async (tx) => {
    await tx.insert(consentRecords).values({ subjectType: type, subjectId: d.subjectId!, purpose: input.purpose, granted: input.granted, source: "dsr", textVersion: CONSENT_TEXT_VERSION, requestId: d.id, recordedBy: ctx.user.id });
    if (input.purpose === "marketing") {
      if (type === "lead") await tx.update(leads).set({ marketingOptOut: !input.granted }).where(eq(leads.id, d.subjectId!));
      else await tx.update(parents).set({ marketingOptOut: !input.granted }).where(eq(parents.id, d.subjectId!));
    }
    if (input.purpose === "media" && type === "parent") await tx.update(parents).set({ mediaConsent: input.granted, mediaConsentAt: new Date() }).where(eq(parents.id, d.subjectId!));
    if (input.purpose === "service" && !input.granted) {
      if (type === "lead") await tx.update(leads).set({ processingRestricted: true }).where(eq(leads.id, d.subjectId!));
      else await tx.update(parents).set({ processingRestricted: true }).where(eq(parents.id, d.subjectId!));
    }
    await tx.insert(dataRequestEvents).values({ requestId: d.id, action: "consent", note: `${CONSENT_PURPOSE_VI[input.purpose]}: ${input.granted ? "đồng ý" : "rút đồng ý"}`, userId: ctx.user.id });
  });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "compliance", entity: "consent_records", entityId: d.subjectId, after: { purpose: input.purpose, granted: input.granted }, ip: ctx.ip });
  return { ok: true };
}

/** Ẩn danh hoá (thực hiện yêu cầu xoá) */
export async function eraseSubject(ctx: ProtectedContext, input: { id: string; confirm: string }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách xử lý");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d?.subjectId || !d.subjectType) throw pre("Chưa liên kết hồ sơ chủ thể");
  if (d.type !== "delete") throw pre("Chỉ ẩn danh hoá theo yêu cầu xoá dữ liệu");
  if (d.status !== "in_progress") throw pre("Chuyển yêu cầu sang 'Đang xử lý' (đã xác minh) trước khi xoá");
  if (input.confirm !== d.code) throw bad(`Nhập đúng mã ${d.code} để xác nhận`);
  const type = d.subjectType as SubjectType;
  const s = await loadSubject(ctx.db, type, d.subjectId);
  if (s.anonymizedAt) throw pre("Hồ sơ đã được ẩn danh");
  const facts = await subjectFacts(ctx.db, type, s.id);
  const dec = erasureDecision({ subjectType: type, ...facts });
  if (!dec.allowed) throw pre(dec.reasons);
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    if (type === "lead") await anonymizeLead(tx as unknown as Db, s.id, now);
    else {
      await tx.update(parents).set({ fullName: dec.mode === "partial" ? s.name : ANON_NAME, phone: anonymizedPhone(s.id), email: null, zaloId: null, marketingOptOut: true, processingRestricted: true, anonymizedAt: now, activationCodeHash: null }).where(eq(parents.id, s.id));
      await tx.delete(parentPrivate).where(eq(parentPrivate.parentId, s.id));
      await tx.update(orders).set({ customerPhone: anonymizedPhone(s.id), customerEmail: null }).where(eq(orders.parentId, s.id));
      const ls = await tx.select({ id: leads.id }).from(leads).where(eq(leads.convertedParentId, s.id));
      for (const l of ls) await anonymizeLead(tx as unknown as Db, l.id, now);
    }
    await tx.insert(consentRecords).values(CONSENT_PURPOSES.map((p) => ({ subjectType: type, subjectId: s.id, purpose: p, granted: false, source: "dsr", textVersion: CONSENT_TEXT_VERSION, requestId: d.id, recordedBy: ctx.user.id })));
    await tx.insert(dataRequestEvents).values({ requestId: d.id, action: "erase", note: dec.mode === "partial" ? dec.reasons.join("; ") : "Đã ẩn danh hoá toàn bộ thông tin liên hệ", userId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "compliance", entity: type === "lead" ? "leads" : "parents", entityId: s.id, reason: `Ẩn danh theo yêu cầu ${d.code} (${dec.mode})`, ip: ctx.ip });
  });
  return { mode: dec.mode, reasons: dec.reasons };
}

async function anonymizeLead(db: Db, id: string, now: Date) {
  await db.update(leads).set({ parentName: ANON_NAME, phone: anonymizedPhone(id), phoneNormalized: anonymizedPhone(id), email: null, childName: null, school: null, notes: null, marketingOptOut: true, processingRestricted: true, anonymizedAt: now }).where(eq(leads.id, id));
  await db.update(leadChildren).set({ fullName: ANON_NAME, school: null, notes: null }).where(eq(leadChildren.leadId, id));
  await db.update(leadActivities).set({ content: "[đã ẩn danh]", meta: null }).where(eq(leadActivities.leadId, id));
}

/* ------------------------------------------------------------------ */
/* Tổng quan & lưu giữ                                                  */
/* ------------------------------------------------------------------ */

export async function complianceOverview(ctx: ProtectedContext) {
  if (!isGlobalReader(ctx)) throw forbid("Chỉ quản trị / kiểm soát xem tổng quan tuân thủ");
  const s = await getMarketingSettings(ctx.db);
  const cutoff = rule(() => retentionCutoff(todayISO(), s.leadRetentionMonths));
  const [ret] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leads)
    .where(and(isNull(leads.anonymizedAt), isNull(leads.deletedAt), inArray(leads.status, ["lost", "new", "contacted", "nurturing"]), lt(leads.lastTouchAt, new Date(`${cutoff}T00:00:00+07:00`))));
  const [cons] = (await ctx.db.execute(sql`select
    (select count(*)::int from leads l where l.deleted_at is null and l.anonymized_at is null and l.consent_at is null) as "leadsNoConsent",
    ((select count(*) from leads l where l.marketing_opt_out) + (select count(*) from parents p where p.marketing_opt_out))::int as "marketingOptOut",
    (select count(*)::int from parents p where p.media_consent and p.deleted_at is null) as "mediaConsent",
    (select count(*)::int from parents p where p.deleted_at is null) as "parents"`)) as unknown as { leadsNoConsent: number; marketingOptOut: number; mediaConsent: number; parents: number }[];
  const reveals = await ctx.db.select({ entity: auditLog.entity, n: sql<number>`count(*)::int`, users: sql<number>`count(distinct ${auditLog.actorId})::int` })
    .from(auditLog).where(and(eq(auditLog.action, "PII_REVEAL"), sql`${auditLog.createdAt} > now() - interval '30 days'`)).groupBy(auditLog.entity);
  const recent = await ctx.db.select({ entity: auditLog.entity, reason: auditLog.reason, createdAt: auditLog.createdAt, byName: users.fullName })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(eq(auditLog.action, "PII_REVEAL")).orderBy(desc(auditLog.createdAt)).limit(15);
  return {
    retention: { months: s.leadRetentionMonths, cutoff, due: ret?.n ?? 0 },
    consent: cons ?? { leadsNoConsent: 0, marketingOptOut: 0, mediaConsent: 0, parents: 0 },
    piiReveals: reveals, recentReveals: recent, canProcess: isProcessor(ctx), incidents: await incidentSummary(ctx.db),
  };
}

/** Ẩn danh lead quá hạn lưu giữ (chưa chuyển đổi) */
export async function runRetention(ctx: ProtectedContext, input: { dryRun: boolean }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ quản trị chạy ẩn danh định kỳ");
  return retentionSweep(ctx.db as unknown as Database, { dryRun: input.dryRun, actorId: ctx.user.id });
}

export async function retentionSweep(db: Database, opts: { dryRun: boolean; actorId: string | null; limit?: number }) {
  const d = asDb(db);
  const s = await getMarketingSettings(d);
  const cutoff = retentionCutoff(todayISO(), s.leadRetentionMonths);
  const due = await d.select({ id: leads.id }).from(leads)
    .where(and(isNull(leads.anonymizedAt), isNull(leads.deletedAt), isNull(leads.convertedParentId), inArray(leads.status, ["lost", "new", "contacted", "nurturing"]), lt(leads.lastTouchAt, new Date(`${cutoff}T00:00:00+07:00`))))
    .limit(opts.limit ?? 500);
  if (opts.dryRun || !due.length) return { cutoff, count: due.length, done: 0 };
  const now = new Date();
  await d.transaction(async (tx) => {
    for (const l of due) await anonymizeLead(tx as unknown as Db, l.id, now);
    await writeAudit(tx as unknown as Db, { actorId: opts.actorId, action: "DELETE", module: "compliance", entity: "leads", entityId: null, after: { count: due.length, cutoff }, reason: `Hết hạn lưu giữ ${s.leadRetentionMonths} tháng` });
  });
  return { cutoff, count: due.length, done: due.length };
}

/** Lịch sử đồng ý của một hồ sơ (hiển thị ở trang lead / phụ huynh) */
export async function consentHistory(ctx: ProtectedContext, input: { subjectType: SubjectType; subjectId: string }) {
  requirePermission(ctx, input.subjectType === "lead" ? "lead:read" : "student:read");
  const r = await ctx.db.select({ c: consentRecords, byName: users.fullName }).from(consentRecords).leftJoin(users, eq(users.id, consentRecords.recordedBy))
    .where(and(eq(consentRecords.subjectType, input.subjectType), eq(consentRecords.subjectId, input.subjectId))).orderBy(desc(consentRecords.createdAt));
  return { current: await consentState(ctx.db, input.subjectType, input.subjectId), history: r.map((x) => ({ ...x.c, purposeLabel: CONSENT_PURPOSE_VI[x.c.purpose as ConsentPurpose], byName: x.byName })) };
}

/* ------------------------------------------------------------------ */
/* Gia hạn yêu cầu                                                      */
/* ------------------------------------------------------------------ */

export async function extendRequest(ctx: ProtectedContext, input: { id: string; reason: string }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách xử lý");
  const d = await ctx.db.query.dataRequests.findFirst({ where: eq(dataRequests.id, input.id) });
  if (!d) throw notFound("Không tìm thấy yêu cầu");
  const errs = dsrCanExtend({ status: d.status as DsrStatus, extendedAt: d.extendedAt, reason: input.reason });
  if (errs.length) throw pre(errs);
  const now = new Date();
  const dueAt = dsrDue(d.type as DsrType, d.receivedAt, true);
  await ctx.db.update(dataRequests).set({ dueAt, extendedAt: now, extensionReason: input.reason.trim(), ...(d.acknowledgedAt ? {} : { acknowledgedAt: now }) }).where(eq(dataRequests.id, d.id));
  await logEvent(ctx.db, d.id, "extend", `Gia hạn đến ${dueAt.toISOString().slice(0, 10)}: ${input.reason.trim()}`, ctx.user.id);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "compliance", entity: "data_requests", entityId: d.id, before: { dueAt: d.dueAt }, after: { dueAt }, reason: input.reason.trim(), ip: ctx.ip });
  return { dueAt };
}

/* ------------------------------------------------------------------ */
/* Sổ sự cố dữ liệu                                                     */
/* ------------------------------------------------------------------ */

async function incidentSummary(db: Db) {
  const [r] = await db.select({
    open: sql<number>`count(*) filter (where ${dataIncidents.status} <> 'closed')::int`,
    notifyOverdue: sql<number>`count(*) filter (where ${dataIncidents.status} <> 'closed' and ${dataIncidents.notifiedAuthorityAt} is null and ${dataIncidents.severity} <> 'low' and ${dataIncidents.notifyDueAt} < now())::int`,
    total: sql<number>`count(*)::int`,
  }).from(dataIncidents);
  return r ?? { open: 0, notifyOverdue: 0, total: 0 };
}

export async function listIncidents(ctx: ProtectedContext) {
  const canSee = isGlobalReader(ctx);
  const canReport = hasPermissionAny(ctx, "compliance:create");
  if (!canSee && !canReport) throw forbid("Không có quyền");
  const r = await ctx.db.select({ i: dataIncidents, centerCode: centers.code, byName: users.fullName }).from(dataIncidents)
    .leftJoin(centers, eq(centers.id, dataIncidents.centerId)).leftJoin(users, eq(users.id, dataIncidents.reportedBy))
    .where(canSee ? undefined : eq(dataIncidents.reportedBy, ctx.user.id)).orderBy(desc(dataIncidents.detectedAt)).limit(100);
  const now = new Date();
  return {
    canProcess: isProcessor(ctx), canReport,
    items: r.map(({ i, centerCode, byName }) => ({
      ...i, centerCode, byName, severityLabel: INCIDENT_SEVERITY_VI[i.severity as IncidentSeverity], statusLabel: INCIDENT_STATUS_VI[i.status as IncidentStatus],
      notifyOverdue: i.status !== "closed" && i.severity !== "low" && !i.notifiedAuthorityAt && i.notifyDueAt < now,
    })),
  };
}

export async function reportIncident(ctx: ProtectedContext, input: { title: string; description: string; severity: IncidentSeverity; detectedAt: string; affectedCount: number; dataTypes?: string | null; centerId?: string | null }) {
  const centerId = input.centerId ?? null;
  if (!authorize(ctx.actor, "compliance:create", { centerId }).allowed) throw forbid("Không có quyền báo cáo sự cố");
  if (!centerId && !authorizeGlobal(ctx.actor, "compliance:create")) throw bad("Chọn cơ sở xảy ra sự cố");
  const detectedAt = new Date(input.detectedAt);
  if (Number.isNaN(detectedAt.getTime())) throw bad("Thời điểm phát hiện không hợp lệ");
  const errs = validateIncident({ ...input, detectedAt, now: new Date() });
  if (errs.length) throw bad(errs);
  const y = Number(todayISO().slice(0, 4));
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(dataIncidents).where(sql`${dataIncidents.code} like ${`SC-DL${String(y).slice(-2)}-%`}`);
  const code = incidentCode(y, (c?.n ?? 0) + 1);
  const [r] = await ctx.db.insert(dataIncidents).values({
    code, title: input.title.trim(), description: input.description.trim(), severity: input.severity, centerId, dataTypes: input.dataTypes?.trim() || null,
    affectedCount: input.affectedCount, detectedAt, notifyDueAt: incidentNotifyDue(detectedAt), reportedBy: ctx.user.id,
  }).returning({ id: dataIncidents.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "compliance", entity: "data_incidents", entityId: r!.id, after: { code, severity: input.severity, affectedCount: input.affectedCount }, ip: ctx.ip });
  return { id: r!.id, code, notifyDueAt: incidentNotifyDue(detectedAt) };
}

export async function updateIncident(ctx: ProtectedContext, input: { id: string; action: "contain" | "notify_authority" | "notify_subjects" | "close"; containment?: string | null; noNotifyReason?: string | null }) {
  if (!isProcessor(ctx)) throw forbid("Chỉ người phụ trách bảo vệ dữ liệu xử lý sự cố");
  const i = await ctx.db.query.dataIncidents.findFirst({ where: eq(dataIncidents.id, input.id) });
  if (!i) throw notFound("Không tìm thấy sự cố");
  if (i.status === "closed") throw pre("Sự cố đã đóng");
  const now = new Date();
  const containment = input.containment?.trim() || i.containment;
  const set: Partial<typeof dataIncidents.$inferInsert> = { handledBy: ctx.user.id, containment };
  if (input.action === "contain") {
    if (!containment || containment.length < 10) throw bad("Ghi biện pháp khoanh vùng / khắc phục (≥ 10 ký tự)");
    set.status = "contained";
  } else if (input.action === "notify_authority") {
    if (i.notifiedAuthorityAt) throw pre("Đã ghi nhận thông báo cơ quan chuyên trách");
    set.notifiedAuthorityAt = now;
  } else if (input.action === "notify_subjects") {
    if (i.notifiedSubjectsAt) throw pre("Đã ghi nhận thông báo người bị ảnh hưởng");
    set.notifiedSubjectsAt = now;
  } else {
    const noNotifyReason = input.noNotifyReason?.trim() || i.noNotifyReason;
    const errs = incidentCloseCheck({ severity: i.severity as IncidentSeverity, notifiedAuthorityAt: i.notifiedAuthorityAt, containment, noNotifyReason });
    if (errs.length) throw pre(errs);
    Object.assign(set, { status: "closed", closedAt: now, noNotifyReason });
  }
  await ctx.db.update(dataIncidents).set(set).where(eq(dataIncidents.id, i.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "compliance", entity: "data_incidents", entityId: i.id, before: { status: i.status }, after: { action: input.action, status: set.status ?? i.status, lateNotify: input.action === "notify_authority" && now > i.notifyDueAt }, ip: ctx.ip });
  return { status: set.status ?? i.status, late: input.action === "notify_authority" ? now > i.notifyDueAt : null };
}
