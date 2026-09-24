/**
 * LỊCH HẸN — "gọi lại 19h", "chị ghé xem cơ sở thứ bảy", "cho bé học thử sáng CN".
 *
 * Hẹn mà quên là mất khách, nên màn hộp thư phải luôn thấy hai con số: **24 giờ tới** và **quá hạn**.
 * Ở đây chỉ có nghiệp vụ; định nghĩa "quá hạn / sắp tới / đến giờ nhắc" nằm ở `core/outreach/lichHen`
 * để worker nhắc việc và giao diện không hiểu khác nhau.
 *
 * Quyền: xem theo `lead:read` (tư vấn viên chỉ thấy phần của mình qua bộ lọc cơ sở), tạo/sửa theo
 * `lead:update`. Hẹn gắn với lead nào thì theo cơ sở của lead đó.
 */
import { and, asc, desc, eq, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appointments, conversations, leads, students, studentGuardians, users } from "@satarobo/db";
import {
  authorize, centersWith, validateLichHen, henQuaHan, henSapToi, nhanLichHen, sinhNhatTrongVong,
  APPOINTMENT_KIND_VI, APPOINTMENT_STATUS_VI, SAP_TOI_GIO,
  type AppointmentKind, type AppointmentStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });

/** Giới hạn theo cơ sở người dùng được xem (null = toàn hệ thống) */
function phamVi(ctx: ProtectedContext): SQL {
  const ds = centersWith(ctx.actor, "lead:read");
  if (ds === null) return sql`true`;
  if (ds.length === 0) return sql`false`;
  return or(inArray(appointments.centerId, ds), isNull(appointments.centerId))!;
}

export type LichHenView = "sap_toi" | "qua_han" | "hom_nay" | "tat_ca" | "cua_toi";

export async function dsLichHen(ctx: ProtectedContext, input: { view?: LichHenView; status?: AppointmentStatus; q?: string } = {}) {
  requirePermission(ctx, "lead:read");
  const now = new Date();
  const conds: SQL[] = [phamVi(ctx)];
  if (input.status) conds.push(eq(appointments.status, input.status));
  if (input.view === "qua_han") conds.push(sql`${appointments.status} = 'dat' and ${appointments.at} < now()`);
  if (input.view === "sap_toi") conds.push(sql`${appointments.status} = 'dat' and ${appointments.at} >= now() and ${appointments.at} <= now() + make_interval(hours => ${SAP_TOI_GIO}::int)`);
  if (input.view === "hom_nay") conds.push(sql`(${appointments.at} at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`);
  if (input.view === "cua_toi") conds.push(eq(appointments.assignedTo, ctx.user.id));
  if (input.q?.trim()) conds.push(sql`${appointments.title} ilike ${`%${input.q.trim()}%`}`);

  const rows = await ctx.db
    .select({
      a: appointments,
      nguoiPhuTrach: users.fullName,
      leadTen: leads.parentName,
      leadTrangThai: leads.status,
    })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.assignedTo))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .where(and(...conds))
    .orderBy(input.view === "qua_han" ? desc(appointments.at) : asc(appointments.at))
    .limit(200);

  const [dem] = await ctx.db
    .select({
      sapToi: sql<number>`count(*) filter (where ${appointments.status} = 'dat' and ${appointments.at} >= now() and ${appointments.at} <= now() + make_interval(hours => ${SAP_TOI_GIO}::int))::int`,
      quaHan: sql<number>`count(*) filter (where ${appointments.status} = 'dat' and ${appointments.at} < now())::int`,
      homNay: sql<number>`count(*) filter (where (${appointments.at} at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date)::int`,
      cuaToi: sql<number>`count(*) filter (where ${appointments.assignedTo} = ${ctx.user.id} and ${appointments.status} = 'dat')::int`,
    })
    .from(appointments)
    .where(phamVi(ctx));

  return {
    dem: dem ?? { sapToi: 0, quaHan: 0, homNay: 0, cuaToi: 0 },
    items: rows.map((r) => ({
      id: r.a.id,
      title: r.a.title,
      kind: r.a.kind,
      kindLabel: APPOINTMENT_KIND_VI[r.a.kind as AppointmentKind],
      at: r.a.at,
      durationMin: r.a.durationMin,
      status: r.a.status,
      statusLabel: APPOINTMENT_STATUS_VI[r.a.status as AppointmentStatus],
      note: r.a.note,
      leadId: r.a.leadId,
      leadTen: r.leadTen,
      leadTrangThai: r.leadTrangThai,
      conversationId: r.a.conversationId,
      nguoiPhuTrach: r.nguoiPhuTrach,
      nhan: nhanLichHen({ at: r.a.at, status: r.a.status as AppointmentStatus }, now),
    })),
  };
}

