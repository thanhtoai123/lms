import { and, eq, inArray, sql, asc, desc, ilike, or, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  students, parents, parentPrivate, studentGuardians, studentPrivate, studentPauses, enrollments, classes, courses, centers, attendance, sessions, careTasks, enrollmentEvents, users,
} from "@satarobo/db";
import {
  authorize, buildStudentCode, hasRole, maskPhone, maskIdNumber, normalizeVnPhone, normalizeAllergies, normalizeNationalId, normalizeStudentCode,
  remainingSessions, summarize, visibleCenterIds, studentLifecycleActions, requireReason, batchRanges, clampPageSize,
  type AttendanceRecord, type BloodType, type GuardianRelation,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { encryptPii, decryptPii } from "./pii";
import { getOps } from "./opsSettings";
import { tenantCond, assertTenant, redact } from "./tenantScope";

type Db = ProtectedContext["db"];
const STUDENT_ID = sql.raw('"students"."id"');
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const nn = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Số buổi đã tiêu thụ của một ghi danh (có mặt, muộn, vắng không phép) — dùng chung cho mọi màn */
export const consumedSql = sql<number>`((select count(*)::int from ${attendance} a where a.enrollment_id = ${enrollments.id} and a.status in ('present','late','absent_unexcused')) + ${enrollments.carriedSessions})`;

export function canSeeFullPhone(ctx: ProtectedContext) {
  return hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "CENTER_CLASS_MANAGER", "HO_SALE");
}

/**
 * Phạm vi dữ liệu của một truy vấn: cơ sở được phép **và** trung tâm (tenant) được phép.
 * Dùng chung cho màn Học viên, Ghi danh và mọi truy vấn bắc cầu qua lớp.
 */
export function centerScope(ctx: ProtectedContext, col: typeof students.homeCenterId | typeof classes.centerId) {
  const visible = visibleCenterIds(ctx.actor);
  const byCenter = visible === null ? sql`true` : visible.length ? inArray(col, visible) : sql`false`;
  const byTenant = col === students.homeCenterId ? tenantCond(ctx, students) : tenantCond(ctx, classes);
  return and(byCenter, byTenant)!;
}

