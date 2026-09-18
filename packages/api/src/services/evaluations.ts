/**
 * Đánh giá & Khảo sát v2 (bản gốc `/evaluations`).
 *
 * Trình dựng phiếu (chấm sao / một lựa chọn / nhiều lựa chọn / văn bản / tải ảnh),
 * ba loại phiếu, nhóm tiêu chí, và **đợt khảo sát** (Mở đợt / Đóng đợt / Lưu trữ).
 *
 * NPS cũ (`surveys`) vẫn chạy song song, đang được thay dần.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { evalForms, evalQuestions, evalRounds, evalResponses, evalAnswers, centers, users, teachers } from "@satarobo/db";
import {
  authorize, visibleCenterIds,
  validateEvalForm, validateEvalRound, evalRoundTransition, normalizeEvalQuestion, groupByCriteria, averageByCriteria,
  EVAL_FORM_TYPE_VI, EVAL_ROUND_STATUS_VI, EVAL_RATING_MAX,
  type EvalFormType, type EvalQuestionType, type EvalRoundAction, type EvalRoundStatus, type Permission,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCondViaCenter } from "./tenantScope";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;

function scopeOn(ctx: ProtectedContext, col: AnyPgColumn): SQL {
  const v = visibleCenterIds(ctx.actor);
  // Cách ly trung tâm (tenant) suy qua cơ sở của dòng — đứng trước mọi luật phạm vi cơ sở
  const tenant = tenantCondViaCenter(ctx, col);
  if (v === null) return tenant;
  return and(v.length ? or(isNull(col), inArray(col, v))! : isNull(col), tenant)!;
}

/** Phiếu / đợt dùng chung toàn hệ thống chỉ Hội sở sửa; phiếu của cơ sở thì quản lý cơ sở sửa */
function editable(ctx: ProtectedContext, centerId: string | null) {
  if (centerId) return can(ctx, "care:update", centerId);
  return ctx.actor.assignments.some((a) => a.centerId === null) && can(ctx, "care:update", null);
}

/** Đổi lỗi quy tắc thuần thành lỗi tRPC dễ đọc */
function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "EvaluationRuleError") throw pre((e as Error).message);
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Phiếu đánh giá                                                      */
/* ------------------------------------------------------------------ */

export interface EvalQuestionInput {
  type: EvalQuestionType;
  label: string;
  criteriaGroup?: string | null;
  options?: string[] | null;
  required?: boolean;
}

export interface UpsertEvalFormInput {
  id?: string | null;
  title: string;
  description?: string | null;
  type: EvalFormType;
  centerId: string | null;
  questions: EvalQuestionInput[];
}

/** Danh sách phiếu + số câu hỏi, số đợt đang dùng */
export async function listEvalForms(ctx: ProtectedContext, input: { type?: EvalFormType } = {}) {
  requirePermission(ctx, "care:read", { centerId: null });
  const conds: SQL[] = [scopeOn(ctx, evalForms.centerId)];
  if (input.type) conds.push(eq(evalForms.type, input.type));
  const rows = await ctx.db
    .select({
      f: evalForms,
      centerCode: centers.code,
      questionCount: sql<number>`(select count(*)::int from ${evalQuestions} q where q.form_id = ${evalForms.id})`,
      roundCount: sql<number>`(select count(*)::int from ${evalRounds} r where r.form_id = ${evalForms.id})`,
      responseCount: sql<number>`(select count(*)::int from ${evalResponses} x where x.form_id = ${evalForms.id})`,
    })
    .from(evalForms)
    .leftJoin(centers, eq(centers.id, evalForms.centerId))
    .where(and(...conds))
    .orderBy(desc(evalForms.createdAt))
    .limit(200);
  return {
    items: rows.map((r) => ({
      ...r.f,
      typeLabel: EVAL_FORM_TYPE_VI[r.f.type],
      centerCode: r.centerCode,
      questionCount: r.questionCount,
      roundCount: r.roundCount,
      responseCount: r.responseCount,
      canEdit: editable(ctx, r.f.centerId),
    })),
    canCreate: editable(ctx, null) || (visibleCenterIds(ctx.actor) ?? []).some((c) => editable(ctx, c)),
    /** Chỉ Hội sở mới tạo được phiếu dùng chung toàn hệ thống */
    canCreateGlobal: editable(ctx, null),
  };
}

