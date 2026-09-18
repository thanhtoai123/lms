import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, or, ilike, isNull, lt, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { jobPostings, candidates, candidateEvents, interviews, users, centers, userRoles, teachers, type Database } from "@satarobo/db";
import {
  authorize, centersWith, normalizeVnPhone, maskPhone, retentionCutoff,
  validateJob, jobTransition, candidateTransition, validateApplication, validateInterview, validateScore, jobCode, jobSlug,
  JOB_STATUS_VI, CANDIDATE_STAGE_VI, CANDIDATE_STAGES, INTERVIEW_RESULT_VI, EMPLOYMENT_TYPE_VI, CANDIDATE_RETENTION_MONTHS, ANON_NAME, anonymizedPhone,
  type JobStatus, type CandidateStage, type InterviewResult, type EmploymentType, type Department, DEPARTMENT_VI,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { putObject, signedFileUrl } from "../storage";
import { todayISO } from "./sessions";
import { notify } from "./finance";
import { upsertStaff } from "./hr";
import { assertCenterTenant, tenantCond, tenantCondViaCenter, tenantSql } from "./tenantScope";

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
    if ((e as Error)?.name === "OutreachRuleError") throw pre((e as Error).message);
    throw e;
  }
}
const can = (ctx: ProtectedContext, p: `recruit:${string}`, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
function scopeSql(col: SQL | typeof jobPostings.centerId, ids: string[] | null): SQL {
  if (ids === null) return sql`true`;
  return ids.length ? sql`(${col} is null or ${inArray(col as typeof jobPostings.centerId, ids)})` : sql`false`;
}
/** Tin toàn hệ thống (centerId null) chỉ Hội sở sửa được */
function canManageJob(ctx: ProtectedContext, centerId: string | null) {
  if (centerId === null) return centersWith(ctx.actor, "recruit:update") === null;
  return can(ctx, "recruit:update", centerId);
}

/* ------------------------------------------------------------------ */
/* Tin tuyển dụng                                                       */
/* ------------------------------------------------------------------ */

export async function listJobs(ctx: ProtectedContext, input: { status?: JobStatus; q?: string }) {
  const ids = centersWith(ctx.actor, "recruit:read");
  if (ids !== null && ids.length === 0) throw forbid("Không có quyền xem tuyển dụng");
  const conds: SQL[] = [scopeSql(jobPostings.centerId, ids), tenantCondViaCenter(ctx, jobPostings.centerId)];
  if (input.status) conds.push(eq(jobPostings.status, input.status));
  if (input.q?.trim()) conds.push(or(ilike(jobPostings.title, `%${input.q.trim()}%`), ilike(jobPostings.code, `%${input.q.trim()}%`))!);
  const r = await ctx.db.select({
    j: jobPostings, centerCode: centers.code,
    total: sql<number>`(select count(*)::int from ${candidates} c where c.job_id = ${jobPostings.id})`,
    active: sql<number>`(select count(*)::int from ${candidates} c where c.job_id = ${jobPostings.id} and c.stage in ('applied','screening','interview','offer'))`,
    fresh: sql<number>`(select count(*)::int from ${candidates} c where c.job_id = ${jobPostings.id} and c.stage = 'applied')`,
    hired: sql<number>`(select count(*)::int from ${candidates} c where c.job_id = ${jobPostings.id} and c.stage = 'hired')`,
  }).from(jobPostings).leftJoin(centers, eq(centers.id, jobPostings.centerId)).where(and(...conds))
    .orderBy(sql`case ${jobPostings.status} when 'open' then 0 when 'draft' then 1 when 'paused' then 2 else 3 end`, desc(jobPostings.createdAt)).limit(200);
  const vis = centersWith(ctx.actor, "recruit:create");
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(eq(centers.isActive, true), tenantCond(ctx, centers))).orderBy(asc(centers.code));
  const today = todayISO();
  const upcoming = await ctx.db.select({ id: interviews.id, at: interviews.scheduledAt, candidate: candidates.fullName, candidateId: candidates.id, job: jobPostings.title })
    .from(interviews).innerJoin(candidates, eq(candidates.id, interviews.candidateId)).innerJoin(jobPostings, eq(jobPostings.id, candidates.jobId))
    .where(and(eq(interviews.interviewerId, ctx.user.id), isNull(interviews.cancelledAt), isNull(interviews.scoredAt))).orderBy(asc(interviews.scheduledAt)).limit(20);
  return {
    canCreate: vis === null || vis.length > 0,
    centers: vis === null ? ctrs : ctrs.filter((c) => vis.includes(c.id)),
    globalCreate: vis === null,
    myInterviews: upcoming,
    items: r.map((x) => ({
      ...x.j, centerCode: x.centerCode, statusLabel: JOB_STATUS_VI[x.j.status as JobStatus], typeLabel: EMPLOYMENT_TYPE_VI[x.j.employmentType as EmploymentType],
      counts: { total: x.total, active: x.active, fresh: x.fresh, hired: x.hired }, expired: !!x.j.deadline && x.j.deadline < today && x.j.status === "open",
      canEdit: canManageJob(ctx, x.j.centerId),
    })),
  };
}