export const STUDENT_STATUSES = ["prospect", "trial", "active", "paused", "alumni", "withdrawn"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
const STUDENT_STATUS_VI: Record<StudentStatus, string> = {
  prospect: "Tiềm năng", trial: "Học thử", active: "Đang học", paused: "Bảo lưu", alumni: "Đã học xong", withdrawn: "Đã nghỉ",
};

export interface StudentListFilters { q?: string; centerId?: string; status?: StudentStatus; grade?: number }

/** Bộ lọc của màn Học viên — danh sách và nút "Xuất CSV (toàn bộ kết quả lọc)" dùng chung hàm này */
function studentFilterConds(ctx: ProtectedContext, input: StudentListFilters) {
  const conds = [isNull(students.deletedAt), centerScope(ctx, students.homeCenterId)];
  if (input.centerId) conds.push(eq(students.homeCenterId, input.centerId));
  if (input.status) conds.push(eq(students.status, input.status));
  if (input.grade) conds.push(eq(students.grade, input.grade));
  if (input.q) {
    const q = input.q.trim();
    const pn = normalizeVnPhone(q);
    conds.push(
      or(
        ilike(students.fullName, `%${q}%`),
        ilike(students.code, `%${q}%`),
        sql`exists (select 1 from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${STUDENT_ID} and p.full_name ilike ${`%${q}%`})`,
        pn ? or(eq(students.phone, pn), sql`exists (select 1 from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${STUDENT_ID} and p.phone = ${pn})`)! : sql`false`,
      )!,
    );
  }
  return conds;
}

export async function listStudents(ctx: ProtectedContext, input: { q?: string; centerId?: string; status?: StudentStatus; grade?: number; page?: number; pageSize?: number }) {
  requirePermission(ctx, "student:read", { centerId: input.centerId ?? null });
  const conds = studentFilterConds(ctx, input);
  const pageSize = clampPageSize(input.pageSize, 20, 100);
  const page = Math.max(1, input.page ?? 1);
  const where = and(...conds);
  const [total] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(students).where(where);
  const rows = await ctx.db
    .select({
      id: students.id, code: students.code, fullName: students.fullName, grade: students.grade, school: students.school, status: students.status,
      dateOfBirth: students.dateOfBirth, centerCode: centers.code, createdAt: students.createdAt, tenantId: students.tenantId,
      parentName: sql<string | null>`(select p.full_name from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      parentPhone: sql<string | null>`(select p.phone from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      classes: sql<string | null>`(select string_agg(c.code, ', ') from ${enrollments} e join ${classes} c on c.id = e.class_id where e.student_id = ${students.id} and e.status in ('trial','active','paused'))`,
    })
    .from(students)
    .leftJoin(centers, eq(centers.id, students.homeCenterId))
    .where(where)
    .orderBy(desc(students.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const full = canSeeFullPhone(ctx);
  // Che PII của học viên thuộc trung tâm khác (theo cấu hình quyền riêng tư của trung tâm đó)
  return { total: total?.n ?? 0, page, pageSize, items: rows.map((r) => redact(ctx, { ...r, parentPhone: r.parentPhone ? (full ? r.parentPhone : maskPhone(r.parentPhone)) : null })) };
}

/**
 * Xuất **toàn bộ kết quả lọc** của màn Học viên (không chỉ trang hiện tại) — tối đa 10.000 dòng,
 * SĐT phụ huynh che theo quyền.
 */
export const STUDENT_EXPORT_MAX_ROWS = 10_000;
export const STUDENT_EXPORT_HEADERS = ["Mã HV", "Họ tên", "Ngày sinh", "Khối", "Trường", "Cơ sở", "Trạng thái", "Phụ huynh", "SĐT phụ huynh", "Lớp đang học", "Ngày tạo"] as const;

/** Cỡ một lô khi xuất — mỗi dòng còn kéo theo 3 truy vấn con (phụ huynh, SĐT, lớp) */
const STUDENT_EXPORT_BATCH = 1_000;

/**
 * Đọc dữ liệu xuất THEO LÔ.
 * Trước: một câu `limit 10_000` — mỗi dòng chạy 3 truy vấn con, nên Postgres phải làm 30.000
 *        phép tra cứu trong MỘT câu lệnh; dễ chạm `statement_timeout` khi dữ liệu lớn.
 * Sau:  `count(*)` rồi đọc từng lô 1.000 dòng; thứ tự có khoá phụ `id` để các lô không chồng nhau.
 */
async function readStudentExportBatch(ctx: ProtectedContext, where: ReturnType<typeof and>, range: { offset: number; limit: number }) {
  return ctx.db
    .select({
      code: students.code, fullName: students.fullName, dateOfBirth: students.dateOfBirth, grade: students.grade, school: students.school,
      status: students.status, centerCode: centers.code, createdAt: students.createdAt,
      parentName: sql<string | null>`(select p.full_name from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      parentPhone: sql<string | null>`(select p.phone from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      classes: sql<string | null>`(select string_agg(c.code, ', ') from ${enrollments} e join ${classes} c on c.id = e.class_id where e.student_id = ${students.id} and e.status in ('trial','active','paused'))`,
    })
    .from(students)
    .leftJoin(centers, eq(centers.id, students.homeCenterId))
    .where(where)
    .orderBy(desc(students.createdAt), desc(students.id))
    .limit(range.limit)
    .offset(range.offset);
}

export async function exportStudents(ctx: ProtectedContext, input: StudentListFilters) {
  requirePermission(ctx, "student:read", { centerId: input.centerId ?? null });
  const where = and(...studentFilterConds(ctx, input));
  const [count] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(students).where(where);
  const rows: Awaited<ReturnType<typeof readStudentExportBatch>> = [];
  for (const range of batchRanges(Math.min(count?.n ?? 0, STUDENT_EXPORT_MAX_ROWS), STUDENT_EXPORT_BATCH)) {
    const batch = await readStudentExportBatch(ctx, where, range);
    rows.push(...batch);
    if (batch.length < range.limit) break;
  }
  const full = canSeeFullPhone(ctx);
  const fmtDay = (d: Date | string | null) => (d ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(d)) : "");
  const total = count?.n ?? rows.length;
  // Xuất hàng loạt hồ sơ trẻ em (tên, ngày sinh, trường, SĐT phụ huynh) là hành vi phải truy vết được
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: "PII_REVEAL", module: "students", entity: "students", entityId: null,
    after: { action: "export_csv", rows: rows.length, total, phoneMasked: !full, filters: { q: input.q ?? null, centerId: input.centerId ?? null, status: input.status ?? null, grade: input.grade ?? null } },
    ip: ctx.ip,
  });
  return {
    headers: [...STUDENT_EXPORT_HEADERS],
    rows: rows.map((r) => [
      r.code, r.fullName, fmtDay(r.dateOfBirth), r.grade ?? "", r.school ?? "", r.centerCode ?? "", STUDENT_STATUS_VI[r.status] ?? r.status,
      r.parentName ?? "", r.parentPhone ? (full ? r.parentPhone : maskPhone(r.parentPhone)) : "", r.classes ?? "", fmtDay(r.createdAt),
    ]),
    total,
    truncated: total > rows.length,
    limit: STUDENT_EXPORT_MAX_ROWS,
    piiMasked: !full,
  };
}

export async function getStudent(ctx: ProtectedContext, id: string) {
  const s = await ctx.db.query.students.findFirst({ where: and(eq(students.id, id), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  assertTenant(ctx, s, "Học viên");
  requirePermission(ctx, "student:read", { centerId: s.homeCenterId });
  const full = canSeeFullPhone(ctx);
  const canUpdate = authorize(ctx.actor, "student:update", { centerId: s.homeCenterId }).allowed;

  const [center, preferredCenter, guardians, enrs, care, priv, pauses] = await Promise.all([
    s.homeCenterId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, s.homeCenterId), columns: { id: true, code: true, name: true } }) : null,
    s.preferredCenterId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, s.preferredCenterId), columns: { id: true, code: true, name: true } }) : null,
    ctx.db
      .select({
        parentId: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email, relation: studentGuardians.relation, isPrimary: studentGuardians.isPrimary,
        accountStatus: parents.accountStatus, mediaConsent: parents.mediaConsent, nationalIdEnc: parentPrivate.nationalIdEnc,
      })
      .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).leftJoin(parentPrivate, eq(parentPrivate.parentId, parents.id))
      .where(eq(studentGuardians.studentId, id)).orderBy(desc(studentGuardians.isPrimary)),
    ctx.db
      .select({
        id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, startSequenceNo: enrollments.startSequenceNo,
        enrolledAt: enrollments.enrolledAt, endedAt: enrollments.endedAt, endReason: enrollments.endReason, pausedAt: enrollments.pausedAt, pauseUntil: enrollments.pauseUntil,
        classId: classes.id, classCode: classes.code, className: classes.name, courseCode: courses.code, centerCode: centers.code, consumed: consumedSql,
      })
      .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
      .where(eq(enrollments.studentId, id)).orderBy(desc(enrollments.enrolledAt)),
    ctx.db.select({ id: careTasks.id, title: careTasks.title, status: careTasks.status, dueAt: careTasks.dueAt, severity: careTasks.severity }).from(careTasks).where(eq(careTasks.studentId, id)).orderBy(desc(careTasks.createdAt)).limit(10),
    canUpdate ? ctx.db.query.studentPrivate.findFirst({ where: eq(studentPrivate.studentId, id) }) : null,
    ctx.db
      .select({ id: studentPauses.id, fromDate: studentPauses.fromDate, expectedReturn: studentPauses.expectedReturn, endedAt: studentPauses.endedAt, endKind: studentPauses.endKind, reason: studentPauses.reason, endNote: studentPauses.endNote, enrollmentIds: studentPauses.enrollmentIds, createdAt: studentPauses.createdAt, createdByName: users.fullName })
      .from(studentPauses).leftJoin(users, eq(users.id, studentPauses.createdBy))
      .where(eq(studentPauses.studentId, id)).orderBy(desc(studentPauses.createdAt)),
  ]);

  const ids = enrs.map((e) => e.id);
  const att = ids.length
    ? await ctx.db
        .select({ enrollmentId: attendance.enrollmentId, status: attendance.status, date: sessions.date, seq: sessions.sequenceNo, classCode: classes.code, remark: attendance.studentRemark })
        .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId)).innerJoin(classes, eq(classes.id, sessions.classId))
        .where(inArray(attendance.enrollmentId, ids)).orderBy(desc(sessions.date))
    : [];
  const events = ids.length
    ? await ctx.db.select().from(enrollmentEvents).where(inArray(enrollmentEvents.enrollmentId, ids)).orderBy(desc(enrollmentEvents.createdAt)).limit(50)
    : [];
  const ops = await getOps(ctx.db, s.homeCenterId);
  const openPause = pauses.find((p) => !p.endedAt) ?? null;
  const lifecycleState = {
    status: s.status,
    // chỉ ghi danh chính thức mới bảo lưu được (học thử thì cho nghỉ)
    studying: enrs.filter((e) => e.status === "active").length,
    paused: enrs.filter((e) => e.status === "paused").length,
    openPause: !!openPause,
  };
  const classOf = new Map(enrs.map((e) => [e.id, e.classCode]));

  // Hồ sơ của trung tâm khác: che PII nếu trung tâm đó không bật "Hội sở được xem dữ liệu cá nhân"
  return redact(ctx, {
    ...s,
    center: center ?? null,
    preferredCenter: preferredCenter ?? null,
    canUpdate,
    address: priv ? { address: priv.address, ward: priv.ward, district: priv.district, city: priv.city } : null,
    guardians: guardians.map(({ nationalIdEnc, ...g }) => ({
      ...g,
      phone: full ? g.phone : maskPhone(g.phone),
      hasNationalId: !!nationalIdEnc,
      nationalIdMasked: canUpdate && nationalIdEnc ? maskIdNumber(decryptPii(nationalIdEnc)) ?? "(không đọc được)" : null,
    })),
    enrollments: enrs.map((e) => {
      const recs: AttendanceRecord[] = att.filter((a) => a.enrollmentId === e.id).map((a) => ({ sessionDate: a.date, sequenceNo: a.seq, status: a.status }));
      return { ...e, remaining: remainingSessions(e.packageSessions, e.consumed), summary: summarize(recs) };
    }),
    recentAttendance: att.slice(0, 20),
    events,
    care,
    pauses: pauses.map((p) => ({ ...p, classCodes: (p.enrollmentIds ?? []).map((x) => classOf.get(x) ?? "?") })),
    lifecycle: { studying: lifecycleState.studying, paused: lifecycleState.paused, openPause, actions: canUpdate ? studentLifecycleActions(lifecycleState) : [], maxPauseMonths: ops.maxPauseMonths },
  }, s.tenantId);
}