export async function luuLichHen(ctx: ProtectedContext, input: {
  id?: string | null; title: string; at: string; kind?: AppointmentKind; durationMin?: number | null;
  leadId?: string | null; parentId?: string | null; conversationId?: string | null; note?: string | null; assignedTo?: string | null; centerId?: string | null;
}) {
  const at = new Date(input.at);
  const errs = validateLichHen({ title: input.title, at, durationMin: input.durationMin });
  if (errs.length) throw bad(errs.join(", "));

  // Cơ sở lấy theo lead (nếu có) để phân quyền và báo cáo đúng chỗ
  let centerId = input.centerId ?? null;
  if (input.leadId) {
    const l = await ctx.db.query.leads.findFirst({ where: eq(leads.id, input.leadId) });
    if (!l) throw notFound("Không thấy lead");
    centerId = centerId ?? l.centerId;
  }
  if (!authorize(ctx.actor, "lead:update", { centerId }).allowed) throw forbid("Không có quyền đặt lịch hẹn ở cơ sở này");

  const cu = input.id ? await ctx.db.query.appointments.findFirst({ where: eq(appointments.id, input.id) }) : null;
  if (input.id && !cu) throw notFound("Không thấy lịch hẹn");
  const giaTri = {
    title: input.title.trim(),
    kind: input.kind ?? cu?.kind ?? "goi_lai",
    at,
    durationMin: input.durationMin ?? cu?.durationMin ?? 30,
    leadId: input.leadId ?? cu?.leadId ?? null,
    parentId: input.parentId ?? cu?.parentId ?? null,
    conversationId: input.conversationId ?? cu?.conversationId ?? null,
    note: input.note ?? cu?.note ?? null,
    centerId,
    assignedTo: input.assignedTo ?? cu?.assignedTo ?? ctx.user.id,
    createdBy: cu?.createdBy ?? ctx.user.id,
    // Dời giờ hẹn thì phải nhắc lại
    remindedAt: cu && cu.at.getTime() !== at.getTime() ? null : (cu?.remindedAt ?? null),
  };
  const [row] = cu
    ? await ctx.db.update(appointments).set(giaTri).where(eq(appointments.id, cu.id)).returning()
    : await ctx.db.insert(appointments).values(giaTri).returning();
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: cu ? "UPDATE" : "CREATE", module: "lead", entity: "appointments", entityId: row!.id,
    after: { title: giaTri.title, at: at.toISOString(), kind: giaTri.kind, leadId: giaTri.leadId }, ip: ctx.ip,
  });
  return { id: row!.id };
}

