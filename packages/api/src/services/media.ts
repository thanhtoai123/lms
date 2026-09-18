import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql, asc, desc, isNull, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessionMedia, sessions, classes, enrollments, students, studentGuardians, parents, users, centers, parentNotifications } from "@satarobo/db";
import {
  addDays, authorize, consentCheck, canRestoreRejected, canSubmitMedia, isMediaOverdue, mediaAudience, mediaObjectKey, restoreDeadline,
  MEDIA_MAX_BYTES, MEDIA_MIME, MEDIA_RESTORE_DAYS, visibleCenterIds, checkImageUpload, type MediaMime, type MediaStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { putObject, deleteObject, signedMediaUrl } from "../storage";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
export type { MediaStatus };

function scope(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  // Cách ly trung tâm (tenant) suy qua cơ sở của dòng — đứng trước mọi luật phạm vi cơ sở
  const tenant = tenantCond(ctx, classes);
  return and(v === null ? sql`true` : v.length ? inArray(classes.centerId, v) : sql`false`, tenant)!;
}

async function loadSession(ctx: ProtectedContext, sessionId: string) {
  const [s] = await ctx.db
    .select({ id: sessions.id, classId: sessions.classId, date: sessions.date, status: sessions.status, teacherId: sessions.teacherId, noMediaAt: sessions.noMediaAt, centerId: classes.centerId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId)).where(eq(sessions.id, sessionId)).limit(1);
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi học" });
  return { ...s, ownerIds: [s.teacherId, s.leadTeacherId, s.assistantTeacherId].filter((x): x is string => !!x) };
}

/** Học viên đang học của lớp — dùng cho ảnh chung cả lớp (consent + thông báo PH) */
async function classRoster(db: Db, classId: string): Promise<string[]> {
  const rows = await db.select({ id: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["active", "trial"])));
  return [...new Set(rows.map((r) => r.id))];
}

/**
 * Lưu tệp + ghi bản ghi vào **kho của lớp** (phụ huynh chưa thấy).
 * Gọi từ route upload (multipart) sau khi đã tạo context. GV gửi duyệt ở bước sau.
 */
export async function registerUploadedMedia(
  ctx: ProtectedContext,
  input: { sessionId: string; mime: string; bytes: Uint8Array; caption?: string | null; taggedStudentIds?: string[]; takenAt?: string | null; isClassWide?: boolean },
) {
  const s = await loadSession(ctx, input.sessionId);
  requirePermission(ctx, "media:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  // Không tin Content-Type do máy khách khai báo: soi magic bytes để tệp "ảnh" không phải là SVG/HTML có mã kịch bản
  const check = checkImageUpload({ mime: input.mime, bytes: input.bytes, maxBytes: MEDIA_MAX_BYTES, allowedMimes: MEDIA_MIME });
  if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.error! });
  const tagged = [...new Set(input.taggedStudentIds ?? [])];
  if (tagged.length) {
    const inClass = await ctx.db.select({ id: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, s.classId), inArray(enrollments.studentId, tagged)));
    if (inClass.length !== tagged.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Có học viên được gắn không thuộc lớp" });
  }
  const id = randomUUID();
  const key = mediaObjectKey(s.classId, s.id, id, input.mime as MediaMime);
  await putObject(key, input.bytes);
  const [row] = await ctx.db
    .insert(sessionMedia)
    .values({
      id, sessionId: s.id, objectKey: key, status: "library", caption: input.caption ?? null, taggedStudentIds: tagged,
      takenAt: input.takenAt ?? s.date, isClassWide: input.isClassWide ?? false,
      uploadedBy: ctx.user.id, mimeType: input.mime, sizeBytes: input.bytes.byteLength,
    })
    .returning();
  return row!;
}

async function consentMap(db: Db, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, boolean>();
  const rows = await db
    .select({ studentId: studentGuardians.studentId, consent: sql<boolean>`bool_or(${parents.mediaConsent})` })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(inArray(studentGuardians.studentId, studentIds)).groupBy(studentGuardians.studentId);
  return new Map(rows.map((r) => [r.studentId, !!r.consent]));
}

