import { and, eq, inArray, sql, desc, isNull, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  students, parents, studentGuardians, enrollments, enrollmentEvents, classes, sessions, centers, importBatches, legacyRefs, reconSnapshots, users,
} from "@satarobo/db";
import {
  authorize, authorizeGlobal, centersWith, parseStudentImport, parseEnrollmentImport, parseRemainingCsv, compareRemaining, reconcile, addDays,
  RECON_METRICS, type ReconMetric, type RemainingDiff, type StudentImportRow, type EnrollmentImportRow, type ParsedRow,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { consumedSql, upsertParent } from "./students";
import { assertCenterTenant, tenantCond, tenantSql } from "./tenantScope";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

function assertRun(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "migration:run")) throw forbid("Chỉ quản trị Hội sở được nhập dữ liệu chuyển đổi");
}
/** Cơ sở được xem đối soát: null = tất cả */
function readableCenters(ctx: ProtectedContext): string[] | null {
  const c = centersWith(ctx.actor, "migration:read");
  if (c !== null && !c.length) throw forbid("Không có quyền xem đối soát");
  return c;
}
function note5(n: string) {
  const t = n.trim();
  if (t.length < 5) throw bad("Ghi chú lô nhập tối thiểu 5 ký tự (nguồn file, ngày xuất)");
  return t.slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Học viên                                                             */
/* ------------------------------------------------------------------ */

type StudentPlan = ParsedRow<StudentImportRow> & {
  status: "ok" | "error" | "duplicate";
  action: "create" | "link" | null;
  centerId: string | null;
  existingId: string | null;
  existingCode: string | null;
  newCode: string | null;
};

async function planStudents(ctx: ProtectedContext, csv: string) {
  const parsed = parseStudentImport(csv, todayISO());
  if (parsed.headerErrors.length) return { headerErrors: parsed.headerErrors, rows: [] as StudentPlan[] };
  const ok = parsed.rows.filter((r) => r.row).map((r) => r.row!);
  const allCenters = await ctx.db.select({ id: centers.id, code: centers.code }).from(centers).where(tenantCond(ctx, centers));
  const codes = ok.map((r) => r.legacyCode);
  const refs = codes.length ? await ctx.db.select({ code: legacyRefs.legacyCode, entityId: legacyRefs.entityId }).from(legacyRefs).where(and(eq(legacyRefs.kind, "student"), inArray(legacyRefs.legacyCode, codes))) : [];
  const usedCodes = codes.length ? await ctx.db.select({ id: students.id, code: students.code }).from(students).where(and(inArray(students.code, codes), tenantCond(ctx, students))) : [];
  const phones = [...new Set(ok.map((r) => r.parentPhone))];
  const sameFamily = phones.length ? await ctx.db.select({ id: students.id, code: students.code, name: students.fullName, phone: parents.phone })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(and(inArray(parents.phone, phones), isNull(students.deletedAt), tenantCond(ctx, students))) : [];
  const rows = parsed.rows.map((r): StudentPlan => {
    const base: StudentPlan = { ...r, status: r.row ? "ok" : "error", action: null, centerId: null, existingId: null, existingCode: null, newCode: null };
    if (!r.row) return base;
    const x = r.row;
    const center = allCenters.find((c) => c.code.toUpperCase() === x.center);
    if (!center) return { ...base, status: "error", errors: [...r.errors, `Không có cơ sở ${x.center}`] };
    if (!authorize(ctx.actor, "student:create", { centerId: center.id }).allowed) return { ...base, status: "error", errors: [...r.errors, `Không có quyền tạo học viên ở ${x.center}`] };
    const ref = refs.find((f) => f.code === x.legacyCode);
    if (ref) return { ...base, status: "duplicate", centerId: center.id, existingId: ref.entityId, errors: ["Đã nhập ở lô trước"] };
    const fam = sameFamily.find((s) => s.phone === x.parentPhone && fold(s.name) === fold(x.fullName));
    if (fam) return { ...base, action: "link", centerId: center.id, existingId: fam.id, existingCode: fam.code, warnings: [...r.warnings, `Đã có học viên cùng tên + SĐT phụ huynh (${fam.code}) — sẽ ghép, không tạo mới`] };
    const taken = usedCodes.find((u) => u.code === x.legacyCode);
    return { ...base, action: "create", centerId: center.id, newCode: taken ? null : x.legacyCode, warnings: taken ? [...r.warnings, `Mã ${x.legacyCode} đã dùng cho học viên khác — cấp mã mới`] : r.warnings };
  });
  return { headerErrors: [] as string[], rows };
}

function summarize<T extends { status: string; warnings: string[] }>(rows: T[]) {
  return { rows: rows.length, ok: rows.filter((r) => r.status === "ok").length, errors: rows.filter((r) => r.status === "error").length, duplicates: rows.filter((r) => r.status === "duplicate").length, warnings: rows.filter((r) => r.warnings.length).length };
}

export async function previewStudents(ctx: ProtectedContext, input: { csv: string }) {
  assertRun(ctx);
  const p = await planStudents(ctx, input.csv);
  return {
    headerErrors: p.headerErrors,
    summary: { ...summarize(p.rows), create: p.rows.filter((r) => r.status === "ok" && r.action === "create").length, link: p.rows.filter((r) => r.status === "ok" && r.action === "link").length },
    rows: p.rows.map((r) => ({
      line: r.line, status: r.status, action: r.action, errors: r.errors, warnings: r.warnings, existingCode: r.existingCode,
      legacyCode: r.row?.legacyCode ?? null, fullName: r.row?.fullName ?? null, center: r.row?.center ?? null, studentStatus: r.row?.status ?? null,
      parentName: r.row?.parentName ?? null, hasParent2: !!r.row?.parent2, dob: r.row?.dateOfBirth ?? null,
    })),
  };
}

async function nextCode(tx: Db, centerCode: string) {
  const year = new Date().getFullYear();
  const prefix = `${centerCode.toUpperCase()}-${String(year).slice(-2)}-`;
  const [row] = await tx.select({ max: sql<string | null>`max(${students.code})` }).from(students).where(sql`${students.code} ~ ${"^" + prefix.replace(/[.-]/g, "\\$&") + "[0-9]{6}$"}`);
  const seq = row?.max ? Number(row.max.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export async function importStudents(ctx: ProtectedContext, input: { csv: string; note: string; fileName?: string | null }) {
  assertRun(ctx);
  const note = note5(input.note);
  const p = await planStudents(ctx, input.csv);
  if (p.headerErrors.length) throw bad(p.headerErrors);
  const todo = p.rows.filter((r) => r.status === "ok");
  if (!todo.length) throw pre("Không có dòng hợp lệ để nhập");
  const centerCodes = new Map((await ctx.db.select({ id: centers.id, code: centers.code }).from(centers).where(tenantCond(ctx, centers))).map((c) => [c.id, c.code]));
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('migration:students'))`);
    const [batch] = await tx.insert(importBatches).values({ kind: "legacy_students", fileName: input.fileName?.slice(0, 200) || null, note, totalRows: p.rows.length, createdBy: ctx.user.id }).returning({ id: importBatches.id });
    let created = 0;
    let linked = 0;
    let parentsLinked = 0;
    for (const r of todo) {
      const x = r.row!;
      let studentId = r.existingId;
      if (r.action === "create") {
        const code = r.newCode ?? (await nextCode(tx, centerCodes.get(r.centerId!)!));
        const [st] = await tx.insert(students).values({
          code, fullName: x.fullName, nickname: x.nickname, dateOfBirth: x.dateOfBirth, gender: x.gender, grade: x.grade, school: x.school,
          homeCenterId: r.centerId, status: x.status, healthNotes: x.healthNotes, notes: [x.note, `Chuyển từ hệ cũ (${x.legacyCode})`].filter(Boolean).join(" · "),
        }).returning({ id: students.id });
        studentId = st!.id;
        created++;
      } else linked++;
      const guardians = [{ name: x.parentName, phone: x.parentPhone, email: x.parentEmail, relation: x.relation }, ...(x.parent2 ? [{ name: x.parent2.name, phone: x.parent2.phone, email: null, relation: "parent" }] : [])];
      for (const [i, g] of guardians.entries()) {
        const parentId = await upsertParent(tx, { fullName: g.name, phone: g.phone, email: g.email, mediaConsent: false });
        const has = await tx.query.studentGuardians.findFirst({ where: and(eq(studentGuardians.studentId, studentId!), eq(studentGuardians.parentId, parentId)) });
        if (!has) {
          await tx.insert(studentGuardians).values({ studentId: studentId!, parentId, relation: g.relation, isPrimary: i === 0 && r.action === "create" });
          parentsLinked++;
        }
      }
      await tx.insert(legacyRefs).values({ kind: "student", legacyCode: x.legacyCode, entityId: studentId!, batchId: batch!.id, data: { action: r.action, line: x.line } });
    }
    const summary = { created, linked, parentsLinked, errors: p.rows.filter((r) => r.status === "error").length, duplicates: p.rows.filter((r) => r.status === "duplicate").length };
    await tx.update(importBatches).set({ okRows: created + linked, skippedRows: summary.errors + summary.duplicates, summary }).where(eq(importBatches.id, batch!.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "migration", entity: "import_batches", entityId: batch!.id, after: { kind: "legacy_students", ...summary }, reason: note, ip: ctx.ip });
    return { batchId: batch!.id, ...summary };
  });
}

/* ------------------------------------------------------------------ */
/* Ghi danh                                                             */
/* ------------------------------------------------------------------ */

type EnrollPlan = ParsedRow<EnrollmentImportRow> & {
  status: "ok" | "error" | "duplicate";
  studentId: string | null;
  studentName: string | null;
  classId: string | null;
  centerId: string | null;
  startSequenceNo: number;
};

async function planEnrollments(ctx: ProtectedContext, csv: string) {
  const parsed = parseEnrollmentImport(csv, todayISO());
  if (parsed.headerErrors.length) return { headerErrors: parsed.headerErrors, rows: [] as EnrollPlan[] };
  const ok = parsed.rows.filter((r) => r.row).map((r) => r.row!);
  const sCodes = [...new Set(ok.map((r) => r.studentCode))];
  const cCodes = [...new Set(ok.map((r) => r.classCode))];
  const refs = sCodes.length ? await ctx.db.select({ code: legacyRefs.legacyCode, id: legacyRefs.entityId }).from(legacyRefs).where(and(eq(legacyRefs.kind, "student"), inArray(legacyRefs.legacyCode, sCodes))) : [];
  const byCode = sCodes.length ? await ctx.db.select({ id: students.id, code: students.code }).from(students).where(and(inArray(students.code, sCodes), isNull(students.deletedAt), tenantCond(ctx, students))) : [];
  const ids = [...new Set([...refs.map((r) => r.id), ...byCode.map((r) => r.id)])];
  const names = ids.length ? await ctx.db.select({ id: students.id, name: students.fullName }).from(students).where(and(inArray(students.id, ids), tenantCond(ctx, students))) : [];
  const cls = cCodes.length ? await ctx.db.select({ id: classes.id, code: classes.code, centerId: classes.centerId, status: classes.status }).from(classes).where(and(inArray(classes.code, cCodes), tenantCond(ctx, classes))) : [];
  const nextSeq = cls.length ? await ctx.db.select({ classId: sessions.classId, next: sql<number | null>`min(${sessions.sequenceNo}) filter (where ${sessions.status} in ('scheduled','in_progress'))`, last: sql<number>`coalesce(max(${sessions.sequenceNo}), 0)` })
    .from(sessions).where(and(inArray(sessions.classId, cls.map((c) => c.id)), tenantCond(ctx, sessions))).groupBy(sessions.classId) : [];
  const keys = ok.map((r) => `${r.studentCode}|${r.classCode}`);
  const eRefs = keys.length ? await ctx.db.select({ code: legacyRefs.legacyCode }).from(legacyRefs).where(and(eq(legacyRefs.kind, "enrollment"), inArray(legacyRefs.legacyCode, keys))) : [];
  const open = ids.length && cls.length ? await ctx.db.select({ studentId: enrollments.studentId, classId: enrollments.classId }).from(enrollments)
    .where(and(inArray(enrollments.studentId, ids), inArray(enrollments.classId, cls.map((c) => c.id)), inArray(enrollments.status, ["trial", "active", "paused"]), tenantCond(ctx, enrollments))) : [];
  const rows = parsed.rows.map((r): EnrollPlan => {
    const base: EnrollPlan = { ...r, status: r.row ? "ok" : "error", studentId: null, studentName: null, classId: null, centerId: null, startSequenceNo: 1 };
    if (!r.row) return base;
    const x = r.row;
    const errors = [...r.errors];
    const sid = refs.find((f) => f.code === x.studentCode)?.id ?? byCode.find((s) => s.code === x.studentCode)?.id ?? null;
    if (!sid) errors.push(`Chưa có học viên ${x.studentCode} — nhập học viên trước`);
    const c = cls.find((k) => k.code.toUpperCase() === x.classCode);
    if (!c) errors.push(`Chưa có lớp ${x.classCode} trên hệ mới — tạo lớp trước`);
    else {
      if (!authorize(ctx.actor, "enrollment:create", { centerId: c.centerId }).allowed) errors.push("Không có quyền ghi danh ở cơ sở của lớp");
      if (["active", "trial", "paused"].includes(x.status) && ["finished", "cancelled"].includes(c.status)) errors.push(`Lớp ${c.code} đã kết thúc / huỷ — không nhập ghi danh đang mở`);
    }
    if (errors.length) return { ...base, status: "error", errors };
    const ns = nextSeq.find((n) => n.classId === c!.id);
    const startSequenceNo = ns?.next ?? (ns ? ns.last + 1 : 1);
    const dup = eRefs.some((e) => e.code === `${x.studentCode}|${x.classCode}`);
    if (dup) return { ...base, status: "duplicate", errors: ["Đã nhập ở lô trước"], studentId: sid, classId: c!.id };
    if (["active", "trial", "paused"].includes(x.status) && open.some((o) => o.studentId === sid && o.classId === c!.id)) {
      return { ...base, status: "duplicate", errors: ["Học viên đã có ghi danh mở ở lớp này trên hệ mới"], studentId: sid, classId: c!.id };
    }
    return { ...base, studentId: sid, studentName: names.find((n) => n.id === sid)?.name ?? null, classId: c!.id, centerId: c!.centerId, startSequenceNo };
  });
  return { headerErrors: [] as string[], rows };
}

export async function previewEnrollments(ctx: ProtectedContext, input: { csv: string }) {
  assertRun(ctx);
  const p = await planEnrollments(ctx, input.csv);
  const okRows = p.rows.filter((r) => r.status === "ok");
  return {
    headerErrors: p.headerErrors,
    summary: { ...summarize(p.rows), remaining: okRows.reduce((s, r) => s + (r.row!.packageSessions - r.row!.usedSessions), 0) },
    rows: p.rows.map((r) => ({
      line: r.line, status: r.status, errors: r.errors, warnings: r.warnings, studentCode: r.row?.studentCode ?? null, studentName: r.studentName, classCode: r.row?.classCode ?? null,
      packageSessions: r.row?.packageSessions ?? null, usedSessions: r.row?.usedSessions ?? null, enrollmentStatus: r.row?.status ?? null, startSequenceNo: r.status === "ok" ? r.startSequenceNo : null,
    })),
  };
}

export async function importEnrollments(ctx: ProtectedContext, input: { csv: string; note: string; fileName?: string | null }) {
  assertRun(ctx);
  const note = note5(input.note);
  const p = await planEnrollments(ctx, input.csv);
  if (p.headerErrors.length) throw bad(p.headerErrors);
  const todo = p.rows.filter((r) => r.status === "ok");
  if (!todo.length) throw pre("Không có dòng hợp lệ để nhập");
  const today = todayISO();
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('migration:enrollments'))`);
    const [batch] = await tx.insert(importBatches).values({ kind: "legacy_enrollments", fileName: input.fileName?.slice(0, 200) || null, note, totalRows: p.rows.length, createdBy: ctx.user.id }).returning({ id: importBatches.id });
    let n = 0;
    let carried = 0;
    for (const r of todo) {
      const x = r.row!;
      const closed = x.status === "completed" || x.status === "withdrawn";
      const enrolledAt = x.enrolledAt ? new Date(`${x.enrolledAt}T08:00:00+07:00`) : new Date();
      const [e] = await tx.insert(enrollments).values({
        studentId: r.studentId!, classId: r.classId!, status: x.status, packageSessions: x.packageSessions, carriedSessions: x.usedSessions, startSequenceNo: r.startSequenceNo,
        enrolledAt, endedAt: closed ? new Date() : null, endReason: closed ? "Chuyển từ hệ cũ" : null,
        pausedAt: x.status === "paused" ? today : null, pauseUntil: x.status === "paused" ? (x.pauseUntil ?? addDays(today, 90)) : null, createdBy: ctx.user.id,
      }).returning({ id: enrollments.id });
      await tx.insert(enrollmentEvents).values({ enrollmentId: e!.id, type: "created", toStatus: x.status, reason: `Chuyển từ hệ cũ: đã học ${x.usedSessions}/${x.packageSessions}${x.note ? ` · ${x.note}` : ""}`, actorId: ctx.user.id });
      if (["active", "trial"].includes(x.status)) {
        const st = await tx.query.students.findFirst({ where: eq(students.id, r.studentId!) });
        if (st && ["prospect", "withdrawn", "alumni"].includes(st.status)) await tx.update(students).set({ status: x.status === "trial" ? "trial" : "active" }).where(eq(students.id, st.id));
      }
      await tx.insert(legacyRefs).values({ kind: "enrollment", legacyCode: `${x.studentCode}|${x.classCode}`, entityId: e!.id, batchId: batch!.id, data: { used: x.usedSessions, package: x.packageSessions } });
      n++;
      carried += x.usedSessions;
    }
    const summary = { enrollments: n, carriedSessions: carried, errors: p.rows.filter((r) => r.status === "error").length, duplicates: p.rows.filter((r) => r.status === "duplicate").length };
    await tx.update(importBatches).set({ okRows: n, skippedRows: summary.errors + summary.duplicates, summary }).where(eq(importBatches.id, batch!.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "migration", entity: "import_batches", entityId: batch!.id, after: { kind: "legacy_enrollments", ...summary }, reason: note, ip: ctx.ip });
    return { batchId: batch!.id, ...summary };
  });
}

