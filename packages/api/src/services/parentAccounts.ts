import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql, desc, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parents, parentNotifications, studentGuardians, students, centers } from "@satarobo/db";
import { isEmail, maskPhone, normalizeVnPhone, visibleCenterIds, MemoryRateLimiter, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { queueEmail } from "./admin";
import { canSeeFullPhone } from "./students";

type Db = ProtectedContext["db"];
/** Trang phụ huynh đăng nhập / kích hoạt tài khoản bằng mã từ trung tâm */
const ACTIVATION_URL = "/ph/dang-nhap";
/** Tham chiếu đủ tên bảng cho truy vấn con tương quan (select 1 bảng, drizzle không kèm tên bảng) */
const PARENT_ID = sql.raw('"parents"."id"');
export const PARENT_ACCOUNT_STATUSES = ["none", "pending_activation", "active", "locked"] as const;
export type ParentAccountStatus = (typeof PARENT_ACCOUNT_STATUSES)[number];

const CODE_TTL_HOURS = 72;
export const hashActivationCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** PH được thấy nếu có ít nhất một con thuộc cơ sở người dùng được xem */
function parentScope(ctx: ProtectedContext) {
  const visible = visibleCenterIds(ctx.actor);
  if (visible === null) return sql`true`;
  if (!visible.length) return sql`false`;
  return sql`exists (select 1 from ${studentGuardians} g join ${students} s on s.id = g.student_id where g.parent_id = ${PARENT_ID} and ${inArray(sql`s.home_center_id`, visible)})`;
}

export async function listParentAccounts(ctx: ProtectedContext, input: { q?: string; status?: ParentAccountStatus; page?: number; pageSize?: number }) {
  requirePermission(ctx, "parent_account:read", {});
  const conds = [isNull(parents.deletedAt), parentScope(ctx)];
  if (input.status) conds.push(eq(parents.accountStatus, input.status));
  if (input.q) {
    const pn = normalizeVnPhone(input.q);
    conds.push(or(ilike(parents.fullName, `%${input.q}%`), pn ? eq(parents.phone, pn) : sql`false`)!);
  }
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const page = Math.max(1, input.page ?? 1);
  const [total] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(parents).where(and(...conds));
  const [counts] = await ctx.db
    .select({
      none: sql<number>`count(*) filter (where ${parents.accountStatus} = 'none')::int`,
      pending: sql<number>`count(*) filter (where ${parents.accountStatus} = 'pending_activation')::int`,
      active: sql<number>`count(*) filter (where ${parents.accountStatus} = 'active')::int`,
      locked: sql<number>`count(*) filter (where ${parents.accountStatus} = 'locked')::int`,
    })
    .from(parents).where(and(isNull(parents.deletedAt), parentScope(ctx)));
  const rows = await ctx.db
    .select({
      id: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email, accountStatus: parents.accountStatus,
      activationRequestedAt: parents.activationRequestedAt, activatedAt: parents.activatedAt, activationCodeExpiresAt: parents.activationCodeExpiresAt,
      mediaConsent: parents.mediaConsent, createdAt: parents.createdAt,
      children: sql<string | null>`(select string_agg(s.full_name || coalesce(' (' || c.code || ')', ''), ', ') from ${studentGuardians} g join ${students} s on s.id = g.student_id left join ${centers} c on c.id = s.home_center_id where g.parent_id = ${PARENT_ID})`,
    })
    .from(parents).where(and(...conds)).orderBy(desc(parents.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const full = canSeeFullPhone(ctx);
  const now = Date.now();
  return {
    total: total?.n ?? 0, page, pageSize, counts,
    items: rows.map((r) => ({ ...r, phone: full ? r.phone : maskPhone(r.phone), codeValid: !!r.activationCodeExpiresAt && r.activationCodeExpiresAt.getTime() > now })),
  };
}

async function loadParent(ctx: ProtectedContext, id: string) {
  const [p] = await ctx.db.select().from(parents).where(and(eq(parents.id, id), isNull(parents.deletedAt), parentScope(ctx))).limit(1);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy phụ huynh" });
  return p;
}

/**
 * Cấp mã kích hoạt tại quầy (6 số, hiệu lực 72 giờ). Chỉ lưu băm; mã gốc trả về đúng một lần để đọc cho PH.
 * PH vào trang kích hoạt, nhập SĐT + mã (hoặc OTP Zalo khi đã tích hợp) rồi tự đặt mật khẩu.
 */
export async function issueActivationCode(ctx: ProtectedContext, input: { parentId: string }) {
  requirePermission(ctx, "parent_account:update", {});
  const p = await loadParent(ctx, input.parentId);
  if (p.accountStatus === "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tài khoản đã kích hoạt" });
  if (p.accountStatus === "locked") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tài khoản đang bị khoá — mở khoá trước" });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600_000);
  await ctx.db.transaction(async (tx) => {
    await tx.update(parents).set({ accountStatus: "pending_activation", activationRequestedAt: p.activationRequestedAt ?? new Date(), activationCodeHash: hashActivationCode(code), activationCodeExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(parents.id, p.id));
    // không ghi mã vào audit
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "parent_accounts", entity: "parents", entityId: p.id, after: { action: "issue_activation_code", expiresAt }, ip: ctx.ip });
  });
  return { code, expiresAt };
}

/**
 * Gửi lại mã kích hoạt hàng loạt cho phụ huynh chưa nhận (chưa cấp / chờ kích hoạt).
 * Mỗi PH được cấp mã mới (chỉ lưu băm) rồi xếp vào **hàng đợi thông báo** kênh ZNS:
 * worker gửi theo giờ yên lặng + trần tin/ngày; có email thì gửi thêm email mẫu PARENT_ACTIVATION.
 * Mã không bao giờ được ghi vào nhật ký.
 */
export async function resendActivationCodes(ctx: ProtectedContext, input: { parentIds: string[] }) {
  requirePermission(ctx, "parent_account:update", {});
  const ids = [...new Set(input.parentIds)];
  if (!ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ít nhất một phụ huynh" });
  if (ids.length > 300) throw new TRPCError({ code: "BAD_REQUEST", message: "Mỗi lượt gửi tối đa 300 phụ huynh" });
  const rows = await ctx.db.select().from(parents).where(and(inArray(parents.id, ids), isNull(parents.deletedAt), parentScope(ctx)));
  const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600_000);
  const hetHan = expiresAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const skipped: { id: string; fullName: string; reason: string }[] = [];
  const targets = rows.filter((p) => {
    if (p.accountStatus === "active") { skipped.push({ id: p.id, fullName: p.fullName, reason: "Tài khoản đã kích hoạt" }); return false; }
    if (p.accountStatus === "locked") { skipped.push({ id: p.id, fullName: p.fullName, reason: "Tài khoản đang bị khoá" }); return false; }
    if (p.processingRestricted) { skipped.push({ id: p.id, fullName: p.fullName, reason: "Phụ huynh đã hạn chế xử lý dữ liệu" }); return false; }
    return true;
  });
  for (const id of ids) if (!rows.some((r) => r.id === id)) skipped.push({ id, fullName: "?", reason: "Không tìm thấy hoặc ngoài phạm vi cơ sở" });
  if (!targets.length) return { queued: 0, emailed: 0, skipped };

  let emailed = 0;
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    for (const p of targets) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.update(parents)
        .set({ accountStatus: "pending_activation", activationRequestedAt: p.activationRequestedAt ?? new Date(), activationCodeHash: hashActivationCode(code), activationCodeExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(parents.id, p.id));
      await tx.insert(parentNotifications).values({
        parentId: p.id, channel: "zns", template: "PARENT_ACTIVATION",
        title: "Mã kích hoạt tài khoản phụ huynh Sata Robo",
        body: `Mã kích hoạt của anh/chị là ${code}, hiệu lực đến ${hetHan}. Vào ${ACTIVATION_URL} nhập số điện thoại và mã này để đặt mật khẩu.`,
        link: ACTIVATION_URL, status: "queued", createdBy: ctx.user.id,
      });
      if (isEmail(p.email)) {
        await queueEmail(tx, { to: p.email!, event: "PARENT_ACTIVATION", vars: { ten_ph: p.fullName, ma: code, het_han: hetHan, link: ACTIVATION_URL }, relatedType: "parents", relatedId: p.id, createdBy: ctx.user.id });
        emailed++;
      }
    }
    // Không ghi mã vào nhật ký — chỉ ghi ai gửi, cho bao nhiêu người
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "parent_accounts", entity: "parents", entityId: null,
      after: { action: "resend_activation_bulk", parents: targets.length, emailed, expiresAt }, ip: ctx.ip,
    });
  });
  return { queued: targets.length, emailed, skipped };
}