export interface JobInput {
  id?: string; title: string; centerId?: string | null; department: Department; employmentType: EmploymentType; openings: number;
  salaryMin?: number | null; salaryMax?: number | null; salaryText?: string | null; description: string; requirements?: string | null; benefits?: string | null; deadline?: string | null;
}
export async function upsertJob(ctx: ProtectedContext, input: JobInput) {
  const centerId = input.centerId ?? null;
  const before = input.id ? await ctx.db.query.jobPostings.findFirst({ where: eq(jobPostings.id, input.id) }) : undefined;
  if (input.id && !before) throw notFound("Không tìm thấy tin tuyển dụng");
  if (before && !canManageJob(ctx, before.centerId)) throw forbid("Không có quyền sửa tin này");
  await assertCenterTenant(ctx, before?.centerId ?? null, "Tin tuyển dụng");
  await assertCenterTenant(ctx, centerId);
  const ok = centerId === null ? centersWith(ctx.actor, before ? "recruit:update" : "recruit:create") === null : can(ctx, before ? "recruit:update" : "recruit:create", centerId);
  if (!ok) throw forbid(centerId === null ? "Tin toàn hệ thống do Hội sở tạo — chọn cơ sở" : "Không có quyền tuyển dụng ở cơ sở này");
  if (before?.status === "closed") throw pre("Tin đã đóng — mở lại trước khi sửa");
  const errs = validateJob({ ...input, today: todayISO() });
  if (errs.length) throw bad(errs);
  const v = {
    title: input.title.trim(), centerId, department: input.department, employmentType: input.employmentType, openings: input.openings,
    salaryMin: input.salaryMin ?? null, salaryMax: input.salaryMax ?? null, salaryText: input.salaryText?.trim() || null,
    description: input.description.trim(), requirements: input.requirements?.trim() || null, benefits: input.benefits?.trim() || null, deadline: input.deadline || null,
  };
  if (before) {
    await ctx.db.update(jobPostings).set(v).where(eq(jobPostings.id, before.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "recruit", entity: "job_postings", entityId: before.id, before: { title: before.title, openings: before.openings }, after: v, ip: ctx.ip });
    return { id: before.id, code: before.code, slug: before.slug };
  }
  const y = Number(todayISO().slice(0, 4));
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(jobPostings).where(sql`${jobPostings.code} like ${`TD${String(y).slice(-2)}-%`}`);
  const code = jobCode(y, (c?.n ?? 0) + 1);
  const slug = jobSlug(v.title, code);
  const [r] = await ctx.db.insert(jobPostings).values({ ...v, code, slug, createdBy: ctx.user.id }).returning({ id: jobPostings.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "recruit", entity: "job_postings", entityId: r!.id, after: { code, ...v }, ip: ctx.ip });
  return { id: r!.id, code, slug };
}

