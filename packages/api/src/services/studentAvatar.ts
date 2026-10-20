/**
 * ẢNH ĐẠI DIỆN HỌC VIÊN (quy tắc: packages/core/src/people/avatar.ts).
 *
 *  - Nhân sự: cần quyền `student:update` ở cơ sở của học viên.
 *  - Phụ huynh: chỉ cho CON của chính mình (lấy theo phiên, qua `familyChildren`) — đổi là hiện ngay, không chờ duyệt.
 *  - Mỗi lần đổi một khoá tệp mới; tệp cũ bị xoá. Mọi thay đổi ghi nhật ký (không ghi nội dung ảnh).
 *  - URL ảnh: `studentAvatarUrl(key)` — có chữ ký, hết hạn sau `AVATAR_URL_TTL`.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { students, type Database } from "@satarobo/db";
import { STUDENT_AVATAR_MIME, avatarFormatError, avatarObjectKey, stripJpegMetadata } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { putObject, deleteObject } from "../storage";
import { studentAvatarUrl } from "./avatarUrl";
import { writeAudit } from "./audit";
import { assertTenant } from "./tenantScope";
import { familyChildren } from "./parentHub";

type Db = ProtectedContext["db"];

export { studentAvatarUrl };

function prepare(input: { mime: string; bytes: Uint8Array }) {
  const why = avatarFormatError(input.mime, input.bytes);
  if (why) throw new TRPCError({ code: "BAD_REQUEST", message: why });
  const ext = STUDENT_AVATAR_MIME[input.mime]!;
  const bytes = ext === "jpg" ? stripJpegMetadata(input.bytes) : input.bytes;
  return { ext, bytes };
}

async function save(db: Db, studentId: string, oldKey: string | null, file: { ext: string; bytes: Uint8Array; mime: string }) {
  const key = avatarObjectKey(studentId, file.ext, randomUUID());
  await putObject(key, file.bytes, file.mime);
  await db.update(students).set({ avatarKey: key, updatedAt: new Date() }).where(eq(students.id, studentId));
  if (oldKey) await deleteObject(oldKey).catch(() => undefined);
  return key;
}

async function loadStudent(db: Db, id: string) {
  const s = await db.query.students.findFirst({ where: and(eq(students.id, id), isNull(students.deletedAt)), columns: { id: true, tenantId: true, homeCenterId: true, avatarKey: true } });
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  return s;
}

/** Nhân sự tải ảnh đại diện cho học viên */
export async function uploadStudentAvatar(ctx: ProtectedContext, input: { studentId: string; mime: string; bytes: Uint8Array }) {
  const s = await loadStudent(ctx.db, input.studentId);
  assertTenant(ctx, s, "Học viên");
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  const f = prepare(input);
  const key = await save(ctx.db, s.id, s.avatarKey, { ...f, mime: input.mime });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "student_avatar", entityId: s.id, after: { bytes: f.bytes.byteLength, mime: input.mime }, ip: ctx.ip, tenantId: s.tenantId });
  return { ok: true as const, url: studentAvatarUrl(key) };
}

/** Nhân sự gỡ ảnh đại diện */
export async function removeStudentAvatar(ctx: ProtectedContext, studentId: string) {
  const s = await loadStudent(ctx.db, studentId);
  assertTenant(ctx, s, "Học viên");
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  if (!s.avatarKey) return { ok: true as const, changed: false };
  await ctx.db.update(students).set({ avatarKey: null, updatedAt: new Date() }).where(eq(students.id, s.id));
  await deleteObject(s.avatarKey).catch(() => undefined);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "students", entity: "student_avatar", entityId: s.id, ip: ctx.ip, tenantId: s.tenantId });
  return { ok: true as const, changed: true };
}

export type ParentAvatarResult = { ok: true; url: string | null } | { ok: false; error: string };

/** Phụ huynh đổi ảnh đại diện của con (hiện ngay) */
export async function parentSetChildAvatar(db: Database, parentId: string, input: { studentId: string; mime: string; bytes: Uint8Array }, meta: { ip?: string | null } = {}): Promise<ParentAvatarResult> {
  const kid = (await familyChildren(db, parentId)).find((k) => k.id === input.studentId);
  if (!kid) return { ok: false, error: "Không tìm thấy hồ sơ của con" };
  const why = avatarFormatError(input.mime, input.bytes);
  if (why) return { ok: false, error: why };
  const d = db as unknown as Db;
  const s = await loadStudent(d, kid.id);
  const f = prepare(input);
  const key = await save(d, s.id, s.avatarKey, { ...f, mime: input.mime });
  await writeAudit(db, { actorId: null, action: "UPDATE", module: "students", entity: "student_avatar", entityId: s.id, after: { parentId, bytes: f.bytes.byteLength, by: "parent" }, ip: meta.ip ?? undefined, tenantId: s.tenantId });
  return { ok: true, url: studentAvatarUrl(key) };
}

/** Phụ huynh gỡ ảnh đại diện của con */
export async function parentRemoveChildAvatar(db: Database, parentId: string, studentId: string, meta: { ip?: string | null } = {}): Promise<ParentAvatarResult> {
  const kid = (await familyChildren(db, parentId)).find((k) => k.id === studentId);
  if (!kid) return { ok: false, error: "Không tìm thấy hồ sơ của con" };
  const d = db as unknown as Db;
  const s = await loadStudent(d, kid.id);
  if (s.avatarKey) {
    await d.update(students).set({ avatarKey: null, updatedAt: new Date() }).where(eq(students.id, s.id));
    await deleteObject(s.avatarKey).catch(() => undefined);
    await writeAudit(db, { actorId: null, action: "DELETE", module: "students", entity: "student_avatar", entityId: s.id, after: { parentId, by: "parent" }, ip: meta.ip ?? undefined, tenantId: s.tenantId });
  }
  return { ok: true, url: null };
}