export interface AddressInput { address?: string | null; ward?: string | null; district?: string | null; city?: string | null }

export interface StudentInput {
  fullName: string;
  nickname?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  grade?: number | null;
  school?: string | null;
  homeCenterId: string;
  healthNotes?: string | null;
  interests?: string | null;
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodType?: BloodType | null;
  allergies?: string[];
  preferredCenterId?: string | null;
  firstEnrolledOn?: string | null;
  /** Mã nhập tay; trống = tự sinh */
  code?: string | null;
  address?: AddressInput | null;
}

export interface GuardianInput {
  fullName: string;
  phone: string;
  email?: string | null;
  relation?: GuardianRelation;
  mediaConsent?: boolean;
  /** CCCD / CMND (9 hoặc 12 số) — lưu mã hoá; trống = giữ nguyên */
  nationalId?: string | null;
}

/** Chuẩn hoá các trường hồ sơ (SĐT, dị ứng, …) — lỗi rõ ràng cho người nhập */
function normalizeProfile(input: Partial<StudentInput>) {
  const out: Record<string, unknown> = {};
  const keys = ["fullName", "nickname", "dateOfBirth", "gender", "grade", "school", "homeCenterId", "healthNotes", "interests", "notes", "email", "bloodType", "preferredCenterId", "firstEnrolledOn"] as const;
  for (const k of keys) {
    const v = input[k];
    if (v !== undefined) out[k] = typeof v === "string" ? nn(v) : v;
  }
  if (typeof input.fullName === "string") out.fullName = input.fullName.trim();
  if (input.phone !== undefined) {
    if (!nn(input.phone)) out.phone = null;
    else {
      const p = normalizeVnPhone(input.phone!);
      if (!p) throw bad("Số điện thoại học viên không hợp lệ");
      out.phone = p;
    }
  }
  if (input.allergies !== undefined) out.allergies = normalizeAllergies(input.allergies);
  return out as Partial<typeof students.$inferInsert>;
}