export async function setJobStatus(ctx: ProtectedContext, input: { id: string; status: JobStatus }) {
  const j = await ctx.db.query.jobPostings.findFirst({ where: eq(jobPostings.id, input.id) });
  if (!j) throw notFound("Không tìm thấy tin tuyển dụng");
  if (!canManageJob(ctx, j.centerId)) throw forbid("Không có quyền");
  await assertCenterTenant(ctx, j.centerId, "Tin tuyển dụng");
  const to = rule(() => jobTransition(j.status as JobStatus, input.status, { deadline: j.deadline, today: todayISO() }));
  const now = new Date();
  await ctx.db.update(jobPostings).set({ status: to, ...(to === "open" && !j.openedAt ? { openedAt: now } : {}), ...(to === "closed" ? { closedAt: now } : {}) }).where(eq(jobPostings.id, j.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "recruit", entity: "job_postings", entityId: j.id, before: { status: j.status }, after: { status: to }, ip: ctx.ip });
  return { status: to };
}

/* ------------------------------------------------------------------ */
/* Trang tuyển dụng công khai + nộp hồ sơ                               */
/* ------------------------------------------------------------------ */

export async function publicJobs(db: Database) {
  const today = todayISO();
  return asDb(db).select({
    slug: jobPostings.slug, code: jobPostings.code, title: jobPostings.title, department: jobPostings.department, employmentType: jobPostings.employmentType,
    openings: jobPostings.openings, salaryText: jobPostings.salaryText, salaryMin: jobPostings.salaryMin, salaryMax: jobPostings.salaryMax, deadline: jobPostings.deadline,
    centerName: centers.name, openedAt: jobPostings.openedAt,
  }).from(jobPostings).leftJoin(centers, eq(centers.id, jobPostings.centerId))
    .where(and(eq(jobPostings.status, "open"), or(isNull(jobPostings.deadline), sql`${jobPostings.deadline} >= ${today}`)))
    .orderBy(desc(jobPostings.openedAt));
}
export async function publicJob(db: Database, slug: string) {
  const [j] = await asDb(db).select({ j: jobPostings, centerName: centers.name, centerAddress: centers.address }).from(jobPostings).leftJoin(centers, eq(centers.id, jobPostings.centerId))
    .where(and(eq(jobPostings.slug, slug), eq(jobPostings.status, "open"))).limit(1);
  if (!j) return null;
  const today = todayISO();
  const x = j.j;
  return {
    slug: x.slug, code: x.code, title: x.title, department: DEPARTMENT_VI[x.department as Department] ?? x.department, employmentType: x.employmentType, typeLabel: EMPLOYMENT_TYPE_VI[x.employmentType as EmploymentType],
    openings: x.openings, salaryText: x.salaryText, salaryMin: x.salaryMin, salaryMax: x.salaryMax, deadline: x.deadline, description: x.description,
    requirements: x.requirements, benefits: x.benefits, centerName: j.centerName, centerAddress: j.centerAddress, accepting: !x.deadline || x.deadline >= today,
  };
}

