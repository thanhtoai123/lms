/**
 * TÀI KHOẢN KÊNH CHAT NGOÀI — khai báo nick Zalo cá nhân (chạy trên ZCRM) và nhận sự kiện của nó.
 *
 * Quan điểm thiết kế (xem docs/ZALO-KENH-TRINH-CAM.md): công cụ chat chạy NGOÀI hệ thống, hệ thống chỉ
 * **đọc** sự kiện đổ về. Nhờ vậy nick Zalo có bị khoá thì cũng chỉ mất kênh chat, toàn bộ lead và lịch
 * sử hội thoại vẫn nằm trong sổ sách.
 *
 * Bảo mật: mỗi tài khoản kênh có một bí mật riêng. Webhook phải kèm bí mật đó ở header `X-Webhook-Secret`
 * (so sánh theo thời gian hằng) HOẶC chữ ký HMAC-SHA256 của nguyên văn thân yêu cầu ở `X-Signature`.
 * Bí mật lưu mã hoá AES-256-GCM, không bao giờ trả về giao diện.
 */
import { and, eq, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { channelAccounts, conversations, type Database } from "@satarobo/db";
import { authorizeGlobal, docSuKienZcrm, duDeGhiTin, nickImLang, HAN_MUC_NICK_NGAY, type SuKienKenh } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { sealWith, openWith } from "./pii";
import { writeAudit } from "./audit";
import { ingestExternal, ingestExternalOutbound } from "./messaging";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
/** Nhãn khoá mã hoá riêng cho kênh ngoài (khác nhãn PII và nhãn zalo OA) */
const NHAN = "kenh";
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

/** Ngày theo giờ VN, dạng YYYY-MM-DD — mốc reset bộ đếm tin/ngày */
export function ngayVN(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function slugHoa(raw: string): string {
  return raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Khai báo                                                             */
/* ------------------------------------------------------------------ */

export async function danhSachTaiKhoanKenh(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống xem được khai báo kênh");
  const rows = await ctx.db.query.channelAccounts.findMany({ orderBy: (t, { asc }) => [asc(t.channel), asc(t.label)] });
  const now = new Date();
  const homNay = ngayVN(now);
  return rows.map((r) => ({
    id: r.id, channel: r.channel, label: r.label, slug: r.slug, externalId: r.externalId, centerId: r.centerId,
    baseUrl: r.baseUrl, active: r.active, status: r.status,
    lastSeenAt: r.lastSeenAt, lastEventAt: r.lastEventAt, lastError: r.lastError,
    dailyCap: r.dailyCap, sentToday: r.sentDay === homNay ? r.sentToday : 0,
    imLang: nickImLang(r.lastSeenAt ?? r.lastEventAt, now),
    // Chỉ cho biết ĐÃ ĐẶT hay chưa — không bao giờ trả giá trị
    apiKeySet: !!r.apiKey, webhookSecretSet: !!r.webhookSecret,
  }));
}

export async function luuTaiKhoanKenh(ctx: ProtectedContext, input: {
  id?: string | null; channel: "zalo_ca_nhan"; label: string; centerId?: string | null; externalId?: string | null;
  baseUrl?: string | null; apiKey?: string | null; webhookSecret?: string | null; dailyCap?: number | null; active?: boolean;
}) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống được khai báo kênh");
  const label = input.label.trim();
  if (label.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Tên tài khoản kênh quá ngắn" });
  const baseUrl = input.baseUrl?.trim() || null;
  if (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Địa chỉ API không hợp lệ" });

  const cu = input.id ? await ctx.db.query.channelAccounts.findFirst({ where: eq(channelAccounts.id, input.id) }) : null;
  if (input.id && !cu) throw new TRPCError({ code: "NOT_FOUND", message: "Không thấy tài khoản kênh" });
  const slug = cu?.slug ?? `${slugHoa(label) || "nick"}-${Math.random().toString(36).slice(2, 6)}`;
  const giaTri = {
    channel: input.channel, label, slug, centerId: input.centerId ?? cu?.centerId ?? null,
    externalId: input.externalId?.trim() || cu?.externalId || null, baseUrl,
    apiKey: input.apiKey?.trim() ? sealWith(NHAN, input.apiKey.trim()) : (cu?.apiKey ?? null),
    webhookSecret: input.webhookSecret?.trim() ? sealWith(NHAN, input.webhookSecret.trim()) : (cu?.webhookSecret ?? null),
    dailyCap: Math.max(1, Math.min(1000, input.dailyCap ?? cu?.dailyCap ?? HAN_MUC_NICK_NGAY)),
    active: input.active ?? cu?.active ?? true,
    updatedBy: ctx.user.id,
  };
  const [row] = cu
    ? await ctx.db.update(channelAccounts).set(giaTri).where(eq(channelAccounts.id, cu.id)).returning()
    : await ctx.db.insert(channelAccounts).values(giaTri).returning();
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: cu ? "UPDATE" : "CREATE", module: "system", entity: "channel_accounts", entityId: row!.id,
    // Nhật ký chỉ ghi CÓ/KHÔNG với các khoá bí mật
    after: { channel: giaTri.channel, label, slug, baseUrl, dailyCap: giaTri.dailyCap, active: giaTri.active, apiKeySet: !!giaTri.apiKey, webhookSecretSet: !!giaTri.webhookSecret }, ip: ctx.ip,
  });
  return { id: row!.id, slug: row!.slug };
}

export async function xoaTaiKhoanKenh(ctx: ProtectedContext, input: { id: string }) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị hệ thống được xoá khai báo kênh");
  const row = await ctx.db.query.channelAccounts.findFirst({ where: eq(channelAccounts.id, input.id) });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không thấy tài khoản kênh" });
  // Không xoá hội thoại đã nhận — chỉ ngắt kênh
  await ctx.db.update(channelAccounts).set({ active: false, status: "offline", updatedBy: ctx.user.id }).where(eq(channelAccounts.id, input.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "channel_accounts", entityId: input.id, after: { active: false }, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Nhận webhook                                                         */
/* ------------------------------------------------------------------ */

function bangNhau(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bí mật đúng chưa: header bí mật thẳng, hoặc HMAC-SHA256 hex/base64 của nguyên văn thân yêu cầu */
export function chuKyHopLe(raw: string, headers: Record<string, string>, secret: string): boolean {
  const thang = headers["x-webhook-secret"] ?? headers["x-api-key"] ?? headers["x-zcrm-secret"];
  if (thang && bangNhau(thang, secret)) return true;
  const ky = headers["x-signature"] ?? headers["x-hub-signature-256"] ?? headers["x-zcrm-signature"];
  if (!ky) return false;
  const h = createHmac("sha256", secret).update(raw, "utf8").digest();
  const sach = ky.replace(/^sha256=/i, "").trim();
  return bangNhau(sach.toLowerCase(), h.toString("hex")) || bangNhau(sach, h.toString("base64"));
}

type KetQuaNhan =
  | { ok: true; status: "processed" | "duplicate" | "ignored"; loai?: string; conversationId?: string }
  | { ok: false; status: "rejected" | "failed"; httpStatus: number; error: string };

/**
 * Nhận một sự kiện của công cụ chat ngoài.
 * Thứ tự: tìm tài khoản kênh → kiểm bí mật → đọc sự kiện → ghi hội thoại / cập nhật trạng thái nick.
 */
export async function nhanSuKienKenh(db: Database, input: { slug: string; raw: string; headers: Record<string, string>; body: unknown }): Promise<KetQuaNhan> {
  const d = asDb(db);
  const acc = await d.query.channelAccounts.findFirst({ where: and(eq(channelAccounts.slug, input.slug), eq(channelAccounts.channel, "zalo_ca_nhan")) });
  if (!acc) return { ok: false, status: "rejected", httpStatus: 404, error: "Không có tài khoản kênh cho đường dẫn này" };
  if (!acc.active) return { ok: false, status: "rejected", httpStatus: 403, error: "Tài khoản kênh đã tắt" };
  const secret = openWith(NHAN, acc.webhookSecret);
  if (!secret) return { ok: false, status: "rejected", httpStatus: 503, error: "Tài khoản kênh chưa đặt bí mật webhook" };
  if (!chuKyHopLe(input.raw, input.headers, secret)) return { ok: false, status: "rejected", httpStatus: 401, error: "Sai bí mật / chữ ký" };

  const sk = docSuKienZcrm(input.body);
  const now = new Date();
  if (!sk) {
    await d.update(channelAccounts).set({ lastEventAt: now }).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored" };
  }

  // Mọi sự kiện hợp lệ đều là bằng chứng nick còn sống
  const chung = { lastEventAt: now, lastSeenAt: now } as const;

  if (sk.loai === "ket_noi" || sk.loai === "mat_ket_noi") {
    const song = sk.loai === "ket_noi";
    await d.update(channelAccounts).set({
      ...chung, status: song ? "online" : "offline",
      lastError: song ? null : "Nick Zalo mất kết nối",
      lastErrorAt: song ? null : now,
      ...(song ? {} : { lastSeenAt: acc.lastSeenAt }),
      externalId: sk.nickId ?? acc.externalId,
    }).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "processed", loai: sk.loai };
  }

  if (sk.loai === "khach_moi") {
    await d.update(channelAccounts).set({ ...chung, status: "online" }).where(eq(channelAccounts.id, acc.id));
    if (!sk.nguoiId) return { ok: true, status: "ignored" };
    // Chỉ dựng vỏ hội thoại để nhân viên thấy khách mới; KHÔNG tự tạo lead (cần dấu đồng ý của khách)
    const co = await d.query.conversations.findFirst({ where: and(eq(conversations.channel, "zalo_ca_nhan"), eq(conversations.externalId, sk.nguoiId)) });
    if (co) {
      if (sk.tenHienThi && !co.displayName) await d.update(conversations).set({ displayName: sk.tenHienThi.slice(0, 120) }).where(eq(conversations.id, co.id));
      return { ok: true, status: "duplicate", loai: sk.loai, conversationId: co.id };
    }
    const [moi] = await d.insert(conversations).values({
      channel: "zalo_ca_nhan", externalId: sk.nguoiId, displayName: sk.tenHienThi?.slice(0, 120) ?? null,
      centerId: acc.centerId, status: "pending", subject: `Zalo cá nhân — ${acc.label}`,
    }).onConflictDoNothing().returning();
    return { ok: true, status: "processed", loai: sk.loai, conversationId: moi?.id };
  }

  if (!duDeGhiTin(sk)) {
    await d.update(channelAccounts).set(chung).where(eq(channelAccounts.id, acc.id));
    return { ok: true, status: "ignored" };
  }

  const tinId = sk.tinId ?? `${sk.nguoiId}-${sk.luc.getTime()}`;
  const chung2 = { ...chung, status: "online" as const, externalId: sk.nickId ?? acc.externalId };

  if (sk.loai === "tin_den") {
    const r = await ingestExternal(db, {
      channel: "zalo_ca_nhan", senderId: sk.nguoiId!, displayName: sk.tenHienThi, text: sk.noiDung,
      messageId: tinId, at: sk.luc, attachments: sk.tepDinhKem.length ? sk.tepDinhKem : null,
      subject: `Zalo cá nhân — ${acc.label}`, centerId: acc.centerId,
    });
    await d.update(channelAccounts).set(chung2).where(eq(channelAccounts.id, acc.id));
    if (!r.ok) return { ok: false, status: "rejected", httpStatus: 400, error: r.error };
    return { ok: true, status: r.duplicate ? "duplicate" : "processed", loai: sk.loai, conversationId: r.conversationId };
  }

  // tin_di: nhân viên trả lời bên công cụ — ghi lại để đo thời gian phản hồi và đếm hạn mức ngày
  const r = await ingestExternalOutbound(db, {
    channel: "zalo_ca_nhan", senderId: sk.nguoiId!, text: sk.noiDung, messageId: tinId, at: sk.luc,
    attachments: sk.tepDinhKem.length ? sk.tepDinhKem : null, subject: `Zalo cá nhân — ${acc.label}`, centerId: acc.centerId,
  });
  const homNay = ngayVN(now);
  await d.update(channelAccounts).set({
    ...chung2,
    sentDay: homNay,
    sentToday: acc.sentDay === homNay ? sql`${channelAccounts.sentToday} + 1` : 1,
  }).where(eq(channelAccounts.id, acc.id));
  if (!r.ok) return { ok: false, status: "rejected", httpStatus: 400, error: r.error };
  return { ok: true, status: r.duplicate ? "duplicate" : "processed", loai: sk.loai, conversationId: r.conversationId };
}

/* ------------------------------------------------------------------ */
/* Cho màn Zalo CRM                                                     */
/* ------------------------------------------------------------------ */

export interface NickCaNhan {
  id: string; label: string; status: string; imLang: boolean;
  sentToday: number; dailyCap: number; conLai: number;
  lastSeenAt: Date | null; lastEventAt: Date | null; lastError: string | null;
}

/** Trạng thái các nick Zalo cá nhân — dùng ở khối "Zalo cá nhân" của màn Zalo CRM */
export async function nickCaNhan(db: Db, now: Date = new Date()): Promise<NickCaNhan[]> {
  const rows = await db.query.channelAccounts.findMany({
    where: and(eq(channelAccounts.channel, "zalo_ca_nhan"), eq(channelAccounts.active, true)),
    orderBy: (t, { asc }) => [asc(t.label)],
  });
  const homNay = ngayVN(now);
  return rows.map((r) => {
    const daGui = r.sentDay === homNay ? r.sentToday : 0;
    return {
      id: r.id, label: r.label, status: r.status, imLang: nickImLang(r.lastSeenAt ?? r.lastEventAt, now),
      sentToday: daGui, dailyCap: r.dailyCap, conLai: Math.max(0, r.dailyCap - daGui),
      lastSeenAt: r.lastSeenAt, lastEventAt: r.lastEventAt, lastError: r.lastError,
    };
  });
}

export type { SuKienKenh };