export async function doiTrangThaiLichHen(ctx: ProtectedContext, input: { id: string; status: AppointmentStatus; note?: string | null }) {
  const h = await ctx.db.query.appointments.findFirst({ where: eq(appointments.id, input.id) });
  if (!h) throw notFound("Không thấy lịch hẹn");
  if (!authorize(ctx.actor, "lead:update", { centerId: h.centerId, ownerIds: h.assignedTo ? [h.assignedTo] : [] }).allowed) throw forbid("Không có quyền sửa lịch hẹn này");
  if (h.status !== "dat") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Lịch hẹn đã ở trạng thái "${APPOINTMENT_STATUS_VI[h.status as AppointmentStatus]}"` });
  await ctx.db.update(appointments).set({
    status: input.status,
    doneAt: input.status === "xong" ? new Date() : null,
    note: input.note?.trim() ? `${h.note ? `${h.note}\n` : ""}${input.note.trim()}` : h.note,
  }).where(eq(appointments.id, h.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "lead", entity: "appointments", entityId: h.id, before: { status: h.status }, after: { status: input.status }, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sự kiện sắp tới — khối nhỏ cạnh hộp thư                              */
/* ------------------------------------------------------------------ */

/**
 * Ba thứ khiến người trực máy phải hành động hôm nay: hẹn trong 24 giờ, hẹn đã quá hạn,
 * và sinh nhật học viên trong 7 ngày (cớ chăm sóc rẻ nhất mà hiệu quả nhất).
 */
export async function suKienSapToi(ctx: ProtectedContext, input: { soNgaySinhNhat?: number } = {}) {
  requirePermission(ctx, "lead:read");
  const now = new Date();
  const soNgay = Math.min(30, Math.max(1, input.soNgaySinhNhat ?? 7));

  const hen = await ctx.db
    .select({ id: appointments.id, title: appointments.title, at: appointments.at, status: appointments.status, leadId: appointments.leadId, conversationId: appointments.conversationId, nguoiPhuTrach: users.fullName })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.assignedTo))
    .where(and(phamVi(ctx), eq(appointments.status, "dat"), lte(appointments.at, new Date(now.getTime() + SAP_TOI_GIO * 3600_000))))
    .orderBy(asc(appointments.at))
    .limit(50);

  const centers = centersWith(ctx.actor, "student:read");
  const hocVien = await ctx.db
    .select({ id: students.id, name: students.fullName, dob: students.dateOfBirth, centerId: students.homeCenterId })
    .from(students)
    .where(and(
      sql`${students.dateOfBirth} is not null`,
      eq(students.status, "active"),
      centers === null ? sql`true` : centers.length ? inArray(students.homeCenterId, centers) : sql`false`,
      // Chỉ lấy các bé có sinh nhật rơi vào cửa sổ ngày/tháng — lọc thô ở SQL, chốt lại ở core
      sql`((date_part('doy', ${students.dateOfBirth}::date) - date_part('doy', now())) + 366) % 366 <= ${soNgay}`,
    ))
    .limit(100);

  const sinhNhat = hocVien
    .map((h) => ({ ...h, con: sinhNhatTrongVong(h.dob, now, soNgay) }))
    .filter((h) => h.con !== null)
    .sort((a, b) => (a.con ?? 0) - (b.con ?? 0))
    .slice(0, 30)
    .map((h) => ({ id: h.id, name: h.name, con: h.con as number }));

  return {
    hen24h: hen.filter((h) => henSapToi({ at: h.at, status: h.status as AppointmentStatus }, now)).map((h) => ({ ...h, nhan: nhanLichHen({ at: h.at, status: h.status as AppointmentStatus }, now) })),
    henQuaHan: hen.filter((h) => henQuaHan({ at: h.at, status: h.status as AppointmentStatus }, now)).map((h) => ({ ...h, nhan: nhanLichHen({ at: h.at, status: h.status as AppointmentStatus }, now) })),
    sinhNhat,
    soNgay,
  };
}

/** Gợi ý người/lead để gắn vào hẹn — dùng cho ô chọn nhanh khi tạo hẹn từ hội thoại */
export async function goiYGanHen(ctx: ProtectedContext, input: { conversationId: string }) {
  requirePermission(ctx, "lead:read");
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.conversationId) });
  if (!c) throw notFound("Không tìm thấy hội thoại");
  const ten = c.displayName ?? "Khách";
  let hocVienIds: string[] = [];
  if (c.parentId) {
    const kids = await ctx.db.select({ id: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.parentId, c.parentId));
    hocVienIds = kids.map((k) => k.id);
  }
  return { ten, leadId: c.leadId, parentId: c.parentId, centerId: c.centerId, hocVienIds };
}
