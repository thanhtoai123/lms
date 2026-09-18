import { and, eq, desc, sql, inArray, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { centers, cutoverCenters, parallelRunDays, reconSnapshots } from "@satarobo/db";
import { listBackups } from "./ops";
import { openHighFeedback } from "./pilot";
import { centerTraining, preflightCounts } from "./readiness";
import {
  authorize, authorizeGlobal, centersWith, preflightSummary, compareParallelDay, parallelStreak, cutoverBlockers, backupFreshness,
  CUTOVER_CHECKLIST, CUTOVER_STAGES, CUTOVER_STAGE_VI, PARALLEL_METRICS, PARALLEL_MIN_DAYS,
  type CutoverStage, type CutoverCheck, type ParallelMetric,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { assertCenterTenant, tenantCond } from "./tenantScope";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

function readable(ctx: ProtectedContext): string[] | null {
  const c = centersWith(ctx.actor, "cutover:read");
  if (c !== null && !c.length) throw forbid("Không có quyền xem go-live");
  return c;
}
const canLog = (ctx: ProtectedContext, centerId: string) => authorize(ctx.actor, "cutover:create", { centerId }).allowed;
const canApprove = (ctx: ProtectedContext) => authorizeGlobal(ctx.actor, "cutover:approve");

/** Số liệu hệ mới của một ngày cho một cơ sở */
export async function parallelCurrent(db: Db, centerId: string, date: string): Promise<Record<ParallelMetric, number>> {
  const r = (await db.execute(sql`
    select
      (select count(*)::int from attendance a join sessions s on s.id = a.session_id join classes c on c.id = s.class_id
        where s.date = ${date}::date and c.center_id = ${centerId}::uuid and a.status in ('present','late')) as attendance,
      (select coalesce(sum(p.amount), 0)::float from payments p where p.status = 'confirmed' and p.paid_at = ${date}::date and p.center_id = ${centerId}::uuid) as collected,
      (select count(*)::int from enrollments e join classes c on c.id = e.class_id
        where (e.enrolled_at at time zone 'Asia/Ho_Chi_Minh')::date = ${date}::date and c.center_id = ${centerId}::uuid
          and not exists (select 1 from legacy_refs l where l.kind = 'enrollment' and l.entity_id = e.id)) as "newEnrollments",
      (select count(*)::int from enrollments e join classes c on c.id = e.class_id where e.status in ('trial','active','paused') and c.center_id = ${centerId}::uuid) as "openEnrollments"
  `)) as unknown as Record<ParallelMetric, number>[];
  return Object.fromEntries(PARALLEL_METRICS.map((m) => [m, Number(r[0]?.[m] ?? 0)])) as Record<ParallelMetric, number>;
}

async function autoChecks(db: Db, centerId: string) {
  const [rec] = await db.select({ ok: reconSnapshots.ok }).from(reconSnapshots).where(eq(reconSnapshots.centerId, centerId)).orderBy(desc(reconSnapshots.createdAt)).limit(1);
  const b = await listBackups();
  const latest = b.latest as { at?: string; restoreTestedAt?: string } | null;
  const now = new Date();
  const backupAt = latest?.at ? new Date(latest.at) : (b.files[0]?.at ?? null);
  const restoreOk = !!latest?.restoreTestedAt && now.getTime() - new Date(latest.restoreTestedAt).getTime() <= 7 * 86_400_000;
  const [tr, pf] = await Promise.all([centerTraining(db, centerId), preflightCounts(db, centerId)]);
  return { recon_ok: !!rec?.ok, backup_tested: restoreOk && backupFreshness(backupAt, now, 7 * 24) === "ok", staff_trained: tr.ok, preflight_ok: preflightSummary(pf).ok };
}

async function stateOf(db: Db, centerId: string) {
  const row = await db.query.cutoverCenters.findFirst({ where: eq(cutoverCenters.centerId, centerId) });
  const since = row?.parallelFrom ?? "2000-01-01";
  const days = await db.select().from(parallelRunDays).where(and(eq(parallelRunDays.centerId, centerId), gte(parallelRunDays.date, since))).orderBy(desc(parallelRunDays.date)).limit(60);
  const auto = await autoChecks(db, centerId);
  const manual = (row?.checklist ?? {}) as Partial<Record<CutoverCheck, boolean>>;
  const checklist: Partial<Record<CutoverCheck, boolean>> = { ...manual, ...auto };
  const streak = parallelStreak(days.map((d) => ({ date: d.date, ok: d.ok || !!d.explanation })));
  const openIssues = days.filter((d) => !d.ok && !d.explanation).length;
  const stage = (row?.stage ?? "preparing") as CutoverStage;
  const openHigh = await openHighFeedback(db, centerId);
  return { row, days, checklist, streak, openIssues, stage, parallelDays: days.length, openHighFeedback: openHigh };
}

export async function cutoverOverview(ctx: ProtectedContext) {
  const ids = readable(ctx);
  const list = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers)
    .where(and(ids === null ? sql`true` : inArray(centers.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]), tenantCond(ctx, centers))).orderBy(centers.code);
  const out = [];
  for (const c of list) {
    const s = await stateOf(ctx.db, c.id);
    out.push({
      ...c, stage: s.stage, stageLabel: CUTOVER_STAGE_VI[s.stage], streak: s.streak, openIssues: s.openIssues, openHighFeedback: s.openHighFeedback, parallelDays: s.parallelDays,
      parallelFrom: s.row?.parallelFrom ?? null, liveAt: s.row?.liveAt ?? null, readonlyAt: s.row?.readonlyAt ?? null, note: s.row?.note ?? null,
      checklist: CUTOVER_CHECKLIST.map((k) => ({ key: k.key, label: k.label, required: k.required, auto: "auto" in k && k.auto, done: !!s.checklist[k.key] })),
      next: CUTOVER_STAGES.map((st) => ({ stage: st, label: CUTOVER_STAGE_VI[st], blockers: st === s.stage ? [] : cutoverBlockers({ stage: s.stage, checklist: s.checklist, streak: s.streak, parallelDays: s.parallelDays, openIssues: s.openIssues, openHighFeedback: s.openHighFeedback }, st) })),
      canLog: canLog(ctx, c.id),
      days: s.days.slice(0, 20),
    });
  }
  return { centers: out, canApprove: canApprove(ctx), minDays: PARALLEL_MIN_DAYS, today: todayISO() };
}

