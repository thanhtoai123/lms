/**
 * QUẢN LÝ HỒ SƠ HỌC TẬP THEO CHUẨN THÔNG TIN (trang `/ho-so-hoc-tap`, docs/HO-SO-HOC-TAP.md).
 *
 * Quản trị theo dõi TỶ LỆ ĐẠT CHUẨN thay vì đọc từng phiếu:
 *  - "phiếu kỳ vọng" = mỗi học viên có mặt / đi muộn / học bù ở mỗi buổi đã diễn ra (từ mốc bật tính năng);
 *  - phiếu ĐÃ TỚI HẠN = đã phát hành hoặc đã qua hạn hoàn thiện (`sheetDeadlineHours` sau giờ kết thúc buổi);
 *  - ĐỦ CHUẨN = đã phát hành + mục tiêu bài (nếu bắt buộc) + nhận xét ≥ `remarkMinLength` + sản phẩm (nếu bắt buộc);
 *  - ĐÚNG HẠN = phát hành trước hạn;
 *  - học bạ mốc QUÁ HẠN = qua `milestoneDeadlineDays` sau buổi mốc mà chưa nộp.
 * Cùng quy tắc với hàm thuần `evaluateSheetCompliance` (packages/core/src/portfolio/standard.ts).
 *
 * Mọi con số tổng hợp bằng SQL (`count(*) filter (...)`, `group by`) — không tải bảng về JS.
 * Phạm vi: `tenantSql` trên buổi học + cơ sở người xem có quyền `report_card:read` (không tính quyền `_own`).
 * Nhắc GV: quyền `report_card:approve` tại cơ sở của buổi; gửi qua cổng thông báo (`notify`), ghi nhật ký trong transaction.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { sessions, classes, teachers, centers, courses } from "@satarobo/db";
import {
  authorize, authorizeGlobal, sessionLabel, evaluateSheetCompliance, portfolioComplianceScore, sessionEvidenceViolation, fmtDeadlineVi,
  toISODate, addDays, COMPLIANCE_WARN_PCT, SHEET_VIOLATION_VI,
  type Permission, type PortfolioStandard, type ObjectiveResult, type SessionEvalStatus, type SheetViolationCode,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantSql, tenantCond, assertTenant } from "./tenantScope";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { portfolioSettings } from "./sessionEvaluations";
import { loadStandards, standardOf, perCenter, sheetDeadlineSql, milestoneDeadlineSql, type StandardSet } from "./portfolioStandardConfig";
import { loadStudentForStaff } from "./portfolio";

type Db = ProtectedContext["db"];
const asDb = (d: unknown) => d as Db;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayLocal() {
  return toISODate(new Date(Date.now() + 7 * 3600e3));
}

/** Cơ sở người dùng được xem theo một quyền (null = mọi cơ sở). Quyền `_own` không tính */
function scopeCenters(ctx: ProtectedContext, perm: Permission): string[] | null {
  if (authorizeGlobal(ctx.actor, perm)) return null;
  const ids = new Set<string>();
  for (const a of ctx.actor.assignments) if (a.centerId) ids.add(a.centerId);
  for (const g of ctx.actor.extraPermissions ?? []) if (g.centerId) ids.add(g.centerId);
  return [...ids].filter((id) => authorize(ctx.actor, perm, { centerId: id }).allowed);
}