const CV_MAX = 5 * 1024 * 1024;
export const CV_MAX_BYTES = CV_MAX;
function cvKind(name: string, bytes: Uint8Array): "pdf" | "docx" | null {
  const head = Buffer.from(bytes.subarray(0, 5));
  if (/\.pdf$/i.test(name) && head.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (/\.docx$/i.test(name) && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return "docx";
  return null;
}

export async function applyToJob(db: Database, input: { slug: string; fullName: string; phone: string; email?: string | null; note?: string | null; consent: boolean; source?: string | null; cv?: { name: string; bytes: Uint8Array } | null }) {
  const d = asDb(db);
  const j = await d.query.jobPostings.findFirst({ where: eq(jobPostings.slug, input.slug) });
  if (!j || j.status !== "open") return { ok: false as const, status: 404, error: "Tin tuyển dụng không còn nhận hồ sơ" };
  if (j.deadline && j.deadline < todayISO()) return { ok: false as const, status: 410, error: "Đã hết hạn nộp hồ sơ" };
  const errs = validateApplication(input);
  if (errs.length) return { ok: false as const, status: 422, error: errs.join("; ") };
  const pn = normalizeVnPhone(input.phone);
  if (!pn) return { ok: false as const, status: 422, error: "Số điện thoại không hợp lệ" };
  let cv: { key: string; name: string } | null = null;
  if (input.cv) {
    if (input.cv.bytes.byteLength > CV_MAX) return { ok: false as const, status: 413, error: "CV tối đa 5MB" };
    const kind = cvKind(input.cv.name, input.cv.bytes);
    if (!kind) return { ok: false as const, status: 422, error: "CV phải là tệp PDF hoặc DOCX" };
    cv = { key: `docs/cv/${j.id}/${randomUUID()}.${kind}`, name: input.cv.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 100) };
  }
  const dup = await d.query.candidates.findFirst({ where: and(eq(candidates.jobId, j.id), eq(candidates.phoneNormalized, pn)) });
  if (dup) {
    if (cv) {
      await putObject(cv.key, input.cv!.bytes);
      await d.update(candidates).set({ cvKey: cv.key, cvName: cv.name }).where(eq(candidates.id, dup.id));
    }
    await d.insert(candidateEvents).values({ candidateId: dup.id, action: "reapply", note: cv ? "Nộp lại hồ sơ (cập nhật CV)" : "Nộp lại hồ sơ" });
    return { ok: true as const, duplicated: true };
  }
  if (cv) await putObject(cv.key, input.cv!.bytes);
  const now = new Date();
  const [c] = await d.insert(candidates).values({
    jobId: j.id, fullName: input.fullName.trim(), phone: input.phone.replace(/\D/g, ""), phoneNormalized: pn, email: input.email?.trim() || null,
    coverNote: input.note?.trim() || null, cvKey: cv?.key ?? null, cvName: cv?.name ?? null, source: (input.source ?? "website").slice(0, 30), consentAt: now,
  }).returning({ id: candidates.id });
  await d.insert(candidateEvents).values({ candidateId: c!.id, action: "applied", toStage: "applied", note: `Nộp qua ${input.source ?? "website"}` });
  const hrs = await d.select({ u: userRoles.userId }).from(userRoles)
    .where(or(eq(userRoles.role, "HO_HR"), and(eq(userRoles.role, "CENTER_HR"), j.centerId ? eq(userRoles.centerId, j.centerId) : sql`true`)));
  await notify(d, hrs.map((h) => h.u), "Ứng viên mới", `${input.fullName.trim()} — ${j.title}`, `/jobs/${j.id}`, 3, "recruit.candidate");
  return { ok: true as const, duplicated: false };
}

/* ------------------------------------------------------------------ */
/* Ứng viên                                                             */
/* ------------------------------------------------------------------ */

async function loadJobForRead(ctx: ProtectedContext, id: string) {
  const j = await ctx.db.query.jobPostings.findFirst({ where: eq(jobPostings.id, id) });
  if (!j) throw notFound("Không tìm thấy tin tuyển dụng");
  const ids = centersWith(ctx.actor, "recruit:read");
  if (ids !== null && (j.centerId ? !ids.includes(j.centerId) : ids.length === 0)) throw forbid("Không xem được tin này");
  // Tin của cơ sở thuộc trung tâm khác: chặn xem chéo
  await assertCenterTenant(ctx, j.centerId, "Tin tuyển dụng");
  return j;
}

export async function getJob(ctx: ProtectedContext, input: { id: string; stage?: CandidateStage }) {
  const j = await loadJobForRead(ctx, input.id);
  const list = await ctx.db.select({ c: candidates, owner: users.fullName,
    interviews: sql<number>`(select count(*)::int from ${interviews} i where i.candidate_id = ${candidates.id} and i.cancelled_at is null)`,
    avgScore: sql<number | null>`(select round(avg(i.score)::numeric, 1)::float from ${interviews} i where i.candidate_id = ${candidates.id} and i.score is not null)`,
  }).from(candidates).leftJoin(users, eq(users.id, candidates.ownerId))
    .where(and(eq(candidates.jobId, j.id), input.stage ? eq(candidates.stage, input.stage) : sql`true`)).orderBy(desc(candidates.createdAt));
  const counts = Object.fromEntries(CANDIDATE_STAGES.map((s) => [s, 0])) as Record<CandidateStage, number>;
  const [allCounts] = await ctx.db.select({ m: sql<Record<string, number>>`coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)` })
    .from(sql`(select stage, count(*)::int as n from candidates where job_id = ${j.id} group by stage) x`);
  Object.assign(counts, allCounts?.m ?? {});
  const [ctr] = j.centerId ? await ctx.db.select({ code: centers.code, name: centers.name }).from(centers).where(eq(centers.id, j.centerId)) : [null];
  return {
    ...j, center: ctr ?? null, statusLabel: JOB_STATUS_VI[j.status as JobStatus], typeLabel: EMPLOYMENT_TYPE_VI[j.employmentType as EmploymentType],
    canEdit: canManageJob(ctx, j.centerId), counts,
    candidates: list.map((x) => ({
      id: x.c.id, fullName: x.c.anonymizedAt ? ANON_NAME : x.c.fullName, phone: maskPhone(x.c.phoneNormalized), stage: x.c.stage, stageLabel: CANDIDATE_STAGE_VI[x.c.stage as CandidateStage],
      source: x.c.source, owner: x.owner, createdAt: x.c.createdAt, lastStageAt: x.c.lastStageAt, hasCv: !!x.c.cvKey, interviews: x.interviews, avgScore: x.avgScore, rating: x.c.rating,
    })),
  };
}

async function loadCandidate(ctx: ProtectedContext, id: string) {
  const c = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, id) });
  if (!c) throw notFound("Không tìm thấy ứng viên");
  const j = await ctx.db.query.jobPostings.findFirst({ where: eq(jobPostings.id, c.jobId) });
  // Hồ sơ ứng viên đi theo tin tuyển dụng → theo cơ sở → theo trung tâm (tenant)
  await assertCenterTenant(ctx, j?.centerId ?? null, "Hồ sơ ứng viên");
  return { c, j: j! };
}
/** Người phỏng vấn được xem hồ sơ ứng viên mình phỏng vấn */
async function isInterviewer(db: Db, candidateId: string, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(interviews).where(and(eq(interviews.candidateId, candidateId), eq(interviews.interviewerId, userId)));
  return (r?.n ?? 0) > 0;
}