export async function logParallelDay(ctx: ProtectedContext, input: { centerId: string; date: string; legacy: Record<ParallelMetric, number>; note?: string | null }) {
  if (!canLog(ctx, input.centerId)) throw forbid("Chỉ quản lý cơ sở ghi sổ chạy song song");
  await assertCenterTenant(ctx, input.centerId);
  const today = todayISO();
  if (input.date > today) throw bad("Không ghi cho ngày tương lai");
  const s = await stateOf(ctx.db, input.centerId);
  if (s.stage !== "parallel") throw pre("Cơ sở chưa ở giai đoạn chạy song song");
  if (s.row?.parallelFrom && input.date < s.row.parallelFrom) throw bad("Ngày trước khi bắt đầu chạy song song");
  for (const m of PARALLEL_METRICS) if (!Number.isFinite(input.legacy[m]) || input.legacy[m] < 0) throw bad("Số liệu hệ cũ phải là số ≥ 0");
  const current = await parallelCurrent(ctx.db, input.centerId, input.date);
  const cmp = compareParallelDay(input.legacy, current);
  const mismatches = cmp.diffs.filter((d) => !d.ok).length;
  const now = new Date();
  await ctx.db.insert(parallelRunDays).values({ centerId: input.centerId, date: input.date, legacy: input.legacy, current, ok: cmp.ok, mismatches, note: input.note?.trim() || null, createdBy: ctx.user.id })
    .onConflictDoUpdate({ target: [parallelRunDays.centerId, parallelRunDays.date], set: { legacy: input.legacy, current, ok: cmp.ok, mismatches, note: input.note?.trim() || null, explanation: null, resolvedBy: null, updatedAt: now } });
  return cmp;
}