const idList = (ids: readonly string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const rows = <T>(r: unknown) => r as unknown as T[];

export interface ComplianceFilter {
  centerId?: string | null;
  courseId?: string | null;
  classId?: string | null;
  teacherId?: string | null;
  from?: string | null;
  to?: string | null;
}

function normFilter(f: ComplianceFilter) {
  const today = todayLocal();
  const to = f.to && ISO_RE.test(f.to) ? f.to : today;
  const from = f.from && ISO_RE.test(f.from) ? f.from : addDays(to, -30);
  const id = (x: string | null | undefined) => (x && UUID_RE.test(x) ? x : null);
  return { from: from <= to ? from : to, to, centerId: id(f.centerId), courseId: id(f.courseId), classId: id(f.classId), teacherId: id(f.teacherId) };
}

/**
 * CTE "flag": mỗi dòng là một phiếu kỳ vọng (HV có mặt × buổi) kèm cờ tới hạn / đủ chuẩn / đúng hạn / bằng chứng.
 * `extra` = điều kiện thêm trên bí danh s (buổi), c (lớp), e (ghi danh).
 */
function flagCte(ctx: ProtectedContext, stds: StandardSet, extra: SQL, since: string | null): SQL {
  const c = sql.raw("c.center_id");
  return sql`
    exp as (
      select s.id as session_id, s.date, s.sequence_no, s.kind, s.original_sequence_no, s.start_time, s.end_time,
             coalesce(s.teacher_id, c.lead_teacher_id) as teacher_id, c.id as class_id, c.code as class_code, c.name as class_name, c.center_id, c.course_id,
             a.enrollment_id, e.student_id,
             se.id as eval_id, se.status as ev_status, se.objective_result, se.remark, se.product_note, se.media_ids, se.published_at, se.snapshot,
             ${sheetDeadlineSql(sql.raw("s.date"), sql.raw("s.end_time"), c, stds)} as deadline,
             ${perCenter(c, stds, (x) => x.remarkMinLength)} as remark_min,
             ${perCenter(c, stds, (x) => x.requireObjectiveResult)} as req_obj,
             ${perCenter(c, stds, (x) => x.requireProductNote)} as req_prod,
             ${perCenter(c, stds, (x) => x.minEvidenceRatePct)} as evid_pct,
             ${perCenter(c, stds, (x) => x.profileMinSheetPct)} as profile_pct
        from sessions s
        join classes c on c.id = s.class_id
        join attendance a on a.session_id = s.id and a.status in ('present','late','makeup')
        join enrollments e on e.id = a.enrollment_id
        left join session_evaluations se on se.session_id = s.id and se.enrollment_id = a.enrollment_id
       where ${tenantSql(ctx, "s")}
         and s.status in ('in_progress','attendance_done','notes_done','completed')
         and s.date <= ${todayLocal()}::date
         ${since ? sql`and s.date >= ${since}::date` : sql``}
         and ${extra}
    ),
    flag as (
      -- coalesce(…, false): HV chưa có phiếu (ev_status null) không được để cờ thành null
      select exp.*,
             coalesce(ev_status = 'published', false) as published,
             coalesce(ev_status = 'published', false) or now() > deadline as due,
             coalesce(ev_status = 'published' and published_at <= deadline, false) as on_time,
             coalesce(ev_status = 'published'
               and (not req_obj or objective_result is not null)
               and coalesce(length(btrim(remark)), 0) >= remark_min
               and (not req_prod or coalesce(length(btrim(product_note)), 0) > 0), false) as content_ok,
             (coalesce(cardinality(media_ids), 0) > 0 or coalesce(length(btrim(product_note)), 0) > 0) as has_evidence
        from exp
    )`;
}

/** Điều kiện lọc chung (bí danh s / c) theo phạm vi quyền + bộ lọc */
function filterSql(scope: string[] | null, f: ReturnType<typeof normFilter>): SQL {
  const parts: SQL[] = [sql`s.date between ${f.from}::date and ${f.to}::date`];
  if (scope !== null) parts.push(scope.length ? sql`c.center_id in (${idList(scope)})` : sql`false`);
  if (f.centerId) parts.push(sql`c.center_id = ${f.centerId}::uuid`);
  if (f.courseId) parts.push(sql`c.course_id = ${f.courseId}::uuid`);
  if (f.classId) parts.push(sql`c.id = ${f.classId}::uuid`);
  if (f.teacherId) parts.push(sql`coalesce(s.teacher_id, c.lead_teacher_id) = ${f.teacherId}::uuid`);
  return sql.join(parts, sql` and `);
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

interface GroupRow {
  id: string | null; name: string | null; code: string | null; sessions: number; due: number; content_ok: number; on_time: number; late: number; missing: number;
  bad_sessions: string[] | null;
}

interface ViolationRow {
  session_id: string; date: string; sequence_no: number; kind: string; original_sequence_no: number | null; class_code: string; center_id: string;
  student_id: string; student_name: string; teacher_id: string | null; teacher_name: string | null;
  ev_status: string | null; objective_result: string | null; remark: string | null; product_note: string | null;
  published_ms: number | null; deadline_ms: number; missing_criteria: string[] | null;
}

/** Trang "Quản lý hồ sơ học tập": 4 thẻ số, bảng theo GV / lớp, danh sách vi phạm */
export async function complianceBoard(ctx: ProtectedContext, input: ComplianceFilter & { violationsLimit?: number }) {
  requirePermission(ctx, "report_card:read");
  const scope = scopeCenters(ctx, "report_card:read");
  if (scope !== null && !scope.length) throw new TRPCError({ code: "FORBIDDEN", message: "Bạn chưa có quyền xem học bạ ở cơ sở nào" });
  const f = normFilter(input);
  const [stds, cfg] = await Promise.all([loadStandards(ctx.db), portfolioSettings(ctx.db)]);
  const cte = flagCte(ctx, stds, filterSql(scope, f), cfg.since);

  const [sum] = rows<{ expected: number; due: number; on_time: number; content_ok: number; pending: number; sessions: number }>(await ctx.db.execute(sql`
    with ${cte}
    select count(*)::int as expected,
           count(*) filter (where due)::int as due,
           count(*) filter (where due and on_time)::int as on_time,
           count(*) filter (where due and content_ok)::int as content_ok,
           count(*) filter (where not due)::int as pending,
           count(distinct session_id)::int as sessions
      from flag`));

  const [prof] = rows<{ students: number; ok: number }>(await ctx.db.execute(sql`
    with ${cte}
    select count(*)::int as students, count(*) filter (where ok)::int as ok
      from (select student_id, (count(*) filter (where content_ok) * 100 >= max(profile_pct) * count(*)) as ok
              from flag where due group by student_id) x`));

  // Buổi chưa đạt tỷ lệ bằng chứng (chỉ khi cơ sở đặt ngưỡng > 0)
  const evid = rows<{ session_id: string; present: number; with_evidence: number; center_id: string }>(await ctx.db.execute(sql`
    with ${cte}
    select session_id, center_id, count(*)::int as present, count(*) filter (where has_evidence)::int as with_evidence
      from flag where due and evid_pct > 0
     group by session_id, center_id, evid_pct
    having count(*) filter (where has_evidence) * 100 < max(evid_pct) * count(*)
     limit 200`));

  // Học bạ mốc quá hạn: buổi mốc trong khoảng lọc, qua hạn mà học bạ chưa nộp
  const msDeadline = milestoneDeadlineSql(sql.raw("s.date"), sql.raw("c.center_id"), stds);
  const [ms] = rows<{ overdue: number; due: number }>(await ctx.db.execute(sql`
    select count(*) filter (where now() > ${msDeadline} and rc.id is null)::int as overdue,
           count(*) filter (where now() > ${msDeadline})::int as due
      from sessions s
      join classes c on c.id = s.class_id
      join lessons l on l.id = s.lesson_id and l.is_report_card_milestone
      join enrollments e on e.class_id = c.id and e.status in ('active','trial') and e.start_sequence_no <= s.sequence_no
      left join report_cards rc on rc.enrollment_id = e.id and rc.milestone_seq = s.sequence_no and rc.status in ('submitted','approved','published')
     where ${tenantSql(ctx, "s")} and s.status not in ('cancelled','rescheduled') and ${filterSql(scope, f)}`));

  const group = async (by: "teacher" | "class") => rows<GroupRow>(await ctx.db.execute(sql`
    with ${cte}
    select ${by === "teacher" ? sql`g.teacher_id as id, t.full_name as name, null::text as code` : sql`g.class_id as id, g.class_name as name, g.class_code as code`},
           count(distinct g.session_id)::int as sessions,
           count(*) filter (where g.due)::int as due,
           count(*) filter (where g.due and g.content_ok)::int as content_ok,
           count(*) filter (where g.due and g.on_time)::int as on_time,
           count(*) filter (where g.due and not g.on_time)::int as late,
           count(*) filter (where g.due and not g.published)::int as missing,
           (array_agg(distinct g.session_id) filter (where g.due and (not g.content_ok or not g.on_time)))[1:30]::text[] as bad_sessions
      from flag g
      ${by === "teacher" ? sql`left join teachers t on t.id = g.teacher_id` : sql``}
     group by ${by === "teacher" ? sql`g.teacher_id, t.full_name` : sql`g.class_id, g.class_name, g.class_code`}
     order by (count(*) filter (where g.due and g.content_ok))::float8 / nullif(count(*) filter (where g.due), 0) asc nulls last, 2 asc
     limit 300`));
  const [byTeacher, byClass] = await Promise.all([group("teacher"), group("class")]);

  const vLimit = Math.min(500, Math.max(10, input.violationsLimit ?? 200));
  const vrows = rows<ViolationRow>(await ctx.db.execute(sql`
    with ${cte}
    select g.session_id, g.date::text as date, g.sequence_no, g.kind::text as kind, g.original_sequence_no, g.class_code, g.center_id,
           g.student_id, st.full_name as student_name, g.teacher_id, t.full_name as teacher_name,
           g.ev_status::text as ev_status, g.objective_result, g.remark, g.product_note,
           (extract(epoch from g.published_at) * 1000)::float8 as published_ms,
           (extract(epoch from g.deadline) * 1000)::float8 as deadline_ms,
           (select coalesce(array_agg(x ->> 'label'), '{}'::text[])
              from jsonb_array_elements(case when jsonb_typeof(g.snapshot -> 'criteria') = 'array' then g.snapshot -> 'criteria' else '[]'::jsonb end) x
             where x -> 'value' is null or jsonb_typeof(x -> 'value') = 'null') as missing_criteria
      from flag g
      join students st on st.id = g.student_id
      left join teachers t on t.id = g.teacher_id
     where g.due and (not g.content_ok or not g.on_time)
     order by g.deadline asc, st.full_name asc
     limit ${vLimit}`));

  const now = new Date();
  const violations = vrows.map((r) => {
    const std = standardOf(stds, r.center_id);
    const c = evaluateSheetCompliance({
      status: (r.ev_status as SessionEvalStatus | null) ?? null,
      missingCriteria: r.missing_criteria ?? [],
      objectiveResult: (r.objective_result as ObjectiveResult | null) ?? null,
      remark: r.remark, productNote: r.product_note,
      publishedAt: r.published_ms != null ? new Date(r.published_ms) : null,
      deadline: new Date(r.deadline_ms),
    }, std, now);
    return {
      key: `${r.session_id}:${r.student_id}`,
      sessionId: r.session_id, studentId: r.student_id, studentName: r.student_name, classCode: r.class_code,
      label: sessionLabel(r.sequence_no, r.kind as Parameters<typeof sessionLabel>[1], r.original_sequence_no), date: r.date,
      teacherId: r.teacher_id, teacherName: r.teacher_name,
      deadline: new Date(r.deadline_ms).toISOString(), deadlineLabel: fmtDeadlineVi(new Date(r.deadline_ms)),
      codes: c.violations.map((v) => v.code) as SheetViolationCode[],
      messages: c.violations.map((v) => v.message),
    };
  });
  const sessionIssues = evid.map((e) => ({ sessionId: e.session_id, message: sessionEvidenceViolation({ present: e.present, withEvidence: e.with_evidence }, standardOf(stds, e.center_id)) }))
    .filter((x): x is { sessionId: string; message: string } => !!x.message);

  const mapGroup = (g: GroupRow) => {
    const rate = pct(g.content_ok, g.due);
    return {
      id: g.id, name: g.name ?? (g.id ? "—" : "Chưa gán giáo viên"), code: g.code, sessions: g.sessions, due: g.due, contentOk: g.content_ok,
      onTime: g.on_time, late: g.late, missing: g.missing, rate, onTimeRate: pct(g.on_time, g.due),
      warn: rate != null && rate < COMPLIANCE_WARN_PCT, badSessions: g.bad_sessions ?? [],
    };
  };
  const s0 = sum ?? { expected: 0, due: 0, on_time: 0, content_ok: 0, pending: 0, sessions: 0 };
  return {
    filter: f,
    standard: stds.global,
    overrides: stds.byCenter.size,
    cards: {
      onTimeRate: pct(s0.on_time, s0.due), onTime: s0.on_time,
      contentRate: pct(s0.content_ok, s0.due), contentOk: s0.content_ok,
      due: s0.due, pending: s0.pending, expected: s0.expected, sessions: s0.sessions,
      milestoneOverdue: ms?.overdue ?? 0, milestoneDue: ms?.due ?? 0,
      profilesOk: prof?.ok ?? 0, profiles: prof?.students ?? 0, profileRate: pct(prof?.ok ?? 0, prof?.students ?? 0),
    },
    byTeacher: byTeacher.map(mapGroup),
    byClass: byClass.map(mapGroup),
    violations,
    violationsTruncated: vrows.length >= vLimit,
    sessionIssues,
    violationLabels: SHEET_VIOLATION_VI,
    canRemind: scope === null ? authorizeGlobal(ctx.actor, "report_card:approve") || authorize(ctx.actor, "report_card:approve").allowed : scope.some((id) => authorize(ctx.actor, "report_card:approve", { centerId: id }).allowed),
  };
}

/** Bộ chọn cho bộ lọc (cơ sở, khoá, lớp, GV) trong phạm vi quyền */
export async function complianceOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "report_card:read");
  const scope = scopeCenters(ctx, "report_card:read");
  const inScope = (col: AnyPgColumn) => (scope === null ? sql`true` : scope.length ? inArray(col, scope) : sql`false`);
  const [cs, crs, cls, ts] = await Promise.all([
    ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(tenantCond(ctx, centers), inScope(centers.id))).orderBy(centers.code),
    ctx.db.select({ id: courses.id, code: courses.code, name: courses.name }).from(courses).where(tenantCond(ctx, courses)).orderBy(courses.code),
    ctx.db.select({ id: classes.id, code: classes.code, name: classes.name }).from(classes)
      .where(and(tenantCond(ctx, classes), inScope(classes.centerId), sql`${classes.deletedAt} is null`, sql`${classes.status} in ('recruiting','running','completed')`))
      .orderBy(classes.code).limit(500),
    ctx.db.select({ id: teachers.id, name: teachers.fullName }).from(teachers).where(tenantCond(ctx, teachers)).orderBy(teachers.fullName).limit(500),
  ]);
  return { centers: cs, courses: crs, classes: cls, teachers: ts };
}