export async function getCandidate(ctx: ProtectedContext, id: string) {
  const { c, j } = await loadCandidate(ctx, id);
  const reader = can(ctx, "recruit:read", j.centerId);
  const interviewer = await isInterviewer(ctx.db, c.id, ctx.user.id);
  if (!reader && !interviewer) throw forbid("Không xem được hồ sơ này");
  const manage = can(ctx, "recruit:update", j.centerId);
  const events = await ctx.db.select({ e: candidateEvents, by: users.fullName }).from(candidateEvents).leftJoin(users, eq(users.id, candidateEvents.userId))
    .where(eq(candidateEvents.candidateId, c.id)).orderBy(asc(candidateEvents.createdAt));
  const ivs = await ctx.db.select({ i: interviews, by: users.fullName }).from(interviews).leftJoin(users, eq(users.id, interviews.interviewerId))
    .where(eq(interviews.candidateId, c.id)).orderBy(asc(interviews.scheduledAt));
  const scored = ivs.filter((x) => x.i.scoredAt).length;
  const next = (CANDIDATE_STAGES as readonly CandidateStage[]).filter((s) => {
    try { candidateTransition(c.stage as CandidateStage, s, { reason: "xxxxx", interviewsScored: scored }); return true; } catch { return false; }
  });
  const interviewers = manage ? await ctx.db.select({ id: users.id, name: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_HR", "HO_HR", "TRAINING", "TEACHER", "SUPER_ADMIN"]), j.centerId ? or(eq(userRoles.centerId, j.centerId), isNull(userRoles.centerId)) : sql`true`))
    .groupBy(users.id, users.fullName).orderBy(asc(users.fullName)) : [];
  return {
    id: c.id, job: { id: j.id, title: j.title, code: j.code, centerId: j.centerId, department: j.department, employmentType: j.employmentType },
    fullName: c.anonymizedAt ? ANON_NAME : c.fullName, phone: manage ? c.phone : maskPhone(c.phoneNormalized), email: manage ? c.email : c.email ? "•••" : null,
    coverNote: c.coverNote, source: c.source, stage: c.stage, stageLabel: CANDIDATE_STAGE_VI[c.stage as CandidateStage], stageReason: c.stageReason, rating: c.rating,
    consentAt: c.consentAt, createdAt: c.createdAt, hiredStaffId: c.hiredStaffId, anonymized: !!c.anonymizedAt,
    cvUrl: c.cvKey && !c.anonymizedAt ? signedFileUrl(c.cvKey, c.cvName ?? "cv", 600, true) : null,
    nextStages: manage ? next.map((s) => ({ key: s, label: CANDIDATE_STAGE_VI[s] })) : [],
    events: events.map((x) => ({ ...x.e, by: x.by })),
    interviews: ivs.map((x) => ({ ...x.i, by: x.by, resultLabel: x.i.result ? INTERVIEW_RESULT_VI[x.i.result as InterviewResult] : null, canScore: x.i.interviewerId === ctx.user.id && !x.i.cancelledAt })),
    interviewers, can: { manage, hire: manage && c.stage === "offer" && can(ctx, "recruit:update", j.centerId) },
  };
}

export async function moveCandidate(ctx: ProtectedContext, input: { id: string; stage: CandidateStage; reason?: string | null }) {
  const { c, j } = await loadCandidate(ctx, input.id);
  if (!can(ctx, "recruit:update", j.centerId)) throw forbid("Không có quyền xử lý ứng viên");
  if (input.stage === "hired") throw pre("Dùng chức năng “Nhận việc” để tạo hồ sơ nhân sự");
  if (c.anonymizedAt) throw pre("Hồ sơ đã ẩn danh");
  const [sc] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(interviews).where(and(eq(interviews.candidateId, c.id), sql`${interviews.scoredAt} is not null`));
  const to = rule(() => candidateTransition(c.stage as CandidateStage, input.stage, { reason: input.reason, interviewsScored: sc?.n ?? 0 }));
  await ctx.db.update(candidates).set({ stage: to, stageReason: input.reason?.trim() || null, lastStageAt: new Date(), ownerId: c.ownerId ?? ctx.user.id }).where(eq(candidates.id, c.id));
  await ctx.db.insert(candidateEvents).values({ candidateId: c.id, action: "stage", fromStage: c.stage, toStage: to, note: input.reason?.trim() || null, userId: ctx.user.id });
  return { stage: to };
}

export async function scheduleInterview(ctx: ProtectedContext, input: { candidateId: string; scheduledAt: string; durationMin: number; interviewerId: string; location?: string | null }) {
  const { c, j } = await loadCandidate(ctx, input.candidateId);
  if (!can(ctx, "recruit:update", j.centerId)) throw forbid("Không có quyền xếp lịch phỏng vấn");
  if (!["applied", "screening", "interview"].includes(c.stage)) throw pre("Ứng viên không ở giai đoạn phỏng vấn");
  const at = new Date(input.scheduledAt);
  const errs = validateInterview({ scheduledAt: at, durationMin: input.durationMin, now: new Date() });
  if (errs.length) throw bad(errs);
  const iv = await ctx.db.query.users.findFirst({ where: eq(users.id, input.interviewerId) });
  if (!iv?.isActive) throw bad("Người phỏng vấn không hợp lệ");
  const end = new Date(at.getTime() + input.durationMin * 60_000);
  const [clash] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(interviews).where(and(
    eq(interviews.interviewerId, input.interviewerId), isNull(interviews.cancelledAt),
    sql`${interviews.scheduledAt} < ${end.toISOString()}::timestamptz and ${interviews.scheduledAt} + (${interviews.durationMin} || ' minutes')::interval > ${at.toISOString()}::timestamptz`,
  ));
  if ((clash?.n ?? 0) > 0) throw pre("Người phỏng vấn đã có lịch phỏng vấn trùng giờ");
  const t = await ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, input.interviewerId) });
  const [r] = await ctx.db.insert(interviews).values({ candidateId: c.id, scheduledAt: at, durationMin: input.durationMin, interviewerId: input.interviewerId, interviewerTeacherId: t?.id ?? null, location: input.location?.trim() || null, createdBy: ctx.user.id }).returning({ id: interviews.id });
  if (c.stage !== "interview") {
    await ctx.db.update(candidates).set({ stage: "interview", lastStageAt: new Date(), ownerId: c.ownerId ?? ctx.user.id }).where(eq(candidates.id, c.id));
    await ctx.db.insert(candidateEvents).values({ candidateId: c.id, action: "stage", fromStage: c.stage, toStage: "interview", note: "Xếp lịch phỏng vấn", userId: ctx.user.id });
  }
  await ctx.db.insert(candidateEvents).values({ candidateId: c.id, action: "interview", note: `Phỏng vấn ${at.toISOString()} với ${iv.fullName}`, userId: ctx.user.id });
  await notify(ctx.db, [input.interviewerId], "Lịch phỏng vấn", `${c.fullName} — ${j.title}`, `/jobs/candidate/${c.id}`, 2, "recruit.candidate");
  return { id: r!.id };
}