export async function setParentAccountLock(ctx: ProtectedContext, input: { parentId: string; locked: boolean; reason: string }) {
  requirePermission(ctx, "parent_account:update", {});
  const p = await loadParent(ctx, input.parentId);
  const next: ParentAccountStatus = input.locked ? "locked" : p.activatedAt ? "active" : p.activationRequestedAt ? "pending_activation" : "none";
  await ctx.db.transaction(async (tx) => {
    await tx.update(parents).set({ accountStatus: next, ...(input.locked ? { activationCodeHash: null, activationCodeExpiresAt: null } : {}), updatedAt: new Date() }).where(eq(parents.id, p.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "parent_accounts", entity: "parents", entityId: p.id, before: { accountStatus: p.accountStatus }, after: { accountStatus: next }, reason: input.reason, ip: ctx.ip });
  });
  return { accountStatus: next };
}

/**
 * Trần số lần thử mã kích hoạt — đếm theo SỐ ĐIỆN THOẠI, không theo IP:
 * mã chỉ có 6 chữ số và sống 72 giờ, nếu chỉ chặn theo IP thì đổi IP là dò tiếp
 * cho tới khi chiếm được tài khoản phụ huynh (xem được hồ sơ con, học phí).
 */
const activationAttempts = new MemoryRateLimiter();

