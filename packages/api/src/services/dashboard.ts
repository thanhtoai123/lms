import { and, eq, inArray, isNull, or, sql, desc, gte, type SQL } from "drizzle-orm";
import { leads, students, sessions, classes, careTasks, sessionMedia } from "@satarobo/db";
import { OPEN_LEAD_STATUSES, computeSla, authorize, maskPhone, hasRole, visibleCenterIds, type LeadStatus, type Permission } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { todayISO, overdueQueue } from "./sessions";
import { resolveAdmissionsPolicy } from "./admissionsAdmin";

const TZ = "Asia/Ho_Chi_Minh";

export interface QueueItem {
  key: string;
  title: string;
  count: number;
  overdue: number;
  href: string;
  preview: string[];
}

/**
 * Dashboard khu quản trị — tương đương trang /dashboard của hệ cũ:
 * khối "Cần xử lý" (hàng đợi có đếm quá hạn), thẻ KPI, lead 14 ngày, phân bố trạng thái, lead mới nhất.
 * Mỗi khối chỉ tính khi người dùng có quyền tương ứng; mọi số liệu giới hạn theo cơ sở được thấy.
 */
export async function adminOverview(ctx: ProtectedContext) {
  const { db, actor } = ctx;
  const visible = visibleCenterIds(actor);
  const scope = (col: typeof leads.centerId | typeof classes.centerId | typeof careTasks.centerId | typeof students.homeCenterId): SQL =>
    visible === null ? sql`true` : visible.length ? (or(inArray(col, visible), isNull(col)) as SQL) : sql`false`;

  // Kiểm tra chặt (không tính quyền *_own): dashboard tổng hợp dữ liệu cả cơ sở
  const can = (p: Permission) => authorize(actor, p, {}).allowed;
  const canLead = can("lead:read");
  const canClass = can("session:read");
  const canCare = can("care:read");
  const canMedia = can("media:update");
  const canStudent = can("student:read");
  const today = todayISO();
  const now = new Date();

  const queues: QueueItem[] = [];

  // 1) Buổi học chưa hoàn tất (đã qua ngày)
  if (canClass) {
    const q = await overdueQueue(ctx, { limit: 3 });
    queues.push({ key: "sessions", title: "Buổi học chưa hoàn tất", count: q.total, overdue: q.total, href: "/sessions", preview: q.items.map((s) => `${s.classCode} · buổi ${s.sequenceNo} (${s.date.split("-").reverse().join("/")})`) });
  }

  // 2) Ảnh chờ duyệt
  if (canMedia) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${sessionMedia.createdAt} < now() - interval '24 hours')::int` })
      .from(sessionMedia)
      .innerJoin(sessions, eq(sessions.id, sessionMedia.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .where(and(eq(sessionMedia.status, "pending"), scope(classes.centerId)));
    queues.push({ key: "media", title: "Ảnh chờ duyệt", count: rows[0]?.n ?? 0, overdue: rows[0]?.old ?? 0, href: "/duyet-media", preview: [] });
  }

  // 3) Cảnh báo rủi ro + 4) Việc chăm sóc HV (cùng nguồn care_tasks: rủi ro tự động vs việc tay)
  if (canCare) {
    const open = and(inArray(careTasks.status, ["open", "in_progress", "escalated"]), scope(careTasks.centerId));
    const rows = await db
      .select({
        auto: sql<number>`count(*) filter (where ${careTasks.code} <> 'MANUAL')::int`,
        autoOver: sql<number>`count(*) filter (where ${careTasks.code} <> 'MANUAL' and ${careTasks.dueAt} < now())::int`,
        all: sql<number>`count(*)::int`,
        allOver: sql<number>`count(*) filter (where ${careTasks.dueAt} < now())::int`,
      })
      .from(careTasks)
      .where(open);
    const top = await db
      .select({ title: careTasks.title, name: students.fullName, code: careTasks.code })
      .from(careTasks)
      .innerJoin(students, eq(students.id, careTasks.studentId))
      .where(open)
      .orderBy(careTasks.severity, careTasks.dueAt)
      .limit(3);
    queues.push({ key: "risks", title: "Cảnh báo rủi ro HV", count: rows[0]?.auto ?? 0, overdue: rows[0]?.autoOver ?? 0, href: "/canh-bao-rui-ro", preview: top.filter((t) => t.code !== "MANUAL").map((t) => `${t.name} — ${t.code}`) });
    queues.push({ key: "care", title: "Việc chăm sóc HV", count: rows[0]?.all ?? 0, overdue: rows[0]?.allOver ?? 0, href: "/cham-soc-hv", preview: top.map((t) => `${t.title} — ${t.name}`) });
  }

  // 5) Khách đã đăng ký quá lâu (chờ quyết định / đã học thử > 3 ngày chưa chốt) + 6) Lead cần xử lý
  let leadBlock: null | {
    kpi: { newThisMonth: number; newLastMonth: number; trialsToday: number; total: number; enrolled: number };
    series: { day: string; n: number }[];
    byStatus: { status: LeadStatus; n: number }[];
    latest: { id: string; parentName: string; phone: string; status: LeadStatus; createdAt: Date }[];
  } = null;
  if (canLead) {
    const policy = await resolveAdmissionsPolicy(db, null);
    const openRows = await db
      .select({ id: leads.id, parentName: leads.parentName, status: leads.status, lastTouchAt: leads.lastTouchAt })
      .from(leads)
      .where(and(isNull(leads.deletedAt), inArray(leads.status, [...OPEN_LEAD_STATUSES]), scope(leads.centerId)))
      .orderBy(leads.lastTouchAt);
    const nowIso = now.toISOString();
    const withSla = openRows.map((r) => ({ ...r, sla: computeSla(r.status, r.lastTouchAt.toISOString(), nowIso, policy.sla) }));
    const stuck = withSla.filter((r) => (r.status === "trial_done" || r.status === "deciding") && now.getTime() - r.lastTouchAt.getTime() > 3 * 86_400_000);
    queues.push({ key: "stuck", title: "Khách chờ chốt quá lâu", count: stuck.length, overdue: stuck.length, href: "/leads/bulk-convert", preview: stuck.slice(0, 3).map((r) => r.parentName) });
    const overdueLeads = withSla.filter((r) => r.sla.level === "overdue");
    queues.push({ key: "leads", title: "Lead cần xử lý", count: withSla.length, overdue: overdueLeads.length, href: "/leads", preview: overdueLeads.slice(0, 3).map((r) => r.parentName) });

    const scoped = and(isNull(leads.deletedAt), scope(leads.centerId));
    const [k] = await db
      .select({
        newThisMonth: sql<number>`count(*) filter (where ${leads.createdAt} >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})::int`,
        newLastMonth: sql<number>`count(*) filter (where ${leads.createdAt} >= (date_trunc('month', now() at time zone ${TZ}) - interval '1 month') at time zone ${TZ} and ${leads.createdAt} < date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})::int`,
        trialsToday: sql<number>`count(*) filter (where ${leads.status} = 'trial_scheduled' and (${leads.nextActionAt} at time zone ${TZ})::date = ${today}::date)::int`,
        total: sql<number>`count(*)::int`,
        enrolled: sql<number>`count(*) filter (where ${leads.status} = 'enrolled')::int`,
      })
      .from(leads)
      .where(scoped);
    const series = await db
      .select({ day: sql<string>`to_char((${leads.createdAt} at time zone ${TZ})::date, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(scoped, gte(leads.createdAt, new Date(now.getTime() - 14 * 86_400_000))))
      .groupBy(sql`1`);
    const days: { day: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
      days.push({ day: d, n: series.find((s) => s.day === d)?.n ?? 0 });
    }
    const byStatus = await db.select({ status: leads.status, n: sql<number>`count(*)::int` }).from(leads).where(scoped).groupBy(leads.status);
    const latest = await db
      .select({ id: leads.id, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, status: leads.status, createdAt: leads.createdAt })
      .from(leads)
      .where(scoped)
      .orderBy(desc(leads.createdAt))
      .limit(8);
    const full = hasRole(actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE", "HO_MARKETING");
    leadBlock = {
      kpi: k ?? { newThisMonth: 0, newLastMonth: 0, trialsToday: 0, total: 0, enrolled: 0 },
      series: days,
      byStatus,
      latest: latest.map((l) => ({ id: l.id, parentName: l.parentName, phone: full ? l.phoneNormalized : maskPhone(l.phoneNormalized), status: l.status, createdAt: l.createdAt })),
    };
  }

  // KPI lớp/học viên
  let teachersToday: number | null = null;
  let sessionsToday: number | null = null;
  if (canClass) {
    const [r] = await db
      .select({ t: sql<number>`count(distinct ${sessions.teacherId})::int`, s: sql<number>`count(*)::int` })
      .from(sessions)
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .where(and(eq(sessions.date, today), sql`${sessions.status} not in ('cancelled','rescheduled')`, scope(classes.centerId)));
    teachersToday = r?.t ?? 0;
    sessionsToday = r?.s ?? 0;
  }
  let totalStudents: number | null = null;
  if (canStudent) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(students).where(and(isNull(students.deletedAt), inArray(students.status, ["active", "trial"]), scope(students.homeCenterId)));
    totalStudents = r?.n ?? 0;
  }

  const totalOverdue = queues.reduce((a, q) => a + q.overdue, 0);
  const totalTasks = queues.reduce((a, q) => a + q.count, 0);
  return { today, queues, totalOverdue, totalTasks, leads: leadBlock, teachersToday, sessionsToday, totalStudents };
}

