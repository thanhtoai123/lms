import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { trainingCompletions, userRoles, users } from "@satarobo/db";
import {
  authorize, modulesForRoles, gradeQuiz, publicModule, trainingStatus, preflightSummary, TRAINING_MODULES, PREFLIGHT_CHECKS,
  type Role, type PreflightKey,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { assertCenterTenant } from "./tenantScope";

type Db = ProtectedContext["db"];
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

/* ------------------------------------------------------------------ */
/* Bài hướng dẫn                                                        */
/* ------------------------------------------------------------------ */

export async function myTraining(ctx: ProtectedContext) {
  const roles = [...new Set(ctx.actor.assignments.map((a) => a.role))] as Role[];
  const done = await ctx.db.select().from(trainingCompletions).where(eq(trainingCompletions.userId, ctx.user.id));
  const mine = modulesForRoles(roles);
  const others = TRAINING_MODULES.filter((m) => !mine.includes(m));
  const view = (m: (typeof TRAINING_MODULES)[number], required: boolean) => {
    const d = done.find((x) => x.moduleKey === m.key);
    return { ...publicModule(m), required, completedAt: d?.completedAt ?? null };
  };
  return { required: mine.map((m) => view(m, true)), others: others.map((m) => view(m, false)), doneCount: mine.filter((m) => done.some((d) => d.moduleKey === m.key)).length };
}

export async function completeModule(ctx: ProtectedContext, input: { key: string; answers: number[] }) {
  const m = TRAINING_MODULES.find((x) => x.key === input.key);
  if (!m) throw bad("Bài không tồn tại");
  const g = gradeQuiz(m, input.answers);
  if (!g.passed) return { passed: false as const, wrong: g.wrong };
  await ctx.db.insert(trainingCompletions).values({ userId: ctx.user.id, moduleKey: m.key })
    .onConflictDoUpdate({ target: [trainingCompletions.userId, trainingCompletions.moduleKey], set: { completedAt: new Date(), attempts: sql`${trainingCompletions.attempts} + 1` } });
  return { passed: true as const, wrong: [] as number[] };
}

/** Tiến độ học của nhân sự có vai trò tại cơ sở (không tính tài khoản Hội sở) */
export async function centerTraining(db: Db, centerId: string) {
  const rows = await db.select({ userId: userRoles.userId, role: userRoles.role, name: users.fullName })
    .from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.centerId, centerId), eq(users.isActive, true), isNull(users.lockedAt)));
  const ids = [...new Set(rows.map((r) => r.userId))];
  const done = ids.length ? await db.select({ userId: trainingCompletions.userId, key: trainingCompletions.moduleKey }).from(trainingCompletions).where(inArray(trainingCompletions.userId, ids)) : [];
  const staff = ids.map((id) => {
    const roles = rows.filter((r) => r.userId === id).map((r) => r.role as Role);
    return { userId: id, name: rows.find((r) => r.userId === id)!.name, roles, required: modulesForRoles(roles).map((m) => m.key), done: done.filter((d) => d.userId === id).map((d) => d.key) };
  });
  return trainingStatus(staff);
}

/* ------------------------------------------------------------------ */
/* Kiểm tra dữ liệu trước pilot                                         */
/* ------------------------------------------------------------------ */

export async function preflightCounts(db: Db, centerId: string): Promise<Record<PreflightKey, number>> {
  const c = sql`${centerId}::uuid`;
  const r = (await db.execute(sql`
    select
      (select count(*)::int from rooms r where r.center_id = ${c} and r.is_active) = 0 as "noRooms0",
      (select count(*)::int from user_roles ur join users u on u.id = ur.user_id where ur.role = 'CENTER_MANAGER' and ur.center_id = ${c} and u.is_active and u.locked_at is null) as managers,
      (select count(*)::int from user_roles ur join users u on u.id = ur.user_id where ur.role in ('CENTER_ACCOUNTANT','HO_ACCOUNTANT') and (ur.center_id = ${c} or ur.center_id is null) and u.is_active and u.locked_at is null) as accountants,
      (select count(*)::int from students s where s.home_center_id = ${c} and s.status in ('active','trial') and s.deleted_at is null
         and not exists (select 1 from student_guardians g where g.student_id = s.id)) as "studentsNoGuardian",
      (select count(*)::int from classes cl where cl.center_id = ${c} and cl.status in ('running','recruiting') and cl.lead_teacher_id is null) as "classesNoTeacher",
      (select count(*)::int from classes cl where cl.center_id = ${c} and cl.status = 'running'
         and not exists (select 1 from sessions s where s.class_id = cl.id and s.date >= current_date and s.status in ('scheduled','in_progress'))) as "classesNoSessions",
      (select count(*)::int from sessions s join classes cl on cl.id = s.class_id where cl.center_id = ${c} and s.date between current_date and current_date + 7
         and s.status in ('scheduled','in_progress') and s.teacher_id is null) as "sessionsNoTeacher",
      (select count(distinct p.id)::int from parents p join student_guardians g on g.parent_id = p.id join students s on s.id = g.student_id
         where s.home_center_id = ${c} and s.status in ('active','trial','paused') and p.deleted_at is null and p.phone !~ '^84[0-9]{9}$') as "parentsBadPhone",
      (select count(*)::int from enrollments e join classes cl on cl.id = e.class_id where cl.center_id = ${c} and e.status = 'active'
         and not exists (select 1 from orders o where o.enrollment_id = e.id and o.status <> 'cancelled')) as "enrollmentsNoOrder",
      (select count(*)::int from enrollments e join classes cl on cl.id = e.class_id where cl.center_id = ${c} and e.status in ('active','trial','paused')
         and e.carried_sessions + (select count(*) from attendance a where a.enrollment_id = e.id and a.status in ('present','late','absent_unexcused')) > e.package_sessions) as "enrollmentsOverused",
      (select count(*)::int from payment_methods pm where (pm.center_id = ${c} or pm.center_id is null) and pm.is_active and pm.bank_bin is not null and pm.account_no is not null) as "bankQr",
      (select count(*)::int from teachers t where t.center_id = ${c} and t.is_active and t.user_id is null) as "teachersNoAccount"
  `)) as unknown as Record<string, number | boolean>[];
  const x = r[0] ?? {};
  const n = (k: string) => Number(x[k] ?? 0);
  return {
    noRooms: x.noRooms0 ? 1 : 0, noManager: n("managers") ? 0 : 1, noAccountant: n("accountants") ? 0 : 1,
    studentsNoGuardian: n("studentsNoGuardian"), classesNoTeacher: n("classesNoTeacher"), classesNoSessions: n("classesNoSessions"),
    sessionsNoTeacher: n("sessionsNoTeacher"), parentsBadPhone: n("parentsBadPhone"), enrollmentsNoOrder: n("enrollmentsNoOrder"),
    enrollmentsOverused: n("enrollmentsOverused"), noBankQr: n("bankQr") ? 0 : 1, teachersNoAccount: n("teachersNoAccount"),
  };
}

export async function centerReadiness(ctx: ProtectedContext, input: { centerId: string }) {
  if (!authorize(ctx.actor, "cutover:read", { centerId: input.centerId }).allowed) throw forbid("Không có quyền với cơ sở này");
  await assertCenterTenant(ctx, input.centerId);
  const [pf, tr] = await Promise.all([preflightCounts(ctx.db, input.centerId), centerTraining(ctx.db, input.centerId)]);
  return { preflight: preflightSummary(pf), training: tr, modules: TRAINING_MODULES.map((m) => ({ key: m.key, title: m.title })) };
}

export { PREFLIGHT_CHECKS };