/* ------------------------------------------------------------------ */
/* Nhắc giáo viên (một nút / hàng loạt)                                 */
/* ------------------------------------------------------------------ */

export async function remindTeachers(ctx: ProtectedContext, input: { sessionIds: string[]; note?: string | null }) {
  const ids = [...new Set(input.sessionIds)].filter((x) => UUID_RE.test(x)).slice(0, 200);
  if (!ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ít nhất một buổi cần nhắc" });
  const [stds, list] = await Promise.all([
    loadStandards(ctx.db),
    ctx.db.select({
      id: sessions.id, tenantId: sessions.tenantId, date: sessions.date, endTime: sessions.endTime, seq: sessions.sequenceNo, kind: sessions.kind,
      originalSequenceNo: sessions.originalSequenceNo, teacherId: sessions.teacherId, leadTeacherId: classes.leadTeacherId,
      centerId: classes.centerId, classCode: classes.code,
      missing: sql<number>`(
        select count(*)::int from attendance a
         where a.session_id = ${sessions.id} and a.status in ('present','late','makeup')
           and not exists (select 1 from session_evaluations se where se.session_id = a.session_id and se.enrollment_id = a.enrollment_id and se.status = 'published'))`,
    }).from(sessions).innerJoin(classes, eq(classes.id, sessions.classId)).where(and(inArray(sessions.id, ids), tenantCond(ctx, sessions))),
  ]);
  for (const s of list) {
    assertTenant(ctx, s, "Buổi học");
    requirePermission(ctx, "report_card:approve", { centerId: s.centerId });
  }
  // Gom theo giáo viên đứng buổi (không có thì GV chủ nhiệm lớp)
  const byTeacher = new Map<string, typeof list>();
  for (const s of list) {
    const t = s.teacherId ?? s.leadTeacherId;
    if (!t) continue;
    byTeacher.set(t, [...(byTeacher.get(t) ?? []), s]);
  }
  const tRows = byTeacher.size
    ? await ctx.db.select({ id: teachers.id, userId: teachers.userId, fullName: teachers.fullName, tenantId: teachers.tenantId }).from(teachers).where(inArray(teachers.id, [...byTeacher.keys()]))
    : [];
  const today = todayLocal();
  const note = input.note?.trim().slice(0, 300) || null;
  const sent: { teacherId: string; name: string; sessions: number }[] = [];
  const skipped: string[] = [];
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    for (const t of tRows) {
      const ss = [...(byTeacher.get(t.id) ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!t.userId) { skipped.push(`${t.fullName} (chưa có tài khoản đăng nhập)`); continue; }
      const lines = ss.slice(0, 8).map((s) => {
        const dl = fmtDeadlineVi(sheetDeadlineOf(s, stds));
        return `• ${s.classCode} · ${sessionLabel(s.seq, s.kind, s.originalSequenceNo)} (${s.date.slice(8, 10)}/${s.date.slice(5, 7)}) — hạn ${dl}${s.missing ? `, ${s.missing} HV chưa có phiếu` : ""}`;
      });
      const more = ss.length > 8 ? `\n… và ${ss.length - 8} buổi khác` : "";
      const key = createHash("sha1").update(ss.map((s) => s.id).sort().join(",")).digest("hex").slice(0, 16);
      const r = await deliverNotifications(tx, [t.userId], {
        title: `Nhắc hoàn thiện phiếu nhận xét: ${ss.length} buổi`,
        body: `${lines.join("\n")}${more}${note ? `\nGhi chú: ${note}` : ""}`,
        link: ss.length === 1 ? `/teacher/sessions/${ss[0]!.id}#can-hoan-thien` : "/teacher",
        priority: 2,
        type: "portfolio.remind",
        dedupeKey: `nhac-phieu:${t.id}:${today}:${key}`,
        tenantId: t.tenantId ?? null,
      });
      if (r.inserted) sent.push({ teacherId: t.id, name: t.fullName, sessions: ss.length });
      else skipped.push(`${t.fullName} (đã nhắc hôm nay)`);
    }
    const noTeacher = list.filter((s) => !(s.teacherId ?? s.leadTeacherId)).length;
    if (noTeacher) skipped.push(`${noTeacher} buổi chưa gán giáo viên`);
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "portfolio_reminders", entityId: null,
      after: { sessions: list.length, sent: sent.map((x) => ({ teacherId: x.teacherId, sessions: x.sessions })), skipped, note },
      reason: "Nhắc giáo viên hoàn thiện phiếu nhận xét theo chuẩn hồ sơ học tập", ip: ctx.ip,
    });
  });
  return { sent, skipped };
}