export async function scoreInterview(ctx: ProtectedContext, input: { id: string; score: number; result: InterviewResult; feedback: string }) {
  const i = await ctx.db.query.interviews.findFirst({ where: eq(interviews.id, input.id) });
  if (!i) throw notFound("Không tìm thấy buổi phỏng vấn");
  if (i.interviewerId !== ctx.user.id) throw forbid("Chỉ người phỏng vấn chấm điểm");
  if (i.cancelledAt) throw pre("Buổi phỏng vấn đã huỷ");
  if (i.scheduledAt.getTime() > Date.now() + 15 * 60_000) throw pre("Chưa đến giờ phỏng vấn");
  const errs = validateScore(input);
  if (errs.length) throw bad(errs);
  await ctx.db.update(interviews).set({ score: input.score, result: input.result, feedback: input.feedback.trim(), scoredAt: new Date() }).where(eq(interviews.id, i.id));
  await ctx.db.insert(candidateEvents).values({ candidateId: i.candidateId, action: "score", note: `${input.score}/5 — ${INTERVIEW_RESULT_VI[input.result]}`, userId: ctx.user.id });
  const { c } = await loadCandidate(ctx, i.candidateId);
  if (c.ownerId) await notify(ctx.db, [c.ownerId], "Đã chấm phỏng vấn", `${c.fullName}: ${input.score}/5 (${INTERVIEW_RESULT_VI[input.result]})`, `/jobs/candidate/${c.id}`, 3, "recruit.candidate");
  return { ok: true };
}

