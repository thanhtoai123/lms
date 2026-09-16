import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, asc, desc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessionMedia, sessions, classes, enrollments, students, studentGuardians, parents, users, centers, parentNotifications } from "@satarobo/db";
import { consentCheck, isMediaOverdue, mediaObjectKey, MEDIA_MAX_BYTES, MEDIA_MIME, visibleCenterIds, type MediaMime } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { putObject, deleteObject, signedMediaUrl } from "../storage";

type Db = ProtectedContext["db"];
export type MediaStatus = "pending" | "approved" | "rejected";

function scope(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  return v === null ? sql`true` : v.length ? inArray(classes.centerId, v) : sql`false`;
}

async function loadSession(ctx: ProtectedContext, sessionId: string) {
  const [s] = await ctx.db
    .select({ id: sessions.id, classId: sessions.classId, date: sessions.date, status: sessions.status, teacherId: sessions.teacherId, centerId: classes.centerId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId)).where(eq(sessions.id, sessionId)).limit(1);
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi học" });
  return { ...s, ownerIds: [s.teacherId, s.leadTeacherId, s.assistantTeacherId].filter((x): x is string => !!x) };
}

/** Lưu tệp + ghi bản ghi "chờ duyệt". Gọi từ route upload (multipart) sau khi đã tạo context. */
export async function registerUploadedMedia(ctx: ProtectedContext, input: { sessionId: string; mime: string; bytes: Uint8Array; caption?: string | null; taggedStudentIds?: string[] }) {
  const s = await loadSession(ctx, input.sessionId);
  requirePermission(ctx, "media:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (!MEDIA_MIME.includes(input.mime as MediaMime)) throw new TRPCError({ code: "BAD_REQUEST", message: "Chỉ nhận ảnh JPG, PNG, WEBP" });
  if (input.bytes.byteLength > MEDIA_MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Ảnh tối đa 10MB" });
  const tagged = [...new Set(input.taggedStudentIds ?? [])];
  if (tagged.length) {
    const inClass = await ctx.db.select({ id: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, s.classId), inArray(enrollments.studentId, tagged)));
    if (inClass.length !== tagged.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Có học viên được gắn không thuộc lớp" });
  }
  const id = randomUUID();
  const key = mediaObjectKey(s.classId, s.id, id, input.mime as MediaMime);
  await putObject(key, input.bytes);
  const [row] = await ctx.db.insert(sessionMedia).values({ id, sessionId: s.id, objectKey: key, caption: input.caption ?? null, taggedStudentIds: tagged, uploadedBy: ctx.user.id, mimeType: input.mime, sizeBytes: input.bytes.byteLength }).returning();
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
  const conds = [scope(ctx)];
  if (input.classId) conds.push(eq(sessions.classId, input.classId));
  if (input.sessionId) conds.push(eq(sessionMedia.sessionId, input.sessionId));
  if (input.status) conds.push(eq(sessionMedia.status, input.status));
  const rows = await ctx.db
    .select({
      id: sessionMedia.id, objectKey: sessionMedia.objectKey, caption: sessionMedia.caption, status: sessionMedia.status, taggedStudentIds: sessionMedia.taggedStudentIds,
      rejectReason: sessionMedia.rejectReason, createdAt: sessionMedia.createdAt, reviewedAt: sessionMedia.reviewedAt,
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
  const allTagged = [...new Set(rows.flatMap((r) => r.taggedStudentIds))];
  const [consent, names] = await Promise.all([
    consentMap(ctx.db, allTagged),
    allTagged.length ? ctx.db.select({ id: students.id, fullName: students.fullName }).from(students).where(inArray(students.id, allTagged)) : Promise.resolve([]),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.fullName]));
  const now = new Date();
  return rows.map((r) => {
    const c = consentCheck(r.taggedStudentIds, consent);
    return {
      ...r,
      url: signedMediaUrl(r.objectKey),
      tagged: r.taggedStudentIds.map((id) => ({ id, name: nameOf.get(id) ?? "?", consent: consent.get(id) === true })),
      consentOk: c.ok,
      overdue: r.status === "pending" && isMediaOverdue(r.createdAt, now),
    };
  });
}

/** Màn "Duyệt ảnh": nhóm ảnh chờ theo ngày buổi học → lớp */
export async function pendingReviewByDay(ctx: ProtectedContext) {
  requirePermission(ctx, "media:update", {});
  const rows = await ctx.db
    .select({
      date: sessions.date, classId: classes.id, classCode: classes.code, className: classes.name, centerCode: centers.code, sessionId: sessions.id, sequenceNo: sessions.sequenceNo,
      n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${sessionMedia.createdAt})`,
    })
    .from(sessionMedia)
    .innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(eq(sessionMedia.status, "pending"), scope(ctx)))
    .groupBy(sessions.date, classes.id, classes.code, classes.name, centers.code, sessions.id, sessions.sequenceNo)
    .orderBy(desc(sessions.date), asc(classes.code));
  const now = new Date();
  const days = new Map<string, { date: string; classes: typeof rows; photos: number; overdue: boolean }>();
  for (const r of rows) {
    const d = days.get(r.date) ?? { date: r.date, classes: [], photos: 0, overdue: false };
    d.classes.push(r);
    d.photos += r.n;
    d.overdue ||= isMediaOverdue(new Date(r.oldest), now);
    days.set(r.date, d);
  }
  return [...days.values()];
}

async function loadMedia(ctx: ProtectedContext, id: string) {
  const [m] = await ctx.db
    .select({ media: sessionMedia, centerId: classes.centerId, classId: classes.id, className: classes.name, sequenceNo: sessions.sequenceNo, ownerTeacher: sessions.teacherId })
    .from(sessionMedia).innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId)).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(eq(sessionMedia.id, id)).limit(1);
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy ảnh" });
  return m;
}

/** Duyệt/từ chối nhiều ảnh. Duyệt bị chặn nếu có HV trong ảnh chưa được PH đồng ý đăng ảnh. */
export async function reviewMedia(ctx: ProtectedContext, input: { ids: string[]; action: "approve" | "reject"; reason?: string }) {
  if (input.action === "reject" && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do từ chối" });
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const id of input.ids) {
    const m = await loadMedia(ctx, id);
    requirePermission(ctx, "media:update", { centerId: m.centerId });
    if (m.media.status !== "pending" && !(input.action === "reject" && m.media.status === "approved")) {
      results.push({ id, ok: false, message: "Ảnh không ở trạng thái chờ duyệt" });
      continue;
    }
    if (input.action === "approve") {
      const c = consentCheck(m.media.taggedStudentIds, await consentMap(ctx.db, m.media.taggedStudentIds));
      if (!c.ok) {
        results.push({ id, ok: false, message: `${c.blocked.length} học viên trong ảnh chưa có đồng ý đăng ảnh của PH — bỏ gắn hoặc từ chối` });
        continue;
      }
    }
    await ctx.db.transaction(async (tx) => {
      const status = input.action === "approve" ? "approved" : "rejected";
      await tx.update(sessionMedia).set({ status, reviewedBy: ctx.user.id, reviewedAt: new Date(), rejectReason: input.action === "reject" ? input.reason! : null, updatedAt: new Date() }).where(eq(sessionMedia.id, id));
      if (status === "approved" && m.media.taggedStudentIds.length) {
        const guardians = await tx.select({ parentId: studentGuardians.parentId, studentId: studentGuardians.studentId }).from(studentGuardians).where(inArray(studentGuardians.studentId, m.media.taggedStudentIds));
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

export async function updateMediaTags(ctx: ProtectedContext, input: { id: string; taggedStudentIds: string[]; caption?: string | null }) {
  const m = await loadMedia(ctx, input.id);
  requirePermission(ctx, "media:update", { centerId: m.centerId });
  if (m.media.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chỉ sửa được ảnh đang chờ duyệt" });
  const tagged = [...new Set(input.taggedStudentIds)];
  if (tagged.length) {
    const inClass = await ctx.db.select({ id: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, m.classId), inArray(enrollments.studentId, tagged)));
    if (inClass.length !== tagged.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Có học viên được gắn không thuộc lớp" });
  }
  await ctx.db.update(sessionMedia).set({ taggedStudentIds: tagged, ...(input.caption !== undefined ? { caption: input.caption } : {}), updatedAt: new Date() }).where(eq(sessionMedia.id, input.id));
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
  return { sessions: ss, roster: roster.map((r) => ({ ...r, consent: consent.get(r.id) === true })) };
}