export async function listMedia(ctx: ProtectedContext, input: { classId?: string; sessionId?: string; status?: MediaStatus; limit?: number }) {
  requirePermission(ctx, "media:read", {});
  const conds = [scope(ctx), tenantCond(ctx, sessionMedia)];
  if (input.classId) conds.push(eq(sessions.classId, input.classId));
  if (input.sessionId) conds.push(eq(sessionMedia.sessionId, input.sessionId));
  if (input.status) conds.push(eq(sessionMedia.status, input.status));
  const rows = await ctx.db
    .select({
      id: sessionMedia.id, objectKey: sessionMedia.objectKey, caption: sessionMedia.caption, status: sessionMedia.status, taggedStudentIds: sessionMedia.taggedStudentIds,
      isClassWide: sessionMedia.isClassWide, takenAt: sessionMedia.takenAt,
      rejectReason: sessionMedia.rejectReason, rejectedAt: sessionMedia.rejectedAt, createdAt: sessionMedia.createdAt, submittedAt: sessionMedia.submittedAt, reviewedAt: sessionMedia.reviewedAt,
      sessionId: sessions.id, sessionDate: sessions.date, sequenceNo: sessions.sequenceNo, classId: classes.id, classCode: classes.code, className: classes.name,
      uploaderName: users.fullName,
    })
    .from(sessionMedia)
    .innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .leftJoin(users, eq(users.id, sessionMedia.uploadedBy))
    .where(and(...conds))
    .orderBy(desc(sessionMedia.createdAt))
    .limit(input.limit ?? 120);

  // Ảnh chung cả lớp: người xuất hiện là toàn bộ HV đang học của lớp
  const classIds = [...new Set(rows.filter((r) => r.isClassWide).map((r) => r.classId))];
  const rosters = new Map<string, string[]>();
  for (const cid of classIds) rosters.set(cid, await classRoster(ctx.db, cid));
  const audienceOf = (r: (typeof rows)[number]) => mediaAudience(r, rosters.get(r.classId) ?? []);

  const allIds = [...new Set(rows.flatMap((r) => audienceOf(r)))];
  const [consent, names] = await Promise.all([
    consentMap(ctx.db, allIds),
    allIds.length ? ctx.db.select({ id: students.id, fullName: students.fullName }).from(students).where(inArray(students.id, allIds)) : Promise.resolve([]),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.fullName]));
  const now = new Date();
  return rows.map((r) => {
    const audience = audienceOf(r);
    const c = consentCheck(audience, consent);
    return {
      ...r,
      url: signedMediaUrl(r.objectKey),
      tagged: r.taggedStudentIds.map((id) => ({ id, name: nameOf.get(id) ?? "?", consent: consent.get(id) === true })),
      audienceCount: audience.length,
      noConsentNames: c.blocked.map((id) => nameOf.get(id) ?? "?"),
      consentOk: c.ok,
      overdue: r.status === "pending" && isMediaOverdue(r.submittedAt ?? r.createdAt, now),
      canRestore: r.status === "rejected" && canRestoreRejected(r.rejectedAt, now),
      restoreUntil: r.rejectedAt ? restoreDeadline(r.rejectedAt) : null,
    };
  });
}

/**
 * Màn "Duyệt ảnh": gom theo ngày buổi học → lớp.
 * Gồm cả buổi đã qua **chưa có ảnh nào** và chưa ghi nhận "không có ảnh" để giáo vụ xử lý dứt điểm.
 */