export async function explainParallelDay(ctx: ProtectedContext, input: { id: string; explanation: string }) {
  const d = await ctx.db.query.parallelRunDays.findFirst({ where: eq(parallelRunDays.id, input.id) });
  if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy ngày" });
  if (!canLog(ctx, d.centerId)) throw forbid("Không có quyền");
  await assertCenterTenant(ctx, d.centerId);
  if (d.ok) throw pre("Ngày này đã khớp");
  if (input.explanation.trim().length < 15) throw bad("Giải thích chênh lệch tối thiểu 15 ký tự (nguyên nhân + đã xử lý thế nào)");
  await ctx.db.update(parallelRunDays).set({ explanation: input.explanation.trim(), resolvedBy: ctx.user.id, updatedAt: new Date() }).where(eq(parallelRunDays.id, d.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "migration", entity: "parallel_run_days", entityId: d.id, after: { explanation: input.explanation.trim() }, ip: ctx.ip });
  return { ok: true };
}

export async function setChecklist(ctx: ProtectedContext, input: { centerId: string; key: string; done: boolean }) {
  if (!canLog(ctx, input.centerId)) throw forbid("Không có quyền");
  await assertCenterTenant(ctx, input.centerId);
  const def = CUTOVER_CHECKLIST.find((c) => c.key === input.key);
  if (!def) throw bad("Mục không hợp lệ");
  if ("auto" in def && def.auto) throw bad("Mục này hệ thống tự kiểm tra");
  const row = await ctx.db.query.cutoverCenters.findFirst({ where: eq(cutoverCenters.centerId, input.centerId) });
  const checklist = { ...((row?.checklist ?? {}) as Record<string, boolean>), [input.key]: input.done };
  await ctx.db.insert(cutoverCenters).values({ centerId: input.centerId, checklist, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: cutoverCenters.centerId, set: { checklist, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "migration", entity: "cutover_centers", entityId: input.centerId, after: { [input.key]: input.done }, ip: ctx.ip });
  return { ok: true };
}

export async function setStage(ctx: ProtectedContext, input: { centerId: string; stage: CutoverStage; reason: string }) {
  if (!canApprove(ctx)) throw forbid("Chỉ Hội sở chuyển giai đoạn go-live");
  await assertCenterTenant(ctx, input.centerId);
  if (input.reason.trim().length < 5) throw bad("Ghi lý do / quyết định (≥ 5 ký tự)");
  const s = await stateOf(ctx.db, input.centerId);
  const blockers = cutoverBlockers({ stage: s.stage, checklist: s.checklist, streak: s.streak, parallelDays: s.parallelDays, openIssues: s.openIssues, openHighFeedback: s.openHighFeedback }, input.stage);
  if (blockers.length) throw pre(blockers);
  const now = new Date();
  const patch = {
    stage: input.stage, updatedBy: ctx.user.id, updatedAt: now, note: input.reason.trim(),
    ...(input.stage === "parallel" && s.stage === "preparing" ? { parallelFrom: todayISO() } : {}),
    ...(input.stage === "live" ? { liveAt: now } : {}),
    ...(input.stage === "legacy_readonly" ? { readonlyAt: now } : {}),
  };
  await ctx.db.insert(cutoverCenters).values({ centerId: input.centerId, ...patch }).onConflictDoUpdate({ target: cutoverCenters.centerId, set: patch });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "migration", entity: "cutover_centers", entityId: input.centerId, before: { stage: s.stage }, after: { stage: input.stage }, reason: input.reason.trim(), ip: ctx.ip });
  return { stage: input.stage };
}

/** Banner nhắc trên dashboard: cơ sở nào đang chạy song song mà chưa ghi sổ hôm qua */
export async function parallelReminders(db: Db) {
  const rows = await db.select({ centerId: cutoverCenters.centerId, code: centers.code }).from(cutoverCenters).innerJoin(centers, eq(centers.id, cutoverCenters.centerId))
    .where(eq(cutoverCenters.stage, "parallel"));
  const out: { centerId: string; code: string }[] = [];
  const y = new Date(Date.now() - 86_400_000 + 7 * 3600_000).toISOString().slice(0, 10);
  for (const r of rows) {
    const d = await db.query.parallelRunDays.findFirst({ where: and(eq(parallelRunDays.centerId, r.centerId), eq(parallelRunDays.date, y)) });
    if (!d) out.push(r);
  }
  return out;
}