async function assertCenter(db: Db, id: string | null | undefined, label: string) {
  if (!id) return null;
  const c = await db.query.centers.findFirst({ where: eq(centers.id, id) });
  if (!c) throw bad(`${label} không tồn tại`);
  return c;
}

/** Mã học viên nhập tay: kiểm tra định dạng + chưa dùng (kể cả hồ sơ đã xoá mềm) */
async function manualCode(db: Db, raw: string | null | undefined, excludeId?: string) {
  if (!nn(raw)) return null;
  const code = normalizeStudentCode(raw);
  if (!code) throw bad("Mã học viên chỉ gồm chữ in hoa, số, dấu chấm, gạch ngang (3–30 ký tự)");
  const dup = await db.query.students.findFirst({ where: excludeId ? and(eq(students.code, code), ne(students.id, excludeId)) : eq(students.code, code), columns: { id: true, fullName: true } });
  if (dup) throw new TRPCError({ code: "CONFLICT", message: `Mã ${code} đã dùng cho học viên ${dup.fullName}` });
  return code;
}

function uniqueViolation(e: unknown): never {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Mã học viên đã tồn tại — nhập mã khác hoặc để trống để hệ thống tự sinh" });
  throw e;
}

function checkGuardian(g: GuardianInput) {
  const phone = normalizeVnPhone(g.phone);
  if (!phone) throw bad(`Số điện thoại phụ huynh ${g.fullName} không hợp lệ`);
  const nationalId = nn(g.nationalId) ? normalizeNationalId(g.nationalId) : null;
  if (nn(g.nationalId) && !nationalId) throw bad("CCCD phụ huynh phải gồm 9 hoặc 12 chữ số");
  return { ...g, phone, nationalId };
}