export async function pendingReviewByDay(ctx: ProtectedContext, input: { missingDays?: number } = {}) {
  requirePermission(ctx, "media:update", {});
  const today = todayISO();
  const from = addDays(today, -(input.missingDays ?? 14));
  const [pending, missing] = await Promise.all([
    ctx.db
      .select({
        date: sessions.date, classId: classes.id, classCode: classes.code, className: classes.name, centerCode: centers.code, sessionId: sessions.id, sequenceNo: sessions.sequenceNo,
        n: sql<number>`count(*)::int`, oldest: sql<Date>`min(coalesce(${sessionMedia.submittedAt}, ${sessionMedia.createdAt}))`,
      })
      .from(sessionMedia)
      .innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .innerJoin(centers, eq(centers.id, classes.centerId))
      .where(and(eq(sessionMedia.status, "pending"), scope(ctx)))
      .groupBy(sessions.date, classes.id, classes.code, classes.name, centers.code, sessions.id, sessions.sequenceNo)
      .orderBy(desc(sessions.date), asc(classes.code)),
    ctx.db
      .select({
        date: sessions.date, classId: classes.id, classCode: classes.code, className: classes.name, centerCode: centers.code, sessionId: sessions.id, sequenceNo: sessions.sequenceNo,
      })
      .from(sessions)
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .innerJoin(centers, eq(centers.id, classes.centerId))
      .where(and(
        lt(sessions.date, today),
        gte(sessions.date, from),
        sql`${sessions.status} not in ('cancelled','rescheduled')`,
        isNull(sessions.noMediaAt),
        isNull(classes.deletedAt),
        sql`not exists (select 1 from ${sessionMedia} m where m.session_id = ${sessions.id} and m.status <> 'rejected')`,
        scope(ctx),
      ))
      .orderBy(desc(sessions.date), asc(classes.code))
      .limit(200),
  ]);

  const now = new Date();
  type Row = (typeof pending)[number] & { kind: "pending" | "missing"; overdue: boolean };
  const rows: Row[] = [
    ...pending.map((r) => ({ ...r, kind: "pending" as const, overdue: isMediaOverdue(new Date(r.oldest), now) })),
    ...missing.map((r) => ({ ...r, n: 0, oldest: null as unknown as Date, kind: "missing" as const, overdue: true })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.classCode.localeCompare(b.classCode));

  const days = new Map<string, { date: string; classes: Row[]; photos: number; missing: number; overdue: boolean }>();
  for (const r of rows) {
    const d = days.get(r.date) ?? { date: r.date, classes: [], photos: 0, missing: 0, overdue: false };
    d.classes.push(r);
    d.photos += r.n;
    if (r.kind === "missing") d.missing += 1;
    d.overdue ||= r.overdue;
    days.set(r.date, d);
  }
  return [...days.values()];
}

async function loadMedia(ctx: ProtectedContext, id: string) {
  const [m] = await ctx.db
    .select({ media: sessionMedia, centerId: classes.centerId, classId: classes.id, className: classes.name, sequenceNo: sessions.sequenceNo, sessionId: sessions.id, ownerTeacher: sessions.teacherId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId })
    .from(sessionMedia).innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId)).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(eq(sessionMedia.id, id)).limit(1);
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy ảnh" });
  return { ...m, ownerIds: [m.ownerTeacher, m.leadTeacherId, m.assistantTeacherId].filter((x): x is string => !!x) };
}

/** GV gửi ảnh trong kho đi duyệt: library → pending (mốc SLA tính từ đây) */
export async function submitMedia(ctx: ProtectedContext, input: { ids: string[] }) {
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const id of input.ids) {
    const m = await loadMedia(ctx, id);
    requirePermission(ctx, "media:write", { centerId: m.centerId, ownerIds: m.ownerIds });
    const chk = canSubmitMedia({ status: m.media.status, isClassWide: m.media.isClassWide, taggedStudentIds: m.media.taggedStudentIds });
    if (!chk.ok) {
      results.push({ id, ok: false, message: chk.error! });
      continue;
    }
    await ctx.db.transaction(async (tx) => {
      await tx.update(sessionMedia).set({ status: "pending", submittedAt: new Date(), submittedBy: ctx.user.id, updatedAt: new Date() }).where(eq(sessionMedia.id, id));
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "media", entity: "session_media", entityId: id, before: { status: m.media.status }, after: { status: "pending" }, ip: ctx.ip });
    });
    results.push({ id, ok: true, message: "Đã gửi duyệt" });
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

/** Khôi phục ảnh đã bị loại (trong 7 ngày): rejected → pending, SLA duyệt tính lại */
export async function restoreMedia(ctx: ProtectedContext, input: { ids: string[] }) {
  const results: { id: string; ok: boolean; message: string }[] = [];
  const now = new Date();
  for (const id of input.ids) {
    const m = await loadMedia(ctx, id);
    requirePermission(ctx, "media:update", { centerId: m.centerId });
    if (m.media.status !== "rejected") {
      results.push({ id, ok: false, message: "Chỉ khôi phục được ảnh đã bị loại" });
      continue;
    }
    if (!canRestoreRejected(m.media.rejectedAt, now)) {
      results.push({ id, ok: false, message: `Quá ${MEDIA_RESTORE_DAYS} ngày kể từ khi loại — không khôi phục được` });
      continue;
    }
    await ctx.db.transaction(async (tx) => {
      await tx.update(sessionMedia).set({ status: "pending", rejectedAt: null, rejectReason: null, reviewedBy: null, reviewedAt: null, submittedAt: now, submittedBy: ctx.user.id, updatedAt: now }).where(eq(sessionMedia.id, id));
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "media", entity: "session_media", entityId: id, before: { status: "rejected", rejectReason: m.media.rejectReason }, after: { status: "pending" }, reason: "Khôi phục ảnh đã loại", ip: ctx.ip });
    });
    results.push({ id, ok: true, message: "Đã khôi phục về chờ duyệt" });
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

