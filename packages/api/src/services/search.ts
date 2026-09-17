import { and, desc, eq, ilike, inArray, isNull, or, sql, type Column, type SQL } from "drizzle-orm";
import { classes, leads, orders, parents, studentGuardians, students } from "@satarobo/db";
import { centersWith, hasPermission, normalizeVnPhone, maskPhone, LEAD_STATUS_VI, type LeadStatus, type Permission } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";

export type SearchHit = { kind: "student" | "lead" | "class" | "order"; id: string; title: string; sub: string; href: string };

const esc = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Điều kiện phạm vi cơ sở; undefined = không có quyền */
function scope(ctx: ProtectedContext, perm: Permission, col: Column): SQL | undefined {
  const c = centersWith(ctx.actor, perm);
  if (c === null) return sql`true`;
  if (!c.length) return undefined;
  return inArray(col, c);
}

/**
 * Tìm nhanh toàn hệ thống (bảng lệnh Ctrl+K): học viên, lead, lớp, đơn hàng — theo quyền và cơ sở của người dùng.
 * SĐT chỉ dùng để khớp, kết quả luôn che số.
 */
export async function globalSearch(ctx: ProtectedContext, input: { q: string }) {
  const q = input.q.trim().slice(0, 80);
  if (q.length < 2) return { q, hits: [] as SearchHit[] };
  const like = `%${esc(q)}%`;
  const phone = normalizeVnPhone(q);
  const tasks: Promise<SearchHit[]>[] = [];

  const sScope = scope(ctx, "student:read", students.homeCenterId);
  if (sScope) {
    tasks.push((async () => {
      const byPhone = phone
        ? sql`exists (select 1 from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} and p.phone = ${phone})`
        : sql`false`;
      const rows = await ctx.db.select({ id: students.id, name: students.fullName, code: students.code, birth: students.dateOfBirth })
        .from(students).where(and(isNull(students.deletedAt), sScope, or(ilike(students.fullName, like), ilike(students.code, like), byPhone)))
        .orderBy(desc(students.createdAt)).limit(6);
      return rows.map((r) => ({ kind: "student" as const, id: r.id, title: r.name, sub: [r.code, r.birth ? `SN ${String(r.birth).slice(0, 4)}` : null].filter(Boolean).join(" · "), href: `/students/${r.id}` }));
    })());
  }

  const lScope = scope(ctx, "lead:read", leads.centerId);
  const onlyMine = !lScope && hasPermission(ctx.actor, "lead:read_own");
  if (lScope || onlyMine) {
    tasks.push((async () => {
      const own = onlyMine ? eq(leads.assignedToId, ctx.user.id) : or(lScope!, isNull(leads.centerId))!;
      const rows = await ctx.db.select({ id: leads.id, parent: leads.parentName, child: leads.childName, phone: leads.phoneNormalized, status: leads.status })
        .from(leads).where(and(isNull(leads.deletedAt), isNull(leads.anonymizedAt), own, or(ilike(leads.parentName, like), ilike(leads.childName, like), phone ? eq(leads.phoneNormalized, phone) : sql`false`)))
        .orderBy(desc(leads.lastTouchAt)).limit(6);
      return rows.map((r) => ({ kind: "lead" as const, id: r.id, title: r.child ? `${r.parent} — ${r.child}` : r.parent, sub: `${maskPhone(r.phone)} · ${LEAD_STATUS_VI[r.status as LeadStatus] ?? r.status}`, href: `/leads/${r.id}` }));
    })());
  }

  const cScope = scope(ctx, "class:read", classes.centerId);
  if (cScope && !phone) {
    tasks.push((async () => {
      const rows = await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name, })
        .from(classes).where(and(isNull(classes.deletedAt), cScope, or(ilike(classes.code, like), ilike(classes.name, like))))
        .orderBy(desc(classes.createdAt)).limit(5);
      return rows.map((r) => ({ kind: "class" as const, id: r.id, title: r.name, sub: r.code, href: `/classes/${r.id}` }));
    })());
  }

  const oScope = scope(ctx, "finance:read", orders.centerId);
  if (oScope) {
    tasks.push((async () => {
      const rows = await ctx.db.select({ id: orders.id, code: orders.code, name: orders.customerName, total: orders.total })
        .from(orders).where(and(oScope, or(ilike(orders.code, like), phone ? inArray(orders.customerPhone, [phone, `0${phone.slice(2)}`]) : sql`false`)))
        .orderBy(desc(orders.createdAt)).limit(5);
      return rows.map((r) => ({ kind: "order" as const, id: r.id, title: `${r.code} — ${r.name}`, sub: `${Number(r.total).toLocaleString("vi-VN")}đ`, href: `/orders/${r.id}` }));
    })());
  }

  const hits = (await Promise.all(tasks)).flat();
  return { q, hits };
}
