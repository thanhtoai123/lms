import { sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  authorize, normalizeRange, furthestStage, buildFunnel, dropoffByStage, pct, monthsBetween, attendanceRate, monthKey, monthsOf, attainment, monthProgress,
  LEAD_STATUS_VI, type LeadStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { todayISO } from "./sessions";
import { writeAudit } from "./audit";
import { revenueTargets } from "@satarobo/db";

export interface ReportInput { from?: string; to?: string; centerId?: string }

/** Cơ sở actor được xem báo cáo: null = toàn hệ thống */
function reportCenters(ctx: ProtectedContext, centerId?: string): string[] | null {
  requirePermission(ctx, "report:read", { centerId: centerId ?? null });
  const own = ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "report:read", { centerId: a.centerId }).allowed);
  const global = own.some((a) => a.centerId === null);
  if (centerId) {
    if (!global && !own.some((a) => a.centerId === centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền xem báo cáo cơ sở này" });
    return [centerId];
  }
  if (global) return null;
  return [...new Set(own.map((a) => a.centerId!).filter(Boolean))];
}

/** Điều kiện "cột thuộc danh sách cơ sở" cho SQL thô */
function inCenters(col: SQL, ids: string[] | null): SQL {
  if (ids === null) return sql`true`;
  if (!ids.length) return sql`false`;
  return sql`${col} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;
}

function rangeOf(input: ReportInput) {
  const r = normalizeRange(input.from, input.to, todayISO());
  return { ...r, fromTs: `${r.from}T00:00:00+07:00`, toTs: `${r.to}T23:59:59.999+07:00` };
}

async function rows<T>(ctx: ProtectedContext, q: SQL): Promise<T[]> {
  return (await ctx.db.execute(q)) as unknown as T[];
}

async function centerOptions(ctx: ProtectedContext, ids: string[] | null) {
  return rows<{ id: string; code: string; name: string }>(ctx, sql`select id, code, name from centers where ${inCenters(sql`id`, ids)} order by code`);
}

/* ------------------------------------------------------------------ */
/* Báo cáo Lead                                                        */
/* ------------------------------------------------------------------ */

export async function leadReport(ctx: ProtectedContext, input: ReportInput) {
  const centersAllowed = reportCenters(ctx, input.centerId);
  const r = rangeOf(input);
  const leadWhere = sql`l.deleted_at is null and l.created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${centersAllowed === null ? sql`true` : inCenters(sql`l.center_id`, centersAllowed)}`;

  const leadRows = await rows<{ id: string; status: LeadStatus; source: string | null; center_id: string | null; center_code: string | null; assigned_to_id: string | null; assignee: string | null; lost_reason: string | null; created_at: string; converted_at: string | null; overdue_tasks: number }>(ctx, sql`
    select l.id, l.status, l.source, l.center_id, c.code as center_code, l.assigned_to_id, u.full_name as assignee, l.lost_reason, l.created_at, l.converted_at,
      (select count(*)::int from lead_tasks t where t.lead_id = l.id and t.done_at is null and t.due_at < now()) as overdue_tasks
    from leads l left join centers c on c.id = l.center_id left join users u on u.id = l.assigned_to_id
    where ${leadWhere}
    limit 20000`);

  const seen = await rows<{ lead_id: string; s: string }>(ctx, sql`
    select a.lead_id, x.s from lead_activities a
    cross join lateral (values (a.meta->>'from'), (a.meta->>'to')) as x(s)
    where x.s is not null and a.lead_id in (select l.id from leads l where ${leadWhere})`);
  const trials = await rows<{ lead_id: string; status: string }>(ctx, sql`
    select tb.lead_id, tb.status from trial_bookings tb where tb.lead_id in (select l.id from leads l where ${leadWhere})`);

  const seenBy = new Map<string, string[]>();
  for (const x of seen) (seenBy.get(x.lead_id) ?? seenBy.set(x.lead_id, []).get(x.lead_id)!).push(x.s);
  const trialBy = new Map<string, string[]>();
  for (const x of trials) (trialBy.get(x.lead_id) ?? trialBy.set(x.lead_id, []).get(x.lead_id)!).push(x.status);

  const enriched = leadRows.map((l) => {
    const statuses = [...(seenBy.get(l.id) ?? []), l.status].filter((s) => s !== "lost");
    let f = furthestStage(statuses);
    const tb = trialBy.get(l.id) ?? [];
    if (tb.some((s) => s === "booked" || s === "attended" || s === "no_show")) f = Math.max(f, 2);
    if (tb.includes("attended")) f = Math.max(f, 3);
    if (l.status === "enrolled") f = 4;
    if (l.status !== "new" && f < 1) f = 1;
    return { ...l, furthest: f, trials: tb.filter((s) => s !== "cancelled" && s !== "rescheduled").length, attended: tb.includes("attended") };
  });

  const total = enriched.length;
  const enrolled = enriched.filter((l) => l.status === "enrolled").length;
  const lost = enriched.filter((l) => l.status === "lost").length;
  const open = total - enrolled - lost;

  type Agg = { key: string; label: string; total: number; contacted: number; trials: number; enrolled: number; lost: number; open: number; overdueTasks: number };
  const group = (keyOf: (l: (typeof enriched)[number]) => [string, string]) => {
    const m = new Map<string, Agg>();
    for (const l of enriched) {
      const [key, label] = keyOf(l);
      const a = m.get(key) ?? { key, label, total: 0, contacted: 0, trials: 0, enrolled: 0, lost: 0, open: 0, overdueTasks: 0 };
      a.total++;
      if (l.furthest >= 1) a.contacted++;
      if (l.furthest >= 2) a.trials++;
      if (l.status === "enrolled") a.enrolled++;
      else if (l.status === "lost") a.lost++;
      else a.open++;
      a.overdueTasks += l.overdue_tasks;
      m.set(key, a);
    }
    return [...m.values()].map((a) => ({ ...a, conversion: pct(a.enrolled, a.total), closedConversion: pct(a.enrolled, a.enrolled + a.lost) })).sort((x, y) => y.total - x.total);
  };

  const months = monthsBetween(r.from, r.to);
  const byMonthMap = new Map(months.map((m) => [m, { month: m, total: 0, enrolled: 0, lost: 0 }]));
  for (const l of enriched) {
    const k = byMonthMap.get(monthKey(l.created_at));
    if (!k) continue;
    k.total++;
    if (l.status === "enrolled") k.enrolled++;
    if (l.status === "lost") k.lost++;
  }

  const lostReasons = new Map<string, number>();
  for (const l of enriched.filter((x) => x.status === "lost")) {
    const k = (l.lost_reason ?? "").trim() || "(không ghi lý do)";
    lostReasons.set(k, (lostReasons.get(k) ?? 0) + 1);
  }
  const byStatus = Object.entries(LEAD_STATUS_VI).map(([k, label]) => ({ status: k, label, count: enriched.filter((l) => l.status === k).length }));

  // Thời gian chốt trung bình (ngày) cho lead đã đăng ký
  const days = enriched.filter((l) => l.status === "enrolled" && l.converted_at).map((l) => (new Date(l.converted_at!).getTime() - new Date(l.created_at).getTime()) / 86400000);
  const avgDaysToEnroll = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;

  return {
    range: { from: r.from, to: r.to },
    centers: await centerOptions(ctx, reportCenters(ctx)),
    centerId: input.centerId ?? null,
    totals: { total, open, enrolled, lost, conversion: pct(enrolled, total), closedConversion: pct(enrolled, enrolled + lost), avgDaysToEnroll, trials: enriched.filter((l) => l.trials > 0).length },
    funnel: buildFunnel(enriched.map((l) => l.furthest)),
    dropoff: dropoffByStage(enriched.filter((l) => l.status === "lost").map((l) => l.furthest)),
    byStatus,
    bySource: group((l) => [l.source ?? "", l.source ?? "(không rõ)"]),
    bySale: group((l) => [l.assigned_to_id ?? "", l.assignee ?? "(chưa giao)"]),
    byCenter: group((l) => [l.center_id ?? "", l.center_code ?? "(chưa gán)"]),
    byMonth: [...byMonthMap.values()].map((m) => ({ ...m, conversion: pct(m.enrolled, m.total) })),
    lostReasons: [...lostReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* Báo cáo trải nghiệm (học thử)                                       */
/* ------------------------------------------------------------------ */

export async function trialReport(ctx: ProtectedContext, input: ReportInput) {
  const centersAllowed = reportCenters(ctx, input.centerId);
  const r = rangeOf(input);
  const today = todayISO();
  const list = await rows<{ id: string; status: string; date: string; lead_id: string; lead_status: string; class_id: string; class_code: string; course_code: string; center_code: string; booked_by: string | null; booker: string | null; capacity: number; session_id: string; teacher: string | null }>(ctx, sql`
    select tb.id, tb.status, s.date::text as date, tb.lead_id, l.status as lead_status, c.id as class_id, c.code as class_code, co.code as course_code, ce.code as center_code,
      tb.booked_by, u.full_name as booker, c.capacity, s.id as session_id, t.full_name as teacher
    from trial_bookings tb
    join sessions s on s.id = tb.session_id
    join classes c on c.id = s.class_id
    join courses co on co.id = c.course_id
    join centers ce on ce.id = c.center_id
    join leads l on l.id = tb.lead_id
    left join users u on u.id = tb.booked_by
    left join teachers t on t.id = s.teacher_id
    where s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    limit 20000`);

  const live = list.filter((x) => x.status !== "cancelled" && x.status !== "rescheduled");
  const attended = list.filter((x) => x.status === "attended");
  const noShow = list.filter((x) => x.status === "no_show");
  const pending = list.filter((x) => x.status === "booked" && x.date < today);
  const upcoming = list.filter((x) => x.status === "booked" && x.date >= today);
  const attendedLeads = new Set(attended.map((x) => x.lead_id));
  const convertedLeads = new Set(attended.filter((x) => x.lead_status === "enrolled").map((x) => x.lead_id));

  const group = (keyOf: (x: (typeof list)[number]) => [string, string]) => {
    const m = new Map<string, { key: string; label: string; booked: number; attended: number; noShow: number; cancelled: number; converted: number; leads: Set<string> }>();
    for (const x of list) {
      const [key, label] = keyOf(x);
      const a = m.get(key) ?? { key, label, booked: 0, attended: 0, noShow: 0, cancelled: 0, converted: 0, leads: new Set<string>() };
      if (x.status !== "cancelled" && x.status !== "rescheduled") a.booked++;
      if (x.status === "attended") { a.attended++; if (x.lead_status === "enrolled" && !a.leads.has(x.lead_id)) { a.converted++; a.leads.add(x.lead_id); } }
      if (x.status === "no_show") a.noShow++;
      if (x.status === "cancelled" || x.status === "rescheduled") a.cancelled++;
      m.set(key, a);
    }
    return [...m.values()].map(({ leads: _l, ...a }) => ({ ...a, showRate: pct(a.attended, a.attended + a.noShow), conversion: pct(a.converted, a.attended) })).sort((x, y) => y.booked - x.booked);
  };

  // Lấp đầy: số lượt thử / số buổi có học thử theo lớp
  const fill = new Map<string, { classId: string; classCode: string; sessions: Set<string>; seats: number; capacity: number }>();
  for (const x of live) {
    const a = fill.get(x.class_id) ?? { classId: x.class_id, classCode: x.class_code, sessions: new Set<string>(), seats: 0, capacity: x.capacity };
    a.sessions.add(x.session_id);
    a.seats++;
    fill.set(x.class_id, a);
  }

  const months = monthsBetween(r.from, r.to);
  const byMonth = months.map((m) => {
    const xs = list.filter((x) => x.date.startsWith(m));
    const at = xs.filter((x) => x.status === "attended").length;
    const ns = xs.filter((x) => x.status === "no_show").length;
    return { month: m, booked: xs.filter((x) => x.status !== "cancelled" && x.status !== "rescheduled").length, attended: at, noShow: ns, showRate: pct(at, at + ns) };
  });

  return {
    range: { from: r.from, to: r.to },
    centers: await centerOptions(ctx, reportCenters(ctx)),
    centerId: input.centerId ?? null,
    totals: {
      booked: live.length, upcoming: upcoming.length, pendingResult: pending.length, attended: attended.length, noShow: noShow.length,
      cancelled: list.filter((x) => x.status === "cancelled").length, rescheduled: list.filter((x) => x.status === "rescheduled").length,
      showRate: pct(attended.length, attended.length + noShow.length),
      attendedLeads: attendedLeads.size, convertedLeads: convertedLeads.size, conversion: pct(convertedLeads.size, attendedLeads.size),
    },
    byCourse: group((x) => [x.course_code, x.course_code]),
    byCenter: group((x) => [x.center_code, x.center_code]),
    bySale: group((x) => [x.booked_by ?? "", x.booker ?? "(không rõ)"]),
    byTeacher: group((x) => [x.teacher ?? "", x.teacher ?? "(chưa phân GV)"]),
    fill: [...fill.values()].map((f) => ({ classId: f.classId, classCode: f.classCode, sessions: f.sessions.size, seats: f.seats, perSession: Math.round((f.seats / f.sessions.size) * 10) / 10, capacity: f.capacity })).sort((a, b) => b.seats - a.seats),
    byMonth,
  };
}

/* ------------------------------------------------------------------ */
/* Báo cáo đào tạo (chuyên cần theo lớp)                               */
/* ------------------------------------------------------------------ */

export async function trainingReport(ctx: ProtectedContext, input: ReportInput) {
  const centersAllowed = reportCenters(ctx, input.centerId);
  const r = rangeOf(input);
  const today = todayISO();
  const classRows = await rows<{
    id: string; code: string; name: string; status: string; center_code: string; course_code: string; teacher: string | null; capacity: number;
    planned: number; completed: number; cancelled: number; overdue: number; students: number;
  }>(ctx, sql`
    select c.id, c.code, c.name, c.status, ce.code as center_code, co.code as course_code, t.full_name as teacher, c.capacity,
      count(s.id) filter (where s.status not in ('cancelled','rescheduled'))::int as planned,
      count(s.id) filter (where s.status = 'completed')::int as completed,
      count(s.id) filter (where s.status in ('cancelled','rescheduled'))::int as cancelled,
      count(s.id) filter (where s.status not in ('completed','cancelled','rescheduled') and s.date < ${today}::date)::int as overdue,
      (select count(*)::int from enrollments e where e.class_id = c.id and e.status in ('active','trial')) as students
    from classes c
    join centers ce on ce.id = c.center_id
    join courses co on co.id = c.course_id
    left join teachers t on t.id = c.lead_teacher_id
    join sessions s on s.class_id = c.id and s.date between ${r.from}::date and ${r.to}::date
    where c.deleted_at is null and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by c.id, ce.code, co.code, t.full_name
    order by ce.code, c.code`);
  const att = await rows<{ class_id: string; status: string; n: number }>(ctx, sql`
    select s.class_id, a.status, count(*)::int as n
    from attendance a join sessions s on s.id = a.session_id join classes c on c.id = s.class_id
    where s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by s.class_id, a.status`);
  const mk = await rows<{ class_id: string; status: string; n: number }>(ctx, sql`
    select e.class_id, m.status, count(*)::int as n
    from makeup_requests m join enrollments e on e.id = m.enrollment_id join sessions s on s.id = m.missed_session_id join classes c on c.id = e.class_id
    where s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by e.class_id, m.status`);
  // vắng chưa có yêu cầu bù
  const unexcused = await rows<{ class_id: string; n: number }>(ctx, sql`
    select s.class_id, count(*)::int as n
    from attendance a join sessions s on s.id = a.session_id join classes c on c.id = s.class_id
    where a.status in ('absent_excused','absent_unexcused') and s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
      and not exists (select 1 from makeup_requests m where m.enrollment_id = a.enrollment_id and m.missed_session_id = a.session_id)
      and not exists (select 1 from attendance b where b.enrollment_id = a.enrollment_id and b.makeup_for_session_id = a.session_id)
    group by s.class_id`);

  const tally = (classId: string) => {
    const g = (st: string) => att.find((a) => a.class_id === classId && a.status === st)?.n ?? 0;
    return { present: g("present"), late: g("late"), absent: g("absent_unexcused"), excused: g("absent_excused"), makeup: g("makeup") };
  };
  const mkOf = (classId: string, sts: string[]) => mk.filter((m) => m.class_id === classId && sts.includes(m.status)).reduce((a, b) => a + b.n, 0);

  const items = classRows.map((c) => {
    const t = tally(c.id);
    return {
      ...c,
      attendance: t,
      marks: t.present + t.late + t.absent + t.excused + t.makeup,
      rate: attendanceRate(t),
      makeupPending: mkOf(c.id, ["requested", "approved"]) + (unexcused.find((u) => u.class_id === c.id)?.n ?? 0),
      makeupRequested: mkOf(c.id, ["requested", "approved"]),
      makeupDone: mkOf(c.id, ["done"]),
      progress: pct(c.completed, c.planned),
    };
  });
  const sum = (k: "planned" | "completed" | "cancelled" | "overdue" | "makeupPending" | "makeupDone") => items.reduce((a, b) => a + b[k], 0);
  const all = items.reduce((a, b) => ({ present: a.present + b.attendance.present, late: a.late + b.attendance.late, absent: a.absent + b.attendance.absent, excused: a.excused + b.attendance.excused, makeup: a.makeup + b.attendance.makeup }), { present: 0, late: 0, absent: 0, excused: 0, makeup: 0 });
  return {
    range: { from: r.from, to: r.to },
    centers: await centerOptions(ctx, reportCenters(ctx)),
    centerId: input.centerId ?? null,
    totals: { classes: items.length, planned: sum("planned"), completed: sum("completed"), cancelled: sum("cancelled"), overdue: sum("overdue"), attendance: all, rate: attendanceRate(all), makeupPending: sum("makeupPending"), makeupDone: sum("makeupDone") },
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Hiệu suất giáo viên                                                 */
/* ------------------------------------------------------------------ */

export async function teacherReport(ctx: ProtectedContext, input: ReportInput) {
  const centersAllowed = reportCenters(ctx, input.centerId);
  const r = rangeOf(input);
  const today = todayISO();
  const base = await rows<{ id: string; code: string | null; full_name: string; center_code: string | null; user_id: string | null; max_load: number; taught: number; planned: number; cancelled: number; overdue: number; classes: number; weeks: number }>(ctx, sql`
    select t.id, t.code, t.full_name, ce.code as center_code, t.user_id, t.max_load_per_week as max_load,
      count(s.id) filter (where s.status = 'completed')::int as taught,
      count(s.id) filter (where s.status not in ('cancelled','rescheduled'))::int as planned,
      count(s.id) filter (where s.status in ('cancelled','rescheduled'))::int as cancelled,
      count(s.id) filter (where s.status not in ('completed','cancelled','rescheduled') and s.date < ${today}::date)::int as overdue,
      count(distinct s.class_id)::int as classes,
      greatest(1, ceil((${r.to}::date - ${r.from}::date + 1) / 7.0))::int as weeks
    from teachers t
    left join centers ce on ce.id = t.center_id
    join sessions s on s.teacher_id = t.id and s.date between ${r.from}::date and ${r.to}::date
    join classes c on c.id = s.class_id
    where t.deleted_at is null and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by t.id, ce.code
    order by t.full_name`);
  const att = await rows<{ teacher_id: string; status: string; n: number }>(ctx, sql`
    select s.teacher_id, a.status, count(*)::int as n
    from attendance a join sessions s on s.id = a.session_id join classes c on c.id = s.class_id
    where s.teacher_id is not null and s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by s.teacher_id, a.status`);
  const rc = await rows<{ author_id: string; submitted: number; published: number; returned: number; avg: string | null }>(ctx, sql`
    select rc.author_id,
      count(*) filter (where rc.status <> 'draft')::int as submitted,
      count(*) filter (where rc.status = 'published')::int as published,
      count(*) filter (where rc.return_reason is not null)::int as returned,
      (avg(rc.average_score) filter (where rc.status in ('approved','published')))::numeric(3,1)::text as avg
    from report_cards rc join enrollments e on e.id = rc.enrollment_id join classes c on c.id = e.class_id
    where rc.author_id is not null and coalesce(rc.submitted_at, rc.created_at) between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by rc.author_id`);
  const media = await rows<{ uploaded_by: string; n: number; approved: number }>(ctx, sql`
    select m.uploaded_by, count(*)::int as n, count(*) filter (where m.status = 'approved')::int as approved
    from session_media m join sessions s on s.id = m.session_id join classes c on c.id = s.class_id
    where m.uploaded_by is not null and s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by m.uploaded_by`);
  const trials = await rows<{ teacher_id: string; attended: number; converted: number }>(ctx, sql`
    select s.teacher_id, count(*) filter (where tb.status = 'attended')::int as attended,
      count(distinct tb.lead_id) filter (where tb.status = 'attended' and l.status = 'enrolled')::int as converted
    from trial_bookings tb join sessions s on s.id = tb.session_id join leads l on l.id = tb.lead_id join classes c on c.id = s.class_id
    where s.teacher_id is not null and s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, centersAllowed)}
    group by s.teacher_id`);

  const items = base.map((t) => {
    const g = (st: string) => att.find((a) => a.teacher_id === t.id && a.status === st)?.n ?? 0;
    const tally = { present: g("present"), late: g("late"), absent: g("absent_unexcused"), excused: g("absent_excused"), makeup: g("makeup") };
    const card = t.user_id ? rc.find((x) => x.author_id === t.user_id) : undefined;
    const md = t.user_id ? media.find((x) => x.uploaded_by === t.user_id) : undefined;
    const tr = trials.find((x) => x.teacher_id === t.id);
    return {
      id: t.id, code: t.code, fullName: t.full_name, centerCode: t.center_code, classes: t.classes,
      taught: t.taught, planned: t.planned, cancelled: t.cancelled, overdue: t.overdue,
      onTime: pct(t.planned - t.overdue, t.planned),
      loadPerWeek: Math.round((t.planned / t.weeks) * 10) / 10, maxLoad: t.max_load,
      attendanceRate: attendanceRate(tally), marks: tally.present + tally.late + tally.absent + tally.excused + tally.makeup,
      reportCards: { submitted: card?.submitted ?? 0, published: card?.published ?? 0, returned: card?.returned ?? 0, avg: card?.avg ? Number(card.avg) : null },
      media: { uploaded: md?.n ?? 0, approved: md?.approved ?? 0 },
      trials: { attended: tr?.attended ?? 0, converted: tr?.converted ?? 0, conversion: pct(tr?.converted ?? 0, tr?.attended ?? 0) },
    };
  });
  return {
    range: { from: r.from, to: r.to },
    centers: await centerOptions(ctx, reportCenters(ctx)),
    centerId: input.centerId ?? null,
    totals: { teachers: items.length, taught: items.reduce((a, b) => a + b.taught, 0), overdue: items.reduce((a, b) => a + b.overdue, 0), reportCards: items.reduce((a, b) => a + b.reportCards.published, 0) },
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Báo cáo trung tâm (doanh thu, học viên, công nợ)                    */
/* ------------------------------------------------------------------ */

export async function centerReport(ctx: ProtectedContext, input: ReportInput) {
  const allowed = reportCenters(ctx, input.centerId);
  const r = rangeOf(input);
  const months = monthsOf(r.from, r.to);
  const rev = await rows<{ month: string; center_id: string; amount: number; n: number }>(ctx, sql`
    select to_char(p.paid_at, 'YYYY-MM') as month, p.center_id, coalesce(sum(p.amount), 0)::float as amount, count(*)::int as n
    from payments p where p.status = 'confirmed' and p.paid_at between ${r.from}::date and ${r.to}::date and ${inCenters(sql`p.center_id`, allowed)}
    group by 1, 2`);
  const ref = await rows<{ month: string; center_id: string; amount: number }>(ctx, sql`
    select to_char(f.paid_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, f.center_id, coalesce(sum(f.amount), 0)::float as amount
    from refunds f where f.status = 'paid' and f.paid_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${inCenters(sql`f.center_id`, allowed)}
    group by 1, 2`);
  const ord = await rows<{ month: string; center_id: string; n: number; total: number; discount: number }>(ctx, sql`
    select to_char(o.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, o.center_id, count(*)::int as n, coalesce(sum(o.total), 0)::float as total, coalesce(sum(o.discount_amount), 0)::float as discount
    from orders o where o.status <> 'cancelled' and o.created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${inCenters(sql`o.center_id`, allowed)}
    group by 1, 2`);
  const enr = await rows<{ month: string; center_id: string; created: number; withdrawn: number; completed: number }>(ctx, sql`
    select m.month, m.center_id, sum(m.created)::int as created, sum(m.withdrawn)::int as withdrawn, sum(m.completed)::int as completed from (
      select to_char(e.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, c.center_id, count(*) as created, 0 as withdrawn, 0 as completed
      from enrollments e join classes c on c.id = e.class_id
      where e.created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and e.transferred_from_id is null and ${inCenters(sql`c.center_id`, allowed)}
      group by 1, 2
      union all
      select to_char(e.ended_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), c.center_id, 0, count(*) filter (where e.status = 'withdrawn'), count(*) filter (where e.status = 'completed')
      from enrollments e join classes c on c.id = e.class_id
      where e.ended_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${inCenters(sql`c.center_id`, allowed)}
      group by 1, 2
    ) m group by 1, 2`);
  const att = await rows<{ month: string; center_id: string; status: string; n: number }>(ctx, sql`
    select to_char(s.date, 'YYYY-MM') as month, c.center_id, a.status, count(*)::int as n
    from attendance a join sessions s on s.id = a.session_id join classes c on c.id = s.class_id
    where s.date between ${r.from}::date and ${r.to}::date and ${inCenters(sql`c.center_id`, allowed)}
    group by 1, 2, 3`);
  const snap = await rows<{ center_id: string; active_students: number; running_classes: number; outstanding: number; overdue_orders: number }>(ctx, sql`
    select ce.id as center_id,
      (select count(distinct e.student_id)::int from enrollments e join classes c on c.id = e.class_id where c.center_id = ce.id and e.status in ('active','trial')) as active_students,
      (select count(*)::int from classes c where c.center_id = ce.id and c.status = 'running' and c.deleted_at is null) as running_classes,
      (select coalesce(sum(o.total - coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.status = 'confirmed'), 0)), 0)::float
         from orders o where o.center_id = ce.id and o.status in ('pending_payment','partially_paid')) as outstanding,
      (select count(distinct i.order_id)::int from order_installments i join orders o on o.id = i.order_id
         where o.center_id = ce.id and o.status in ('pending_payment','partially_paid') and i.due_date < current_date) as overdue_orders
    from centers ce where ${inCenters(sql`ce.id`, allowed)}`);
  const byMethod = await rows<{ method: string | null; amount: number; n: number }>(ctx, sql`
    select pm.name as method, coalesce(sum(p.amount), 0)::float as amount, count(*)::int as n
    from payments p left join payment_methods pm on pm.id = p.payment_method_id
    where p.status = 'confirmed' and p.paid_at between ${r.from}::date and ${r.to}::date and ${inCenters(sql`p.center_id`, allowed)}
    group by 1 order by 2 desc`);
  const byCourse = await rows<{ course: string | null; amount: number }>(ctx, sql`
    select coalesce(co.code, 'Khác') as course, coalesce(sum(p.amount), 0)::float as amount
    from payments p join orders o on o.id = p.order_id left join enrollments e on e.id = o.enrollment_id left join classes c on c.id = e.class_id left join courses co on co.id = c.course_id
    where p.status = 'confirmed' and p.paid_at between ${r.from}::date and ${r.to}::date and ${inCenters(sql`p.center_id`, allowed)}
    group by 1 order by 2 desc`);
  const centerList = await centerOptions(ctx, allowed);
  const sumBy = <T extends { month: string; center_id: string }>(xs: T[], m: string | null, c: string | null, f: (x: T) => number) =>
    xs.filter((x) => (m === null || x.month === m) && (c === null || x.center_id === c)).reduce((a, x) => a + f(x), 0);
  const cell = (m: string | null, c: string | null) => {
    const revenue = sumBy(rev, m, c, (x) => x.amount);
    const refunds = sumBy(ref, m, c, (x) => x.amount);
    const a = (st: string) => sumBy(att.filter((x) => x.status === st), m, c, (x) => x.n);
    const t = { present: a("present"), late: a("late"), absent: a("absent_unexcused"), excused: a("absent_excused"), makeup: a("makeup") };
    return {
      revenue, refunds, net: revenue - refunds, payments: sumBy(rev, m, c, (x) => x.n),
      orders: sumBy(ord, m, c, (x) => x.n), orderValue: sumBy(ord, m, c, (x) => x.total), discount: sumBy(ord, m, c, (x) => x.discount),
      newEnrollments: sumBy(enr, m, c, (x) => x.created), withdrawn: sumBy(enr, m, c, (x) => x.withdrawn), completed: sumBy(enr, m, c, (x) => x.completed),
      attendanceRate: attendanceRate(t),
    };
  };
  return {
    range: { from: r.from, to: r.to }, months, centers: centerList, centerId: input.centerId ?? null,
    totals: {
      ...cell(null, null),
      activeStudents: snap.reduce((a, x) => a + x.active_students, 0), runningClasses: snap.reduce((a, x) => a + x.running_classes, 0),
      outstanding: snap.reduce((a, x) => a + x.outstanding, 0), overdueOrders: snap.reduce((a, x) => a + x.overdue_orders, 0),
    },
    byMonth: months.map((m) => ({ month: m, ...cell(m, null) })),
    byCenter: centerList.map((c) => ({ ...c, ...cell(null, c.id), snapshot: snap.find((s) => s.center_id === c.id) ?? null, months: months.map((m) => ({ month: m, revenue: sumBy(rev, m, c.id, (x) => x.amount), net: sumBy(rev, m, c.id, (x) => x.amount) - sumBy(ref, m, c.id, (x) => x.amount) })) })),
    byMethod, byCourse,
  };
}

/* ------------------------------------------------------------------ */
/* Doanh thu vs mục tiêu                                               */
/* ------------------------------------------------------------------ */

export async function revenueVsTarget(ctx: ProtectedContext, input: { year?: number; centerId?: string }) {
  const allowed = reportCenters(ctx, input.centerId);
  const today = todayISO();
  const year = input.year ?? Number(today.slice(0, 4));
  const months = monthsOf(`${year}-01-01`, `${year}-12-01`);
  const targets = await rows<{ center_id: string; period: string; amount: number; new_enrollments: number | null; note: string | null }>(ctx, sql`
    select center_id, period, amount::float as amount, new_enrollments, note from revenue_targets where period like ${`${year}-%`} and ${inCenters(sql`center_id`, allowed)}`);
  const rev = await rows<{ center_id: string; month: string; amount: number }>(ctx, sql`
    select p.center_id, to_char(p.paid_at, 'YYYY-MM') as month, coalesce(sum(p.amount), 0)::float as amount
    from payments p where p.status = 'confirmed' and p.paid_at between ${`${year}-01-01`}::date and ${`${year}-12-31`}::date and ${inCenters(sql`p.center_id`, allowed)} group by 1, 2`);
  const ref = await rows<{ center_id: string; month: string; amount: number }>(ctx, sql`
    select f.center_id, to_char(f.paid_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, coalesce(sum(f.amount), 0)::float as amount
    from refunds f where f.status = 'paid' and f.paid_at >= ${`${year}-01-01T00:00:00+07:00`}::timestamptz and f.paid_at < ${`${year + 1}-01-01T00:00:00+07:00`}::timestamptz and ${inCenters(sql`f.center_id`, allowed)} group by 1, 2`);
  const enr = await rows<{ center_id: string; month: string; n: number }>(ctx, sql`
    select c.center_id, to_char(e.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, count(*)::int as n
    from enrollments e join classes c on c.id = e.class_id
    where e.transferred_from_id is null and e.created_at >= ${`${year}-01-01T00:00:00+07:00`}::timestamptz and e.created_at < ${`${year + 1}-01-01T00:00:00+07:00`}::timestamptz and ${inCenters(sql`c.center_id`, allowed)} group by 1, 2`);
  const centerList = await centerOptions(ctx, allowed);
  const canSet = ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN" || (a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:configure", {}).allowed));
  const row = (cid: string | null, m: string) => {
    const f = <T extends { center_id: string; month?: string; period?: string }>(xs: T[]) => xs.filter((x) => (cid === null || x.center_id === cid) && (x.month ?? x.period) === m);
    const target = f(targets).reduce((a, x) => a + x.amount, 0);
    const hasTarget = f(targets).length > 0;
    const actual = f(rev).reduce((a, x) => a + (x as { amount: number }).amount, 0) - f(ref).reduce((a, x) => a + (x as { amount: number }).amount, 0);
    const progress = monthProgress(m, today);
    const tEnr = f(targets).reduce((a, x) => a + (x.new_enrollments ?? 0), 0);
    return {
      month: m, target: hasTarget ? target : null, actual, ...attainment(actual, hasTarget ? target : null), progress,
      expected: hasTarget ? Math.round(target * progress) : null,
      enrollTarget: tEnr || null, enrollActual: f(enr).reduce((a, x) => a + (x as { n: number }).n, 0),
      note: cid ? (f(targets)[0]?.note ?? null) : null,
    };
  };
  const byCenter = centerList.map((c) => {
    const ms = months.map((m) => row(c.id, m));
    const t = ms.reduce((a, x) => a + (x.target ?? 0), 0);
    const act = ms.reduce((a, x) => a + x.actual, 0);
    return { ...c, months: ms, target: t || null, actual: act, ...attainment(act, t || null) };
  });
  const all = months.map((m) => row(null, m));
  const tAll = all.reduce((a, x) => a + (x.target ?? 0), 0);
  const aAll = all.reduce((a, x) => a + x.actual, 0);
  const ytdMonths = all.filter((x) => x.month <= today.slice(0, 7));
  const ytdTarget = ytdMonths.reduce((a, x) => a + (x.target ?? 0), 0);
  const ytdActual = ytdMonths.reduce((a, x) => a + x.actual, 0);
  return {
    year, today, months, centers: centerList, centerId: input.centerId ?? null, canSet,
    totals: { target: tAll || null, actual: aAll, ...attainment(aAll, tAll || null), ytdTarget: ytdTarget || null, ytdActual, ytd: attainment(ytdActual, ytdTarget || null) },
    byMonth: all, byCenter,
  };
}

export async function setRevenueTarget(ctx: ProtectedContext, input: { centerId: string; period: string; amount: number; newEnrollments?: number | null; note?: string | null }) {
  const ok = ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN" || (a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:configure", {}).allowed));
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Hội sở (kế toán HO / quản trị) đặt mục tiêu doanh thu" });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new TRPCError({ code: "BAD_REQUEST", message: "Kỳ dạng YYYY-MM" });
  if (input.amount < 0 || !Number.isInteger(input.amount)) throw new TRPCError({ code: "BAD_REQUEST", message: "Mục tiêu phải là số nguyên ≥ 0" });
  if (input.period < todayISO().slice(0, 7) && !ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Không sửa mục tiêu của tháng đã qua" });
  const before = await rows<{ amount: number }>(ctx, sql`select amount::float as amount from revenue_targets where center_id = ${input.centerId} and period = ${input.period}`);
  await ctx.db.insert(revenueTargets).values({ centerId: input.centerId, period: input.period, amount: input.amount, newEnrollments: input.newEnrollments ?? null, note: input.note?.trim() || null, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: [revenueTargets.centerId, revenueTargets.period], set: { amount: input.amount, newEnrollments: input.newEnrollments ?? null, note: input.note?.trim() || null, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: before.length ? "UPDATE" : "CREATE", module: "reports", entity: "revenue_targets", entityId: input.centerId, before: before[0] ?? null, after: { period: input.period, amount: input.amount, newEnrollments: input.newEnrollments ?? null }, ip: ctx.ip });
  return { ok: true };
}