/** Ghi nhận "Buổi này không có ảnh" — buổi coi như đã xử lý ảnh, hết cảnh báo quá hạn */
export async function markSessionNoMedia(ctx: ProtectedContext, input: { sessionId: string; value?: boolean }) {
  const s = await loadSession(ctx, input.sessionId);
  requirePermission(ctx, "media:update", { centerId: s.centerId });
  const on = input.value ?? true;
  if (on) {
    const [has] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessionMedia).where(and(eq(sessionMedia.sessionId, s.id), sql`${sessionMedia.status} <> 'rejected'`));
    if ((has?.n ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi này đang có ảnh — xử lý ảnh trước" });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.update(sessions).set({ noMediaAt: on ? new Date() : null, noMediaBy: on ? ctx.user.id : null }).where(eq(sessions.id, s.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "media", entity: "sessions", entityId: s.id, after: { noMedia: on }, reason: on ? "Buổi này không có ảnh" : "Bỏ ghi nhận không có ảnh", ip: ctx.ip });
  });
  return { ok: true, noMedia: on };
}

/** Duyệt/từ chối nhiều ảnh. Duyệt bị chặn nếu có HV trong ảnh chưa được PH đồng ý đăng ảnh. */
export async function reviewMedia(ctx: ProtectedContext, input: { ids: string[]; action: "approve" | "reject"; reason?: string }) {
  if (input.action === "reject" && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do từ chối" });
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const id of input.ids) {
    const m = await loadMedia(ctx, id);
    requirePermission(ctx, "media:update", { centerId: m.centerId });
    if (m.media.status === "library") {
      results.push({ id, ok: false, message: "Ảnh còn trong kho của lớp — giáo viên chưa gửi duyệt" });
      continue;
    }
    if (m.media.status !== "pending" && !(input.action === "reject" && m.media.status === "approved")) {
      results.push({ id, ok: false, message: "Ảnh không ở trạng thái chờ duyệt" });
      continue;
    }
    const audience = mediaAudience(m.media, m.media.isClassWide ? await classRoster(ctx.db, m.classId) : []);
    if (input.action === "approve") {
      const c = consentCheck(audience, await consentMap(ctx.db, audience));
      if (!c.ok) {
        results.push({ id, ok: false, message: `${c.blocked.length} học viên trong ảnh chưa có đồng ý đăng ảnh của PH — bỏ gắn hoặc từ chối` });
        continue;
      }
    }
    await ctx.db.transaction(async (tx) => {
      const status = input.action === "approve" ? "approved" : "rejected";
      await tx.update(sessionMedia).set({
        status, reviewedBy: ctx.user.id, reviewedAt: new Date(),
        rejectedAt: input.action === "reject" ? new Date() : null,
        rejectReason: input.action === "reject" ? input.reason! : null, updatedAt: new Date(),
      }).where(eq(sessionMedia.id, id));
      if (status === "approved" && audience.length) {
        const guardians = await tx.select({ parentId: studentGuardians.parentId, studentId: studentGuardians.studentId }).from(studentGuardians).where(inArray(studentGuardians.studentId, audience));
        for (const g of guardians) {
          await tx.insert(parentNotifications).values({ parentId: g.parentId, studentId: g.studentId, channel: "in_app", template: "CLASS_PHOTO", title: `Ảnh buổi ${m.sequenceNo} · ${m.className}`, body: m.media.caption ?? "Trung tâm vừa chia sẻ ảnh buổi học của con", link: `/parent/photos`, params: { mediaId: id }, status: "sent", sentAt: new Date() });
        }
      }
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "media", entity: "session_media", entityId: id, before: { status: m.media.status }, after: { status }, reason: input.reason ?? null, ip: ctx.ip });
    });
    results.push({ id, ok: true, message: input.action === "approve" ? "Đã duyệt" : "Đã từ chối" });
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