async function saveAddress(db: Db, studentId: string, a: AddressInput | null | undefined, actorId: string) {
  if (a === undefined) return false;
  const v = { address: nn(a?.address), ward: nn(a?.ward), district: nn(a?.district), city: nn(a?.city) };
  await db.insert(studentPrivate).values({ studentId, ...v, updatedBy: actorId })
    .onConflictDoUpdate({ target: studentPrivate.studentId, set: { ...v, updatedBy: actorId, updatedAt: new Date() } });
  return true;
}

async function saveNationalId(db: Db, parentId: string, nationalId: string | null) {
  if (!nationalId) return false;
  const enc = encryptPii(nationalId);
  await db.insert(parentPrivate).values({ parentId, nationalIdEnc: enc })
    .onConflictDoUpdate({ target: parentPrivate.parentId, set: { nationalIdEnc: enc, updatedAt: new Date() } });
  return true;
}

export async function createStudent(ctx: ProtectedContext, input: StudentInput & { guardians: GuardianInput[] }) {
  requirePermission(ctx, "student:create", { centerId: input.homeCenterId });
  const center = await assertCenter(ctx.db, input.homeCenterId, "Cơ sở");
  await assertCenter(ctx.db, input.preferredCenterId, "Đơn vị mong muốn");
  const guardians = input.guardians.map(checkGuardian);
  if (new Set(guardians.map((g) => g.phone)).size !== guardians.length) throw bad("Hai phụ huynh không được trùng số điện thoại");
  const profile = normalizeProfile(input);
  const manual = await manualCode(ctx.db, input.code);

  try {
    return await ctx.db.transaction(async (tx) => {
      const code = manual ?? (await nextStudentCode(tx as unknown as Db, center!.code));
      const [st] = await tx.insert(students).values({ ...profile, fullName: input.fullName.trim(), homeCenterId: input.homeCenterId, code, status: "prospect" }).returning();
      await saveAddress(tx as unknown as Db, st!.id, input.address ?? undefined, ctx.user.id);
      let ids = 0;
      for (const [i, g] of guardians.entries()) {
        const parentId = await upsertParent(tx as unknown as Db, { fullName: g.fullName.trim(), phone: g.phone, email: nn(g.email), mediaConsent: !!g.mediaConsent });
        if (await saveNationalId(tx as unknown as Db, parentId, g.nationalId)) ids++;
        await tx.insert(studentGuardians).values({ studentId: st!.id, parentId, relation: g.relation ?? "parent", isPrimary: i === 0 });
      }
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "CREATE", module: "students", entity: "students", entityId: st!.id,
        after: { code, manualCode: !!manual, fullName: st!.fullName, guardians: guardians.length, nationalIds: ids, address: !!input.address }, ip: ctx.ip,
      });
      return st!;
    });
  } catch (e) {
    uniqueViolation(e);
  }
}