export async function migrationBatches(ctx: ProtectedContext) {
  readableCenters(ctx);
  const rows = await ctx.db.select({ b: importBatches, by: users.fullName }).from(importBatches).leftJoin(users, eq(users.id, importBatches.createdBy))
    .where(inArray(importBatches.kind, ["legacy_students", "legacy_enrollments", "legacy_payments"])).orderBy(desc(importBatches.createdAt)).limit(100);
  const [refs] = await ctx.db.select({
    students: sql<number>`count(*) filter (where ${legacyRefs.kind} = 'student')::int`,
    enrollments: sql<number>`count(*) filter (where ${legacyRefs.kind} = 'enrollment')::int`,
  }).from(legacyRefs);
  return { canRun: authorizeGlobal(ctx.actor, "migration:run"), refs: refs ?? { students: 0, enrollments: 0 }, items: rows.map((r) => ({ ...r.b, by: r.by })) };
}

/* ------------------------------------------------------------------ */
/* Đối soát                                                             */
/* ------------------------------------------------------------------ */

const inList = (col: SQL, ids: string[] | null) => (ids === null ? sql`true` : ids.length ? sql`${col} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`false`);

export async function currentMetrics(ctx: ProtectedContext, centerIds: string[] | null): Promise<Record<ReconMetric, number>> {
  const month = todayISO().slice(0, 7);
  // Mỗi truy vấn con lọc theo cơ sở VÀ theo trung tâm (tenant) — Hội sở chuỗi không cộng nhầm số của bên nhượng quyền
  const r = (await ctx.db.execute(sql`
    select
      (select count(*)::int from students s where s.status = 'active' and s.deleted_at is null and ${inList(sql`s.home_center_id`, centerIds)} and ${tenantSql(ctx, "s")}) as "activeStudents",
      (select count(*)::int from enrollments e join classes c on c.id = e.class_id where e.status in ('trial','active','paused') and ${inList(sql`c.center_id`, centerIds)} and ${tenantSql(ctx, "c")}) as "openEnrollments",
      (select count(*)::int from classes c where c.status = 'running' and ${inList(sql`c.center_id`, centerIds)} and ${tenantSql(ctx, "c")}) as "runningClasses",
      (select coalesce(sum(greatest(0, e.package_sessions - e.carried_sessions - (select count(*) from attendance a where a.enrollment_id = e.id and a.status in ('present','late','absent_unexcused')))), 0)::int
         from enrollments e join classes c on c.id = e.class_id where e.status in ('trial','active','paused') and ${inList(sql`c.center_id`, centerIds)} and ${tenantSql(ctx, "c")}) as "remainingSessions",
      (select coalesce(sum(greatest(0, o.total - coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.status = 'confirmed'), 0))), 0)::float
         from orders o where o.status in ('pending_payment','partially_paid') and ${inList(sql`o.center_id`, centerIds)} and ${tenantSql(ctx, "o")}) as "debtTotal",
      (select coalesce(sum(p.amount), 0)::float from payments p where p.status = 'confirmed' and to_char(p.paid_at, 'YYYY-MM') = ${month} and ${inList(sql`p.center_id`, centerIds)} and ${tenantSql(ctx, "p")}) as "collectedMonth"
  `)) as unknown as Record<ReconMetric, number>[];
  const row = r[0]!;
  return Object.fromEntries(RECON_METRICS.map((m) => [m, Number(row[m] ?? 0)])) as Record<ReconMetric, number>;
}

function scopeFor(ctx: ProtectedContext, centerId: string | null | undefined): string[] | null {
  const allowed = readableCenters(ctx);
  if (centerId) {
    if (allowed !== null && !allowed.includes(centerId)) throw forbid("Không có quyền với cơ sở này");
    return [centerId];
  }
  return allowed;
}

export async function reconOverview(ctx: ProtectedContext, input: { centerId?: string | null }) {
  const ids = scopeFor(ctx, input.centerId);
  const current = await currentMetrics(ctx, ids);
  const history = await ctx.db.select({ s: reconSnapshots, by: users.fullName, center: centers.code }).from(reconSnapshots)
    .leftJoin(users, eq(users.id, reconSnapshots.createdBy)).leftJoin(centers, eq(centers.id, reconSnapshots.centerId))
    .where(input.centerId ? eq(reconSnapshots.centerId, input.centerId) : ids === null ? sql`true` : ids.length ? inArray(reconSnapshots.centerId, ids) : sql`false`)
    .orderBy(desc(reconSnapshots.createdAt)).limit(20);
  const centerList = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(ids === null ? sql`true` : inArray(centers.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]), tenantCond(ctx, centers)));
  return {
    current, centers: centerList, canSave: authorizeGlobal(ctx.actor, "migration:run") || (!!input.centerId && authorize(ctx.actor, "cutover:create", { centerId: input.centerId }).allowed),
    history: history.map((h) => ({ ...h.s, by: h.by, centerCode: h.center, result: reconcile(h.s.legacy as Partial<Record<ReconMetric, number>>, h.s.current as Record<ReconMetric, number>) })),
  };
}

export async function saveRecon(ctx: ProtectedContext, input: { centerId: string | null; legacy: Partial<Record<ReconMetric, number | null>>; note?: string | null }) {
  const can = input.centerId ? authorizeGlobal(ctx.actor, "migration:run") || authorize(ctx.actor, "cutover:create", { centerId: input.centerId }).allowed : authorizeGlobal(ctx.actor, "migration:run");
  if (!can) throw forbid("Không có quyền ghi đối soát");
  await assertCenterTenant(ctx, input.centerId);
  const current = await currentMetrics(ctx, input.centerId ? [input.centerId] : null);
  const res = reconcile(input.legacy, current);
  if (!res.compared) throw bad("Nhập ít nhất một số liệu hệ cũ để so");
  const [row] = await ctx.db.insert(reconSnapshots).values({ centerId: input.centerId, legacy: input.legacy as Record<string, number | null>, current, ok: res.ok, note: input.note?.trim() || null, createdBy: ctx.user.id }).returning({ id: reconSnapshots.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "migration", entity: "recon_snapshots", entityId: row!.id, after: { ok: res.ok, compared: res.compared }, ip: ctx.ip });
  return { id: row!.id, ...res };
}

/** So từng học viên với file xuất từ hệ cũ (không lưu) */
export type CompareResult = { headerErrors: string[]; lineErrors: { line: number; errors: string[] }[]; diffs: RemainingDiff[]; checked: number };
export async function compareStudents(ctx: ProtectedContext, input: { csv: string; centerId?: string | null }): Promise<CompareResult> {
  const ids = scopeFor(ctx, input.centerId);
  const f = parseRemainingCsv(input.csv);
  if (f.headerErrors.length) return { headerErrors: f.headerErrors, lineErrors: [], diffs: [], checked: 0 };
  const rows = f.rows.filter((r) => r.row).map((r) => r.row!);
  const codes = [...new Set(rows.map((r) => r.studentCode))];
  const refs = codes.length ? await ctx.db.select({ code: legacyRefs.legacyCode, id: legacyRefs.entityId }).from(legacyRefs).where(and(eq(legacyRefs.kind, "student"), inArray(legacyRefs.legacyCode, codes))) : [];
  const direct = codes.length ? await ctx.db.select({ id: students.id, code: students.code }).from(students).where(and(inArray(students.code, codes), tenantCond(ctx, students))) : [];
  const idOf = new Map<string, string>();
  for (const d of direct) idOf.set(d.code!, d.id);
  for (const r of refs) idOf.set(r.code, r.id);
  const sids = [...new Set(idOf.values())];
  const enr = sids.length ? await ctx.db.select({ studentId: enrollments.studentId, classCode: classes.code, pkg: enrollments.packageSessions, consumed: consumedSql, centerId: classes.centerId })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(inArray(enrollments.studentId, sids), inArray(enrollments.status, ["trial", "active", "paused"]), tenantCond(ctx, enrollments))) : [];
  const debtRows = sids.length ? (await ctx.db.execute(sql`
    select o.student_id as "studentId", coalesce(sum(greatest(0, o.total - coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.status = 'confirmed'), 0))), 0)::float as debt
    from orders o where o.status in ('pending_payment','partially_paid') and o.student_id in (${sql.join(sids.map((i) => sql`${i}::uuid`), sql`, `)}) group by o.student_id`)) as unknown as { studentId: string; debt: number }[] : [];
  const codeOf = new Map([...idOf.entries()].map(([c, id]) => [id, c]));
  const inScope = (cid: string) => ids === null || ids.includes(cid);
  const current = enr.filter((e) => inScope(e.centerId)).map((e) => ({ studentCode: codeOf.get(e.studentId)!, classCode: e.classCode.toUpperCase(), remaining: Math.max(0, e.pkg - Number(e.consumed)) }));
  const debts = new Map(debtRows.map((d) => [codeOf.get(d.studentId)!, Number(d.debt)]));
  const scopedRows = ids === null ? rows : rows.filter((r) => { const sid = idOf.get(r.studentCode); return !sid || enr.some((e) => e.studentId === sid && inScope(e.centerId)); });
  const diffs = compareRemaining(scopedRows, current, debts);
  return { headerErrors: [], lineErrors: f.rows.filter((r) => !r.row).map((r) => ({ line: r.line, errors: r.errors })), diffs, checked: scopedRows.length };
}