/** Kích hoạt bằng SĐT + mã (dùng cho trang /kich-hoat công khai — chưa gắn Supabase user ở bước này) */
export async function verifyActivationCode(db: Db, input: { phone: string; code: string }) {
  const phone = normalizeVnPhone(input.phone);
  if (!phone) return { ok: false as const, error: "Số điện thoại không hợp lệ" };
  const gate = activationAttempts.hit(`activate|${phone}`, Date.now(), CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS);
  if (!gate.allowed) {
    return { ok: false as const, error: `Nhập sai quá nhiều lần — thử lại sau ${Math.ceil(gate.retryAfterSec / 60)} phút hoặc liên hệ trung tâm` };
  }
  const p = await db.query.parents.findFirst({ where: and(eq(parents.phone, phone), isNull(parents.deletedAt)) });
  if (!p || p.accountStatus !== "pending_activation" || !p.activationCodeHash || !p.activationCodeExpiresAt) return { ok: false as const, error: "Không có yêu cầu kích hoạt cho số này" };
  if (p.activationCodeExpiresAt.getTime() < Date.now()) return { ok: false as const, error: "Mã đã hết hạn — liên hệ trung tâm để cấp lại" };
  // So khớp băm không lệ thuộc thời gian
  const want = Buffer.from(p.activationCodeHash);
  const got = Buffer.from(hashActivationCode(input.code.trim()));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false as const, error: "Mã không đúng" };
  activationAttempts.reset(`activate|${phone}`);
  return { ok: true as const, parentId: p.id };
}