function sheetDeadlineOf(s: { date: string; endTime: string; centerId: string }, stds: StandardSet): Date {
  const h = standardOf(stds, s.centerId).sheetDeadlineHours;
  return new Date(new Date(`${s.date}T${(s.endTime || "23:59").slice(0, 5)}:00+07:00`).getTime() + h * 3600e3);
}

/* ------------------------------------------------------------------ */
/* Dải "Mức đạt chuẩn hồ sơ" trên hồ sơ một học viên (chỉ nhân sự)      */
/* ------------------------------------------------------------------ */

export async function studentCompliance(ctx: ProtectedContext, studentId: string) {
  const { st, ownerIds, centerId } = await loadStudentForStaff(ctx, studentId);
  requirePermission(ctx, "student:read", { centerId, ownerIds });
  const [stds, cfg] = await Promise.all([loadStandards(ctx.db), portfolioSettings(ctx.db)]);
  const cte = flagCte(ctx, stds, sql`e.student_id = ${st.id}::uuid`, cfg.since);
  const [r] = rows<{ due: number; content_ok: number; on_time: number; evidence: number; expected: number }>(await ctx.db.execute(sql`
    with ${cte}
    select count(*)::int as expected,
           count(*) filter (where due)::int as due,
           count(*) filter (where due and content_ok)::int as content_ok,
           count(*) filter (where due and on_time)::int as on_time,
           count(*) filter (where due and has_evidence)::int as evidence
      from flag`));
  const msDeadline = milestoneDeadlineSql(sql.raw("s.date"), sql.raw("c.center_id"), stds);
  const [m] = rows<{ due: number; on_time: number; overdue: number }>(await ctx.db.execute(sql`
    select count(*) filter (where now() > ${msDeadline} or rc.submitted_at is not null)::int as due,
           count(*) filter (where rc.submitted_at is not null and rc.submitted_at <= ${msDeadline})::int as on_time,
           count(*) filter (where now() > ${msDeadline} and rc.submitted_at is null)::int as overdue
      from enrollments e
      join classes c on c.id = e.class_id
      join sessions s on s.class_id = c.id and s.sequence_no >= e.start_sequence_no and s.status not in ('cancelled','rescheduled') and s.date <= ${todayLocal()}::date
      join lessons l on l.id = s.lesson_id and l.is_report_card_milestone
      left join report_cards rc on rc.enrollment_id = e.id and rc.milestone_seq = s.sequence_no
     where e.student_id = ${st.id}::uuid and ${tenantSql(ctx, "s")}`));
  const std: PortfolioStandard = standardOf(stds, centerId);
  const counts = {
    sheetsDue: r?.due ?? 0, sheetsContentOk: r?.content_ok ?? 0, sheetsOnTime: r?.on_time ?? 0,
    sessions: r?.due ?? 0, sessionsEvidenceOk: r?.evidence ?? 0,
    milestonesDue: m?.due ?? 0, milestonesOnTime: m?.on_time ?? 0,
  };
  return {
    ...counts,
    expected: r?.expected ?? 0,
    milestonesOverdue: m?.overdue ?? 0,
    score: portfolioComplianceScore(counts, std),
    threshold: std.profileMinSheetPct,
  };
}
