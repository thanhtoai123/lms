import { and, desc, eq, ilike, inArray, isNull, or, sql, type Column, type SQL } from "drizzle-orm";
import { classes, leads, orders, parents, studentGuardians, students } from "@satarobo/db";
import { centersWith, hasPermission, normalizeVnPhone, maskPhone, LEAD_STATUS_VI, type LeadStatus, type Permission } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";

export type SearchHit = { kind: "student" | "lead" | "class" | "order"; id: string; title: string; sub: string; href: string };

const esc = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Điều kiện phạm vi cơ sở; undefined = không có quyền */
function scope(ctx: ProtectedContext, perm: Permission, col: Column): SQL | undefined {
  const c = centersWith(ctx.actor, perm);
  if (c === null) return sql`true`;
  if (!c.length) return undefined;
  return inArray(col, c);
}

export const SEARCH_KINDS = ["student", "lead", "class", "order"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_KIND_VI: Record<SearchKind, string> = { student: "Học viên", lead: "Khách hàng (lead)", class: "Lớp học", order: "Đơn hàng" };

export interface GlobalSearchInput {
  q: string;
  /** Chỉ tìm trong một loại (trang /search khi lọc) */
  kind?: SearchKind;
  /** Số kết quả mỗi loại — mặc định nhỏ cho Ctrl+K, lớn hơn cho trang /search */
  perKind?: number;
  /** Phân trang đơn giản cho trang /search (1-based) */
  page?: number;
}

/**
 * Tìm nhanh toàn hệ thống (bảng lệnh Ctrl+K và trang /search): học viên, lead, lớp, đơn hàng —
 * theo quyền và cơ sở của người dùng. SĐT chỉ dùng để khớp, kết quả luôn che số.
 */
export async function globalSearch(ctx: ProtectedContext, input: GlobalSearchInput) {
  const q = input.q.trim().slice(0, 80);
  if (q.length < 2) return { q, hits: [] as SearchHit[], page: 1, perKind: 0, hasMore: false };
  const like = `%${esc(q)}%`;
  const phone = normalizeVnPhone(q);
  const page = Math.max(1, input.page ?? 1);
  const per = Math.min(50, Math.max(1, input.perKind ?? 6));
  const off = (page - 1) * per;
  const want = (k: SearchKind) => !input.kind || input.kind === k;
  const tasks: Promise<SearchHit[]>[] = [];

  const sScope = scope(ctx, "student:read", students.homeCenterId);
  if (sScope && want("student")) {
    tasks.push((async () => {
      const byPhone = phone
        ? sql`exists (select 1 from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} and p.phone = ${phone})`
        : sql`false`;
      const rows = await ctx.db.select({ id: students.id, name: students.fullName, code: students.code, birth: students.dateOfBirth })
        .from(students).where(and(isNull(students.deletedAt), sScope, tenantCond(ctx, students), or(ilike(students.fullName, like), ilike(students.code, like), byPhone)))
        .orderBy(desc(students.createdAt)).limit(per + 1).offset(off);
      return rows.map((r) => ({ kind: "student" as const, id: r.id, title: r.name, sub: [r.code, r.birth ? `SN ${String(r.birth).slice(0, 4)}` : null].filter(Boolean).join(" · "), href: `/students/${r.id}` }));
    })());
  }

  const lScope = scope(ctx, "lead:read", leads.centerId);
  const onlyMine = !lScope && hasPermission(ctx.actor, "lead:read_own");
  if ((lScope || onlyMine) && want("lead")) {
    tasks.push((async () => {
      // Chỉ lead:read_own: lead của mình + lead đã bật dùng chung ("Dùng chung cho CSKH cùng cơ sở")
      const own = onlyMine ? or(eq(leads.assignedToId, ctx.user.id), eq(leads.sharedWithCenter, true))! : or(lScope!, isNull(leads.centerId))!;
      const rows = await ctx.db.select({ id: leads.id, parent: leads.parentName, child: leads.childName, phone: leads.phoneNormalized, status: leads.status })
        .from(leads).where(and(isNull(leads.deletedAt), isNull(leads.anonymizedAt), own, tenantCond(ctx, leads), or(ilike(leads.parentName, like), ilike(leads.childName, like), phone ? eq(leads.phoneNormalized, phone) : sql`false`)))
        .orderBy(desc(leads.lastTouchAt)).limit(per + 1).offset(off);
      return rows.map((r) => ({ kind: "lead" as const, id: r.id, title: r.child ? `${r.parent} — ${r.child}` : r.parent, sub: `${maskPhone(r.phone)} · ${LEAD_STATUS_VI[r.status as LeadStatus] ?? r.status}`, href: `/leads/${r.id}` }));
    })());
  }

  const cScope = scope(ctx, "class:read", classes.centerId);
  if (cScope && !phone && want("class")) {
    tasks.push((async () => {
      const rows = await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name, })
        .from(classes).where(and(isNull(classes.deletedAt), cScope, tenantCond(ctx, classes), or(ilike(classes.code, like), ilike(classes.name, like))))
        .orderBy(desc(classes.createdAt)).limit(per + 1).offset(off);
      return rows.map((r) => ({ kind: "class" as const, id: r.id, title: r.name, sub: r.code, href: `/classes/${r.id}` }));
    })());
  }

  const oScope = scope(ctx, "finance:read", orders.centerId);
  if (oScope && want("order")) {
    tasks.push((async () => {
      const rows = await ctx.db.select({ id: orders.id, code: orders.code, name: orders.customerName, total: orders.total })
        .from(orders).where(and(oScope, tenantCond(ctx, orders), or(ilike(orders.code, like), phone ? inArray(orders.customerPhone, [phone, `0${phone.slice(2)}`]) : sql`false`)))
        .orderBy(desc(orders.createdAt)).limit(per + 1).offset(off);
      return rows.map((r) => ({ kind: "order" as const, id: r.id, title: `${r.code} — ${r.name}`, sub: `${Number(r.total).toLocaleString("vi-VN")}đ`, href: `/orders/${r.id}` }));
    })());
  }

  const groups = await Promise.all(tasks);
  // limit lấy dư 1 dòng mỗi loại để biết còn trang sau
  const hasMore = groups.some((g) => g.length > per);
  const hits = groups.flatMap((g) => g.slice(0, per));
  return { q, hits, page, perKind: per, hasMore };
}
