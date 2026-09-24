/**
 * NHÃN HỘI THOẠI — thứ người bán hàng dùng để tự sắp việc.
 *
 * Khác `conversations.flags` (cờ do hệ thống tự gắn khi thấy từ nhạy cảm / số tài khoản riêng),
 * nhãn ở đây do trung tâm tự đặt: "Lộ trình ngắn hạn", "Chờ báo giá", "Đã hẹn học thử"… Nhãn sửa
 * được, đổi màu được, và lọc được ngay trên hộp thư — đúng cách công cụ CRM Zalo đang làm.
 *
 * Quyền: xem theo `message:read`; tạo/sửa nhãn cần `message:update` (quản lý), gắn/bỏ nhãn thì chỉ
 * cần quyền sửa hội thoại đó — nhân viên trực máy phải gắn được nhãn, nếu không thì không ai dùng.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { conversations, conversationTags, conversationTagLinks } from "@satarobo/db";
import { authorize, authorizeGlobal, validateTag, TAG_COLORS, TAG_MAX_PER_CONV, type TagColor } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });

/** Danh mục nhãn + số hội thoại đang mang từng nhãn (để hiện cạnh tên như ZCRM) */
export async function danhSachNhan(ctx: ProtectedContext) {
  requirePermission(ctx, "message:read");
  const rows = await ctx.db
    .select({
      id: conversationTags.id,
      name: conversationTags.name,
      color: conversationTags.color,
      active: conversationTags.active,
      sortOrder: conversationTags.sortOrder,
      soHoiThoai: sql<number>`(select count(*) from ${conversationTagLinks} l join ${conversations} c on c.id = l.conversation_id where l.tag_id = ${conversationTags.id} and c.status <> 'closed')::int`,
    })
    .from(conversationTags)
    .orderBy(asc(conversationTags.sortOrder), asc(conversationTags.name));
  return rows;
}

export async function luuNhan(ctx: ProtectedContext, input: { id?: string | null; name: string; color?: string | null; sortOrder?: number | null; active?: boolean }) {
  if (!authorizeGlobal(ctx.actor, "message:update") && !ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:update", { centerId: a.centerId }).allowed)) {
    throw forbid("Không có quyền quản lý nhãn hội thoại");
  }
  const errs = validateTag(input.name);
  if (errs.length) throw bad(errs.join(", "));
  const color = (TAG_COLORS as readonly string[]).includes(input.color ?? "") ? (input.color as TagColor) : "slate";
  const name = input.name.trim();
  const cu = input.id ? await ctx.db.query.conversationTags.findFirst({ where: eq(conversationTags.id, input.id) }) : null;
  if (input.id && !cu) throw notFound("Không thấy nhãn");
  const giaTri = { name, color, sortOrder: input.sortOrder ?? cu?.sortOrder ?? 0, active: input.active ?? cu?.active ?? true, createdBy: cu?.createdBy ?? ctx.user.id };
  const [row] = cu
    ? await ctx.db.update(conversationTags).set(giaTri).where(eq(conversationTags.id, cu.id)).returning()
    : await ctx.db.insert(conversationTags).values(giaTri).returning();
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: cu ? "UPDATE" : "CREATE", module: "message", entity: "conversation_tags", entityId: row!.id, after: giaTri, ip: ctx.ip });
  return { id: row!.id };
}

/**
 * Gắn / bỏ nhãn cho một hội thoại. Nhận nguyên danh sách nhãn muốn có (giống hộp chọn nhiều),
 * tự tính phần thêm và phần bớt — gọi lại nhiều lần vẫn ra cùng kết quả.
 */
export async function ganNhan(ctx: ProtectedContext, input: { conversationId: string; tagIds: string[] }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.conversationId) });
  if (!c) throw notFound("Không tìm thấy hội thoại");
  if (!authorize(ctx.actor, "message:update", { centerId: c.centerId, ownerIds: c.assignedTo ? [c.assignedTo] : [] }).allowed) throw forbid("Không có quyền sửa hội thoại này");
  const ids = [...new Set(input.tagIds)].slice(0, TAG_MAX_PER_CONV);
  if (ids.length) {
    const co = await ctx.db.select({ id: conversationTags.id }).from(conversationTags).where(and(inArray(conversationTags.id, ids), eq(conversationTags.active, true)));
    if (co.length !== ids.length) throw bad("Có nhãn không tồn tại hoặc đã tắt");
  }
  const dangCo = await ctx.db.select({ tagId: conversationTagLinks.tagId }).from(conversationTagLinks).where(eq(conversationTagLinks.conversationId, c.id));
  const cu = new Set(dangCo.map((x) => x.tagId));
  const them = ids.filter((x) => !cu.has(x));
  const bot = [...cu].filter((x) => !ids.includes(x));
  if (them.length) await ctx.db.insert(conversationTagLinks).values(them.map((tagId) => ({ conversationId: c.id, tagId, taggedBy: ctx.user.id }))).onConflictDoNothing();
  if (bot.length) await ctx.db.delete(conversationTagLinks).where(and(eq(conversationTagLinks.conversationId, c.id), inArray(conversationTagLinks.tagId, bot)));
  return { them: them.length, bot: bot.length };
}