/** Sửa chú thích / ngày chụp / gắn thẻ HV / cờ ảnh chung — chỉ khi ảnh còn trong kho hoặc đang chờ duyệt */
export async function updateMediaTags(
  ctx: ProtectedContext,
  input: { id: string; taggedStudentIds?: string[]; caption?: string | null; takenAt?: string | null; isClassWide?: boolean },
) {
  const m = await loadMedia(ctx, input.id);
  // Giáo vụ sửa được mọi ảnh trong cơ sở; giáo viên sửa ảnh lớp mình (quyền media:write_own)
  if (!authorize(ctx.actor, "media:update", { centerId: m.centerId }).allowed) requirePermission(ctx, "media:write", { centerId: m.centerId, ownerIds: m.ownerIds });
  if (m.media.status !== "pending" && m.media.status !== "library") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chỉ sửa được ảnh trong kho hoặc đang chờ duyệt" });
  const tagged = input.taggedStudentIds ? [...new Set(input.taggedStudentIds)] : null;
  if (tagged?.length) {
    const inClass = await ctx.db.select({ id: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, m.classId), inArray(enrollments.studentId, tagged)));
    if (inClass.length !== tagged.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Có học viên được gắn không thuộc lớp" });
  }
  // Gắn thẻ học viên vào ảnh là tạo LIÊN KẾT "khuôn mặt trẻ ↔ hồ sơ": đổi ai được gắn trong ảnh
  // là đổi dữ liệu cá nhân của trẻ, nên phải có nhật ký, ghi cùng transaction với thay đổi.
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(sessionMedia).set({
      ...(tagged ? { taggedStudentIds: tagged } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.takenAt !== undefined ? { takenAt: input.takenAt } : {}),
      ...(input.isClassWide !== undefined ? { isClassWide: input.isClassWide } : {}),
      updatedAt: new Date(),
    }).where(eq(sessionMedia.id, input.id));
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "media", entity: "session_media", entityId: input.id,
      before: { taggedStudentIds: m.media.taggedStudentIds, isClassWide: m.media.isClassWide },
      after: { ...(tagged ? { taggedStudentIds: tagged } : {}), ...(input.isClassWide !== undefined ? { isClassWide: input.isClassWide } : {}) },
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

export async function deleteMedia(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const m = await loadMedia(ctx, input.id);
  requirePermission(ctx, "media:delete", { centerId: m.centerId });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(sessionMedia).where(eq(sessionMedia.id, input.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "media", entity: "session_media", entityId: input.id, before: { objectKey: m.media.objectKey, status: m.media.status }, reason: input.reason, ip: ctx.ip });
  });
  await deleteObject(m.media.objectKey);
  return { ok: true };
}

/** Buổi học gần đây của lớp + danh sách HV để gắn khi đăng ảnh */
export async function uploadContext(ctx: ProtectedContext, classId: string) {
  const cls = await ctx.db.query.classes.findFirst({ where: and(eq(classes.id, classId), isNull(classes.deletedAt)) });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "media:read", { centerId: cls.centerId, ownerIds: [cls.leadTeacherId ?? "", cls.assistantTeacherId ?? ""].filter(Boolean) });
  const [ss, roster] = await Promise.all([
    ctx.db.select({ id: sessions.id, sequenceNo: sessions.sequenceNo, date: sessions.date, status: sessions.status }).from(sessions)
      .where(and(eq(sessions.classId, classId), sql`${sessions.date} <= current_date + 1`, sql`${sessions.status} not in ('cancelled','rescheduled')`))
      .orderBy(desc(sessions.date)).limit(20),
    ctx.db.select({ id: students.id, fullName: students.fullName }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["active", "trial"]))).orderBy(asc(students.fullName)),
  ]);
  const consent = await consentMap(ctx.db, roster.map((r) => r.id));
  const [counts] = await ctx.db
    .select({
      library: sql<number>`count(*) filter (where ${sessionMedia.status} = 'library')::int`,
      pending: sql<number>`count(*) filter (where ${sessionMedia.status} = 'pending')::int`,
      approved: sql<number>`count(*) filter (where ${sessionMedia.status} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${sessionMedia.status} = 'rejected')::int`,
    })
    .from(sessionMedia).innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId))
    .where(eq(sessions.classId, classId));
  return {
    sessions: ss,
    roster: roster.map((r) => ({ ...r, consent: consent.get(r.id) === true })),
    counts: counts ?? { library: 0, pending: 0, approved: 0, rejected: 0 },
  };
}