export async function cancelInterview(ctx: ProtectedContext, input: { id: string }) {
  const i = await ctx.db.query.interviews.findFirst({ where: eq(interviews.id, input.id) });
  if (!i) throw notFound("Không tìm thấy buổi phỏng vấn");
  const { j } = await loadCandidate(ctx, i.candidateId);
  if (!can(ctx, "recruit:update", j.centerId)) throw forbid("Không có quyền");
  if (i.scoredAt) throw pre("Buổi đã chấm — không huỷ");
  await ctx.db.update(interviews).set({ cancelledAt: new Date() }).where(eq(interviews.id, i.id));
  await ctx.db.insert(candidateEvents).values({ candidateId: i.candidateId, action: "interview_cancel", note: "Huỷ lịch phỏng vấn", userId: ctx.user.id });
  return { ok: true };
}

/** Nhận việc → tạo hồ sơ nhân sự thử việc */
export async function hireCandidate(ctx: ProtectedContext, input: { id: string; centerId: string; title: string; department: Department; hiredAt: string }) {
  const { c, j } = await loadCandidate(ctx, input.id);
  if (!can(ctx, "recruit:update", j.centerId)) throw forbid("Không có quyền");
  await assertCenterTenant(ctx, input.centerId);
  if (c.stage !== "offer") throw pre("Chỉ nhận việc ứng viên đã được đề nghị");
  const r = await upsertStaff(ctx, {
    fullName: c.fullName, email: c.email, phone: c.phone, centerId: input.centerId, department: input.department, title: input.title,
    employmentType: j.employmentType as EmploymentType, hiredAt: input.hiredAt, annualLeaveDays: 12, notes: `Tuyển dụng ${j.code}`,
  });
  const staffId = (r as { id: string }).id;
  // Nhận việc = phát sinh QUAN HỆ LAO ĐỘNG (trạng thái hợp đồng) và chuyển hồ sơ ứng viên
  // thành hồ sơ nhân sự. Gói chung một transaction và ghi nhật ký ngay trong đó.
  let autoClosed = false;
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(candidates).set({ stage: "hired", hiredStaffId: staffId, lastStageAt: new Date() }).where(eq(candidates.id, c.id));
    await tx.insert(candidateEvents).values({ candidateId: c.id, action: "stage", fromStage: "offer", toStage: "hired", note: `Tạo hồ sơ nhân sự`, userId: ctx.user.id });
    const [hired] = await tx.select({ n: sql<number>`count(*)::int` }).from(candidates).where(and(eq(candidates.jobId, j.id), eq(candidates.stage, "hired")));
    if ((hired?.n ?? 0) >= j.openings && j.status === "open") {
      await tx.update(jobPostings).set({ status: "closed", closedAt: new Date() }).where(eq(jobPostings.id, j.id));
      autoClosed = true;
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "TRANSITION", module: "recruit", entity: "candidates", entityId: c.id,
      before: { stage: c.stage }, after: { stage: "hired", staffId, centerId: input.centerId, title: input.title, department: input.department, hiredAt: input.hiredAt, jobAutoClosed: autoClosed },
      ip: ctx.ip,
    });
  });
  return { staffId, autoClosed };
}