/** Mã tự sinh CS1-26-000123: số thứ tự = max phần số của mã đúng dạng (bỏ qua mã nhập tay / mã cũ) */
/** Mã học viên kế tiếp theo max(mã) của cơ sở + năm (dùng chung cho tạo HV và chốt lead; gọi trong transaction) */
export async function nextStudentCode(db: Db, centerCode: string) {
  const year = new Date().getFullYear();
  const prefix = `${centerCode.toUpperCase()}-${String(year).slice(-2)}-`;
  const pattern = `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[0-9]{6}$`;
  const [row] = await db.select({ max: sql<string | null>`max(${students.code})` }).from(students).where(sql`${students.code} ~ ${pattern}`);
  const seq = row?.max ? Number(row.max.slice(prefix.length)) + 1 : 1;
  return buildStudentCode(centerCode, year, seq);
}

/** Ghép phụ huynh theo SĐT chuẩn hoá; tạo mới nếu chưa có */
export async function upsertParent(db: Db, p: { fullName: string; phone: string; email: string | null; mediaConsent: boolean }) {
  const existing = await db.query.parents.findFirst({ where: and(eq(parents.phone, p.phone), isNull(parents.deletedAt)) });
  if (existing) {
    const patch: Partial<typeof parents.$inferInsert> = {};
    if (p.mediaConsent && !existing.mediaConsent) Object.assign(patch, { mediaConsent: true, mediaConsentAt: new Date() });
    if (p.email && !existing.email) patch.email = p.email;
    if (Object.keys(patch).length) await db.update(parents).set(patch).where(eq(parents.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(parents).values({ fullName: p.fullName, phone: p.phone, email: p.email, mediaConsent: p.mediaConsent, mediaConsentAt: p.mediaConsent ? new Date() : null }).returning({ id: parents.id });
  return row!.id;
}

export interface GuardianPatch {
  parentId: string;
  fullName?: string;
  phone?: string;
  email?: string | null;
  relation?: GuardianRelation;
  nationalId?: string | null;
}

export async function updateStudent(
  ctx: ProtectedContext,
  id: string,
  input: Partial<StudentInput> & { reason?: string; guardians?: GuardianPatch[]; addGuardians?: GuardianInput[] },
) {
  const s = await ctx.db.query.students.findFirst({ where: and(eq(students.id, id), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  if (input.homeCenterId && input.homeCenterId !== s.homeCenterId) {
    requirePermission(ctx, "student:update", { centerId: input.homeCenterId });
    await assertCenter(ctx.db, input.homeCenterId, "Cơ sở");
  }
  if (input.preferredCenterId && input.preferredCenterId !== s.preferredCenterId) await assertCenter(ctx.db, input.preferredCenterId, "Đơn vị mong muốn");
  const { reason, guardians: gPatches, addGuardians, address, code: rawCode, ...rest } = input;
  const patch: Partial<typeof students.$inferInsert> = normalizeProfile(rest);
  if (rawCode !== undefined && nn(rawCode) && normalizeStudentCode(rawCode) !== s.code) patch.code = (await manualCode(ctx.db, rawCode, s.id))!;

  // Phụ huynh đang gắn: sửa tên / SĐT / email / quan hệ / CCCD
  const linked = gPatches?.length
    ? await ctx.db.select({ parentId: studentGuardians.parentId, phone: parents.phone, fullName: parents.fullName, email: parents.email, relation: studentGuardians.relation })
        .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(eq(studentGuardians.studentId, s.id))
    : [];
  const gUpdates = (gPatches ?? []).map((g) => {
    const cur = linked.find((l) => l.parentId === g.parentId);
    if (!cur) throw bad("Phụ huynh không gắn với học viên này");
    const phone = g.phone !== undefined ? normalizeVnPhone(g.phone) : cur.phone;
    if (!phone) throw bad(`Số điện thoại phụ huynh ${cur.fullName} không hợp lệ`);
    const nationalId = nn(g.nationalId) ? normalizeNationalId(g.nationalId) : null;
    if (nn(g.nationalId) && !nationalId) throw bad("CCCD phụ huynh phải gồm 9 hoặc 12 chữ số");
    return { cur, phone, fullName: g.fullName?.trim() || cur.fullName, email: g.email !== undefined ? nn(g.email) : cur.email, relation: g.relation ?? cur.relation, nationalId };
  });
  const newGuardians = (addGuardians ?? []).map(checkGuardian);
  for (const u of gUpdates) {
    if (u.phone === u.cur.phone) continue;
    const other = await ctx.db.query.parents.findFirst({ where: and(eq(parents.phone, u.phone), isNull(parents.deletedAt), ne(parents.id, u.cur.parentId)) });
    if (other) throw new TRPCError({ code: "CONFLICT", message: `SĐT ${u.phone} đã thuộc phụ huynh ${other.fullName} — dùng "Thêm phụ huynh" để gắn hồ sơ đó` });
  }

  const before: Record<string, unknown> = Object.fromEntries(Object.keys(patch).map((k) => [k, (s as Record<string, unknown>)[k]]));
  try {
    await ctx.db.transaction(async (tx) => {
      if (Object.keys(patch).length) await tx.update(students).set({ ...patch, updatedAt: new Date() }).where(eq(students.id, id));
      const addressSaved = await saveAddress(tx as unknown as Db, s.id, address, ctx.user.id);
      const guardianLog: Record<string, unknown>[] = [];
      for (const u of gUpdates) {
        await tx.update(parents).set({ fullName: u.fullName, phone: u.phone, email: u.email }).where(eq(parents.id, u.cur.parentId));
        await tx.update(studentGuardians).set({ relation: u.relation }).where(and(eq(studentGuardians.studentId, s.id), eq(studentGuardians.parentId, u.cur.parentId)));
        const idSaved = await saveNationalId(tx as unknown as Db, u.cur.parentId, u.nationalId);
        guardianLog.push({ parentId: u.cur.parentId, before: { fullName: u.cur.fullName, phone: u.cur.phone, email: u.cur.email, relation: u.cur.relation }, after: { fullName: u.fullName, phone: u.phone, email: u.email, relation: u.relation }, nationalIdChanged: idSaved });
      }
      for (const g of newGuardians) {
        const parentId = await upsertParent(tx as unknown as Db, { fullName: g.fullName.trim(), phone: g.phone, email: nn(g.email), mediaConsent: !!g.mediaConsent });
        const exists = await tx.query.studentGuardians.findFirst({ where: and(eq(studentGuardians.studentId, s.id), eq(studentGuardians.parentId, parentId)) });
        if (exists) continue;
        await saveNationalId(tx as unknown as Db, parentId, g.nationalId);
        const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentGuardians).where(eq(studentGuardians.studentId, s.id));
        if ((cnt?.n ?? 0) >= 3) throw bad("Mỗi học viên tối đa 3 phụ huynh");
        await tx.insert(studentGuardians).values({ studentId: s.id, parentId, relation: g.relation ?? "parent", isPrimary: (cnt?.n ?? 0) === 0 });
        guardianLog.push({ added: parentId, relation: g.relation ?? "parent", nationalId: !!g.nationalId });
      }
      // CCCD / địa chỉ không ghi giá trị vào nhật ký — chỉ ghi là đã đổi
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "students", entityId: id,
        before, after: { ...patch, ...(addressSaved ? { address: "(đã cập nhật)" } : {}), ...(guardianLog.length ? { guardians: guardianLog } : {}) }, reason: reason ?? null, ip: ctx.ip,
      });
    });
  } catch (e) {
    uniqueViolation(e);
  }
  return getStudent(ctx, id);
}

export async function addGuardian(ctx: ProtectedContext, input: { studentId: string } & GuardianInput) {
  const s = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  const g = checkGuardian(input);
  await ctx.db.transaction(async (tx) => {
    const parentId = await upsertParent(tx as unknown as Db, { fullName: g.fullName.trim(), phone: g.phone, email: nn(g.email), mediaConsent: !!g.mediaConsent });
    const exists = await tx.query.studentGuardians.findFirst({ where: and(eq(studentGuardians.studentId, s.id), eq(studentGuardians.parentId, parentId)) });
    if (exists) throw new TRPCError({ code: "CONFLICT", message: "Phụ huynh này đã gắn với học viên" });
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentGuardians).where(eq(studentGuardians.studentId, s.id));
    if ((cnt?.n ?? 0) >= 3) throw bad("Mỗi học viên tối đa 3 phụ huynh");
    await saveNationalId(tx as unknown as Db, parentId, g.nationalId);
    await tx.insert(studentGuardians).values({ studentId: s.id, parentId, relation: g.relation ?? "parent", isPrimary: (cnt?.n ?? 0) === 0 });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "student_guardians", entityId: s.id, after: { parentId, relation: g.relation ?? "parent", nationalId: !!g.nationalId }, ip: ctx.ip });
  });
  return getStudent(ctx, s.id);
}