export async function getEvalForm(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "care:read", { centerId: null });
  const form = await ctx.db.query.evalForms.findFirst({ where: eq(evalForms.id, id) });
  if (!form) throw notFound("Không tìm thấy phiếu đánh giá");
  const qs = await ctx.db.select().from(evalQuestions).where(eq(evalQuestions.formId, id)).orderBy(asc(evalQuestions.sortOrder), asc(evalQuestions.createdAt));
  return {
    ...form,
    typeLabel: EVAL_FORM_TYPE_VI[form.type],
    questions: qs,
    groups: groupByCriteria(qs),
    canEdit: editable(ctx, form.centerId),
  };
}

/**
 * Tạo / sửa phiếu. Kiểm tra bằng quy tắc thuần trong core (cùng câu chữ với bản gốc),
 * ghi audit trong CÙNG transaction với thao tác ghi.
 */
export async function upsertEvalForm(ctx: ProtectedContext, input: UpsertEvalFormInput) {
  if (!editable(ctx, input.centerId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: input.centerId ? "Không có quyền care:update ở cơ sở này" : "Chỉ Hội sở tạo phiếu dùng chung — hãy chọn cơ sở" });
  }
  const questions = input.questions.map((q) => normalizeEvalQuestion(q));
  const errs = validateEvalForm({ title: input.title, type: input.type, questions });
  if (errs.length) throw bad(errs);
  const head = { title: input.title.trim(), description: input.description?.trim() || null, type: input.type, centerId: input.centerId };
  const rows = questions.map((q, i) => ({
    type: q.type, label: q.label, criteriaGroup: q.criteriaGroup,
    options: q.options && q.options.length ? q.options : null,
    required: q.required, sortOrder: i,
  }));

  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (input.id) {
      const cur = await tx.query.evalForms.findFirst({ where: eq(evalForms.id, input.id) });
      if (!cur) throw notFound("Không tìm thấy phiếu đánh giá");
      if (!editable(ctx, cur.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa phiếu này" });
      if (cur.type !== input.type) throw pre("Không đổi loại phiếu sau khi tạo — tạo phiếu mới");
      const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(evalResponses).where(eq(evalResponses.formId, cur.id));
      // Phiếu đã có lượt trả lời: chỉ cho sửa tiêu đề / mô tả, giữ nguyên bộ câu hỏi để số liệu cũ không lệch
      if ((used?.n ?? 0) > 0) {
        const old = await tx.select().from(evalQuestions).where(eq(evalQuestions.formId, cur.id)).orderBy(asc(evalQuestions.sortOrder));
        const sig = (q: { type: string; label: string; criteriaGroup: string | null; options: string[] | null }) => JSON.stringify([q.type, q.label, q.criteriaGroup, q.options ?? []]);
        const same = old.length === rows.length && old.every((q, i) => sig(q) === sig(rows[i]!));
        if (!same) throw pre(`Phiếu đã có ${used!.n} lượt trả lời — không sửa câu hỏi nữa, hãy tạo phiếu mới`);
        await tx.update(evalForms).set(head).where(eq(evalForms.id, cur.id));
        await writeAudit(t, { actorId: ctx.user.id, action: "UPDATE", module: "care", entity: "eval_forms", entityId: cur.id, before: { title: cur.title }, after: { title: head.title }, ip: ctx.ip });
        return { id: cur.id };
      }
      await tx.update(evalForms).set(head).where(eq(evalForms.id, cur.id));
      await tx.delete(evalQuestions).where(eq(evalQuestions.formId, cur.id));
      await tx.insert(evalQuestions).values(rows.map((r) => ({ ...r, formId: cur.id })));
      await writeAudit(t, { actorId: ctx.user.id, action: "UPDATE", module: "care", entity: "eval_forms", entityId: cur.id, before: { title: cur.title }, after: { ...head, questions: rows.length }, ip: ctx.ip });
      return { id: cur.id };
    }
    const [form] = await tx.insert(evalForms).values({ ...head, createdBy: ctx.user.id }).returning({ id: evalForms.id });
    await tx.insert(evalQuestions).values(rows.map((r) => ({ ...r, formId: form!.id })));
    await writeAudit(t, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "eval_forms", entityId: form!.id, after: { ...head, questions: rows.length }, ip: ctx.ip });
    return { id: form!.id };
  });
}