export async function revealCandidate(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const { c, j } = await loadCandidate(ctx, input.id);
  if (!can(ctx, "recruit:read", j.centerId)) throw forbid("Không có quyền");
  if (input.reason.trim().length < 5) throw bad("Ghi lý do xem thông tin liên hệ");
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "recruit", entity: "candidates", entityId: c.id, reason: input.reason.trim(), ip: ctx.ip });
  return { phone: c.phone, email: c.email };
}

/** Ẩn danh hồ sơ không trúng tuyển quá 12 tháng */
export async function candidateRetention(db: Database, opts: { dryRun: boolean }) {
  const d = asDb(db);
  const cutoff = retentionCutoff(todayISO(), CANDIDATE_RETENTION_MONTHS);
  const due = await d.select({ id: candidates.id }).from(candidates)
    .where(and(inArray(candidates.stage, ["rejected", "withdrawn"]), isNull(candidates.anonymizedAt), lt(candidates.lastStageAt, new Date(`${cutoff}T00:00:00+07:00`)))).limit(500);
  if (opts.dryRun || !due.length) return { cutoff, count: due.length };
  for (const x of due) {
    await d.update(candidates).set({ fullName: ANON_NAME, phone: anonymizedPhone(x.id), phoneNormalized: anonymizedPhone(x.id), email: null, coverNote: null, cvKey: null, cvName: null, anonymizedAt: new Date() }).where(eq(candidates.id, x.id));
  }
  return { cutoff, count: due.length };
}

export async function recruitReport(ctx: ProtectedContext) {
  const ids = centersWith(ctx.actor, "recruit:read");
  if (ids !== null && ids.length === 0) throw forbid("Không có quyền");
  // Tin của cơ sở thuộc trung tâm khác không được cộng vào báo cáo
  const scope = sql`${scopeSql(sql`j.center_id`, ids)} and (j.center_id is null or exists (select 1 from centers tc where tc.id = j.center_id and ${tenantSql(ctx, "tc")}))`;
  const [r] = (await ctx.db.execute(sql`
    select count(*)::int as total,
      count(*) filter (where c.stage = 'hired')::int as hired,
      count(*) filter (where c.stage in ('applied'))::int as fresh,
      count(*) filter (where c.stage = 'applied' and c.created_at < now() - interval '3 days')::int as stale,
      coalesce(round(avg(extract(epoch from (c.last_stage_at - c.created_at)) / 86400) filter (where c.stage = 'hired'))::int, 0) as days_to_hire
    from candidates c join job_postings j on j.id = c.job_id where ${scope}`)) as unknown as { total: number; hired: number; fresh: number; stale: number; days_to_hire: number }[];
  const bySource = (await ctx.db.execute(sql`
    select c.source, count(*)::int as n, count(*) filter (where c.stage = 'hired')::int as hired
    from candidates c join job_postings j on j.id = c.job_id where ${scope} group by 1 order by 2 desc`)) as unknown as { source: string; n: number; hired: number }[];
  return { totals: r ?? { total: 0, hired: 0, fresh: 0, stale: 0, days_to_hire: 0 }, bySource };
}