/** Xem đầy đủ CCCD phụ huynh + địa chỉ: quyền sửa hồ sơ, bắt buộc lý do, ghi nhật ký PII_REVEAL */
export async function revealStudentPrivate(ctx: ProtectedContext, input: { studentId: string; reason: string }) {
  const s = await ctx.db.query.students.findFirst({ where: and(eq(students.id, input.studentId), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  let reason: string;
  try {
    reason = requireReason(input.reason);
  } catch (e) {
    throw bad((e as Error).message);
  }
  const [priv, gs] = await Promise.all([
    ctx.db.query.studentPrivate.findFirst({ where: eq(studentPrivate.studentId, s.id) }),
    ctx.db.select({ parentId: parents.id, fullName: parents.fullName, nationalIdEnc: parentPrivate.nationalIdEnc })
      .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).leftJoin(parentPrivate, eq(parentPrivate.parentId, parents.id))
      .where(eq(studentGuardians.studentId, s.id)),
  ]);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "students", entity: "parent_private", entityId: s.id, after: { parents: gs.filter((g) => g.nationalIdEnc).map((g) => g.parentId) }, reason, ip: ctx.ip });
  return {
    address: priv ? { address: priv.address, ward: priv.ward, district: priv.district, city: priv.city } : null,
    guardians: gs.map((g) => ({ parentId: g.parentId, fullName: g.fullName, nationalId: decryptPii(g.nationalIdEnc) })),
  };
}

/** Danh sách HV rút gọn cho ô chọn (ghi danh, chuyển lớp) */
export async function pickStudents(ctx: ProtectedContext, q: string, centerId?: string) {
  requirePermission(ctx, "student:read", {});
  const conds = [isNull(students.deletedAt), centerScope(ctx, students.homeCenterId), or(ilike(students.fullName, `%${q}%`), ilike(students.code, `%${q}%`))!];
  if (centerId) conds.push(eq(students.homeCenterId, centerId));
  return ctx.db
    .select({ id: students.id, code: students.code, fullName: students.fullName, grade: students.grade, centerCode: centers.code })
    .from(students).leftJoin(centers, eq(centers.id, students.homeCenterId))
    .where(and(...conds))
    .orderBy(asc(students.fullName)).limit(20);
}