export async function setEvalFormActive(ctx: ProtectedContext, input: { id: string; isActive: boolean }) {
  const form = await ctx.db.query.evalForms.findFirst({ where: eq(evalForms.id, input.id) });
  if (!form) throw notFound("Không tìm thấy phiếu đánh giá");
  if (!editable(ctx, form.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa phiếu này" });
  await ctx.db.transaction(async (tx) => {
    await tx.update(evalForms).set({ isActive: input.isActive }).where(eq(evalForms.id, form.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "care", entity: "eval_forms", entityId: form.id, before: { isActive: form.isActive }, after: { isActive: input.isActive }, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Đợt khảo sát                                                        */
/* ------------------------------------------------------------------ */

export interface UpsertEvalRoundInput {
  id?: string | null;
  formId: string;
  title: string;
  /** null = mọi cơ sở */
  centerId: string | null;
  startDate: string;
  endDate: string;
  note?: string | null;
}

export async function listEvalRounds(ctx: ProtectedContext, input: { status?: EvalRoundStatus; centerId?: string | null } = {}) {
  requirePermission(ctx, "care:read", { centerId: null });
  const conds: SQL[] = [scopeOn(ctx, evalRounds.centerId)];
  if (input.status) conds.push(eq(evalRounds.status, input.status));
  if (input.centerId) conds.push(eq(evalRounds.centerId, input.centerId));
  const rows = await ctx.db
    .select({
      r: evalRounds,
      formTitle: evalForms.title,
      formType: evalForms.type,
      centerCode: centers.code,
      responses: sql<number>`(select count(*)::int from ${evalResponses} x where x.round_id = ${evalRounds.id})`,
      avgX100: sql<number | null>`(select avg(x.rating_avg_x100)::int from ${evalResponses} x where x.round_id = ${evalRounds.id})`,
    })
    .from(evalRounds)
    .innerJoin(evalForms, eq(evalForms.id, evalRounds.formId))
    .leftJoin(centers, eq(centers.id, evalRounds.centerId))
    .where(and(...conds))
    .orderBy(sql`case ${evalRounds.status} when 'open' then 0 when 'draft' then 1 when 'closed' then 2 else 3 end`, desc(evalRounds.startDate))
    .limit(200);
  const today = todayISO();
  return {
    items: rows.map((x) => ({
      ...x.r,
      formTitle: x.formTitle,
      formType: x.formType,
      formTypeLabel: EVAL_FORM_TYPE_VI[x.formType],
      centerCode: x.centerCode,
      statusLabel: EVAL_ROUND_STATUS_VI[x.r.status],
      responses: x.responses,
      avgRating: x.avgX100 == null ? null : Math.round(x.avgX100) / 100,
      running: x.r.status === "open" && today >= x.r.startDate && today <= x.r.endDate,
      canEdit: editable(ctx, x.r.centerId),
    })),
    canCreate: editable(ctx, null) || (visibleCenterIds(ctx.actor) ?? []).some((c) => editable(ctx, c)),
    /** Chỉ Hội sở mới mở được đợt toàn hệ thống */
    canCreateGlobal: editable(ctx, null),
  };
}

export async function upsertEvalRound(ctx: ProtectedContext, input: UpsertEvalRoundInput) {
  if (!editable(ctx, input.centerId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: input.centerId ? "Không có quyền care:update ở cơ sở này" : "Chỉ Hội sở mở đợt toàn hệ thống — hãy chọn cơ sở" });
  }
  const errs = validateEvalRound({ title: input.title, formId: input.formId, centerId: input.centerId, startDate: input.startDate, endDate: input.endDate });
  if (errs.length) throw bad(errs);
  const form = await ctx.db.query.evalForms.findFirst({ where: eq(evalForms.id, input.formId) });
  if (!form) throw notFound("Không tìm thấy phiếu đánh giá");
  if (!form.isActive) throw pre("Phiếu đang tắt — bật lại phiếu trước khi mở đợt");
  if (form.centerId && form.centerId !== input.centerId) throw bad(`Phiếu "${form.title}" chỉ dùng trong cơ sở của nó`);
  const head = { formId: input.formId, title: input.title.trim(), centerId: input.centerId, startDate: input.startDate, endDate: input.endDate, note: input.note?.trim() || null };

  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (input.id) {
      const cur = await tx.query.evalRounds.findFirst({ where: eq(evalRounds.id, input.id) });
      if (!cur) throw notFound("Không tìm thấy đợt khảo sát");
      if (!editable(ctx, cur.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa đợt này" });
      if (cur.status === "archived") throw pre("Đợt đã lưu trữ — không sửa được nữa");
      if (cur.formId !== input.formId && cur.status !== "draft") throw pre("Đợt đã mở — không đổi phiếu");
      await tx.update(evalRounds).set(head).where(eq(evalRounds.id, cur.id));
      await writeAudit(t, { actorId: ctx.user.id, action: "UPDATE", module: "care", entity: "eval_rounds", entityId: cur.id, before: { title: cur.title, startDate: cur.startDate, endDate: cur.endDate }, after: head, ip: ctx.ip });
      return { id: cur.id };
    }
    const [row] = await tx.insert(evalRounds).values({ ...head, status: "draft", createdBy: ctx.user.id }).returning({ id: evalRounds.id });
    await writeAudit(t, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "eval_rounds", entityId: row!.id, after: head, ip: ctx.ip });
    return { id: row!.id };
  });
}

/** Mở đợt / Đóng đợt / Lưu trữ — trạng thái đi theo quy tắc thuần trong core */
export async function transitionEvalRound(ctx: ProtectedContext, input: { id: string; action: EvalRoundAction; reason?: string | null }) {
  const cur = await ctx.db.query.evalRounds.findFirst({ where: eq(evalRounds.id, input.id) });
  if (!cur) throw notFound("Không tìm thấy đợt khảo sát");
  if (!editable(ctx, cur.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền đổi trạng thái đợt này" });
  const next = rule(() => evalRoundTransition(cur.status, input.action));
  const now = new Date();
  const stamp = input.action === "open" ? { openedAt: now } : input.action === "close" ? { closedAt: now } : { archivedAt: now };
  await ctx.db.transaction(async (tx) => {
    await tx.update(evalRounds).set({ status: next, ...stamp }).where(eq(evalRounds.id, cur.id));
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "care", entity: "eval_rounds", entityId: cur.id,
      before: { status: cur.status }, after: { status: next }, reason: input.reason?.trim() || null, ip: ctx.ip,
    });
  });
  return { status: next, statusLabel: EVAL_ROUND_STATUS_VI[next] };
}

/* ------------------------------------------------------------------ */
/* Kết quả                                                             */
/* ------------------------------------------------------------------ */

/** Chi tiết một đợt: điểm theo nhóm tiêu chí, phân bố sao, danh sách lượt trả lời */
export async function evalRoundDetail(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "care:read", { centerId: null });
  const round = await ctx.db.query.evalRounds.findFirst({ where: eq(evalRounds.id, id) });
  if (!round) throw notFound("Không tìm thấy đợt khảo sát");
  const form = await ctx.db.query.evalForms.findFirst({ where: eq(evalForms.id, round.formId) });
  const [qs, responses, answers] = await Promise.all([
    ctx.db.select().from(evalQuestions).where(eq(evalQuestions.formId, round.formId)).orderBy(asc(evalQuestions.sortOrder)),
    ctx.db
      .select({ r: evalResponses, teacherName: teachers.fullName, byName: users.fullName })
      .from(evalResponses)
      .leftJoin(teachers, eq(teachers.id, evalResponses.teacherId))
      .leftJoin(users, eq(users.id, evalResponses.submittedBy))
      .where(eq(evalResponses.roundId, id))
      .orderBy(desc(evalResponses.createdAt))
      .limit(500),
    /*
     * Điểm theo tiêu chí + phân bố sao.
     * Trước: `select … limit 20_000` — kéo tới hai mươi nghìn dòng trả lời về chỉ để tính trung
     *        bình và đếm số sao; đầy đủ cột `evalAnswers` (kèm phần trả lời chữ) cho từng dòng.
     * Sau:  gộp trong SQL theo (câu hỏi, số sao) — nhiều nhất là `số câu hỏi × 6` dòng
     *       (khoảng 240 thay vì 20.000), rồi dựng lại danh sách phẳng trong bộ nhớ để
     *       `averageByCriteria` của core chạy y hệt như cũ (KHÔNG chép lại luật tính điểm).
     */
    ctx.db
      .select({ questionId: evalAnswers.questionId, rating: evalAnswers.rating, n: sql<number>`count(*)::int` })
      .from(evalAnswers)
      .innerJoin(evalResponses, eq(evalResponses.id, evalAnswers.responseId))
      .where(eq(evalResponses.roundId, id))
      .groupBy(evalAnswers.questionId, evalAnswers.rating)
      .orderBy(asc(evalAnswers.questionId), asc(evalAnswers.rating)),
  ]);
  const byQ = new Map(qs.map((q) => [q.id, q] as const));
  const flat: { questionType: EvalQuestionType; criteriaGroup: string | null; rating: number | null }[] = [];
  const starCount = new Map<number, number>();
  for (const row of answers) {
    const q = byQ.get(row.questionId);
    const value = { questionType: (q?.type ?? "text") as EvalQuestionType, criteriaGroup: q?.criteriaGroup ?? null, rating: row.rating };
    for (let i = 0; i < row.n; i++) flat.push(value);
    if (row.rating != null) starCount.set(row.rating, (starCount.get(row.rating) ?? 0) + row.n);
  }
  const criteria = averageByCriteria(flat);
  const ratings = flat.map((x) => x.rating).filter((r): r is number => r != null);
  const distribution = Array.from({ length: EVAL_RATING_MAX }, (_, i) => ({ star: i + 1, n: starCount.get(i + 1) ?? 0 }));
  const today = todayISO();
  return {
    ...round,
    statusLabel: EVAL_ROUND_STATUS_VI[round.status],
    form: form ? { ...form, typeLabel: EVAL_FORM_TYPE_VI[form.type] } : null,
    questions: qs,
    groups: groupByCriteria(qs),
    criteria,
    distribution,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
    responses: responses.map((x) => ({
      id: x.r.id, createdAt: x.r.createdAt, teacherName: x.teacherName, byName: x.byName,
      avgRating: x.r.ratingAvgX100 == null ? null : x.r.ratingAvgX100 / 100,
    })),
    running: round.status === "open" && today >= round.startDate && today <= round.endDate,
    canEdit: editable(ctx, round.centerId),
  };
}

/** Tổng quan cho trang /evaluations */
export async function evaluationsOverview(ctx: ProtectedContext) {
  requirePermission(ctx, "care:read", { centerId: null });
  const [forms, rounds] = await Promise.all([listEvalForms(ctx), listEvalRounds(ctx)]);
  const open = rounds.items.filter((r) => r.status === "open");
  const rated = rounds.items.filter((r) => r.avgRating != null);
  return {
    forms,
    rounds,
    stats: {
      forms: forms.items.length,
      openRounds: open.length,
      responses: rounds.items.reduce((n, r) => n + r.responses, 0),
      avgRating: rated.length ? Math.round((rated.reduce((n, r) => n + r.avgRating!, 0) / rated.length) * 100) / 100 : null,
    },
  };
}
