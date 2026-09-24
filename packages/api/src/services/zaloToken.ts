/**
 * VÒNG ĐỜI TOKEN ZALO OA — thứ thiếu là cả kênh Zalo chết im lặng sau một ngày.
 *
 * Quy định của Zalo (bản 2026):
 *  - access token sống **25 giờ** (`expires_in` ≈ 90.000 giây);
 *  - refresh token sống 3 tháng nhưng **chỉ dùng được MỘT LẦN**: refresh xong, token cũ bị vô hiệu
 *    và Zalo trả về refresh token MỚI. Lưu hụt token mới là đứt chuỗi, phải đi xin lại
 *    authorization code bằng tay.
 *
 * Hai hệ quả bắt buộc, quyết định toàn bộ thiết kế dưới đây:
 *  1. Token phải nằm trong CSDL (không phải `.env`) để tiến trình nền tự ghi đè được.
 *  2. Tại một thời điểm chỉ được MỘT tiến trình làm mới. Hai worker cùng refresh thì cái chạy sau
 *     cầm refresh token đã bị vô hiệu → hỏng chuỗi. Dùng `pg_advisory_xact_lock` để xếp hàng, và
 *     kiểm tra lại sau khi giành được khoá (rất có thể tiến trình kia vừa làm xong).
 *
 * Giá trị token/secret luôn được mã hoá khi lưu và KHÔNG BAO GIỜ đi vào nhật ký hay trả về giao diện.
 */
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { zaloCredentials, type Database } from "@satarobo/db";
import { authorizeGlobal } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { sealWith, openWith } from "./pii";
import { writeAudit } from "./audit";
import { logger } from "../lib/logger";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const log = logger.child("zalo-token");

/** Làm mới khi còn dưới ngần này — đủ xa để lỗi mạng còn kịp thử lại vài lần */
export const REFRESH_TRUOC_MS = 2 * 3600_000;
/** Nhãn khoá mã hoá riêng cho token Zalo (khác nhãn PII) */
const NHAN = "zalo";
const OAUTH_URL = process.env.ZALO_OAUTH_URL ?? "https://oauth.zaloapp.com/v4/oa/access_token";
const KHOA = "oa";

export interface ZaloTokenState {
  /** Đã khai báo ứng dụng (app_id + secret) chưa */
  configured: boolean;
  /** Có token dùng được ngay không */
  usable: boolean;
  expiresAt: Date | null;
  refreshedAt: Date | null;
  minutesLeft: number | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  oaId: string | null;
  appId: string | null;
  /** Đang dùng token cũ đặt trong biến môi trường (chưa chuyển sang CSDL) */
  fromEnv: boolean;
}

async function docDong(db: Db) {
  return db.query.zaloCredentials.findFirst({ where: eq(zaloCredentials.key, KHOA) });
}

/** Gọi Zalo đổi refresh token lấy cặp token mới. Trả về lỗi dạng chữ thay vì ném, để caller ghi nhật ký. */
async function goiZalo(appId: string, secretKey: string, refreshToken: string): Promise<
  { ok: true; accessToken: string; refreshToken: string; expiresInSec: number } | { ok: false; error: string }
> {
  const body = new URLSearchParams({ app_id: appId, grant_type: "refresh_token", refresh_token: refreshToken });
  try {
    const r = await fetch(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: secretKey },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number | string; error_name?: string; message?: string };
    if (!r.ok || !j.access_token || !j.refresh_token) {
      const ma = j.error_name ?? j.error ?? r.status;
      return { ok: false, error: `Zalo từ chối làm mới token (${ma})${j.message ? `: ${j.message}` : ""}` };
    }
    const sec = Number(j.expires_in ?? 0);
    return { ok: true, accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSec: Number.isFinite(sec) && sec > 0 ? sec : 90_000 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Không gọi được Zalo: ${e.message}` : "Không gọi được Zalo" };
  }
}

/**
 * Làm mới token. `force = true` thì làm mới kể cả khi còn hạn (nút "Làm mới ngay").
 * Trả về access token mới, hoặc null kèm lý do đã ghi vào `last_error`.
 */
export async function lamMoiTokenZalo(database: Database, opts: { force?: boolean; actorId?: string | null } = {}): Promise<{ token: string | null; error: string | null }> {
  const db = asDb(database);
  return db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    // Xếp hàng: chỉ một tiến trình làm mới tại một thời điểm (refresh token dùng một lần)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"zalo:token:" + KHOA}))`);
    const row = await tx.query.zaloCredentials.findFirst({ where: eq(zaloCredentials.key, KHOA) });
    if (!row?.appId || !row.secretKey || !row.refreshToken) {
      return { token: null, error: "Chưa khai báo ứng dụng Zalo (app_id / secret_key / refresh_token)" };
    }
    // Trong lúc chờ khoá, tiến trình khác có thể đã làm mới xong — dùng luôn, đừng đốt refresh token
    const conHan = row.expiresAt ? row.expiresAt.getTime() - Date.now() : 0;
    if (!opts.force && row.accessToken && conHan > REFRESH_TRUOC_MS) {
      return { token: openWith(NHAN, row.accessToken), error: null };
    }
    const secret = openWith(NHAN, row.secretKey);
    const refresh = openWith(NHAN, row.refreshToken);
    if (!secret || !refresh) return { token: null, error: "Không giải mã được khoá đã lưu — khai báo lại app_id / secret_key / refresh_token" };

    const r = await goiZalo(row.appId, secret, refresh);
    if (!r.ok) {
      await tx.update(zaloCredentials).set({ lastError: r.error, lastErrorAt: new Date() }).where(eq(zaloCredentials.key, KHOA));
      log.warn("lam moi token that bai", { error: r.error });
      return { token: null, error: r.error };
    }
    await tx.update(zaloCredentials).set({
      accessToken: sealWith(NHAN, r.accessToken),
      refreshToken: sealWith(NHAN, r.refreshToken),
      expiresAt: new Date(Date.now() + r.expiresInSec * 1000),
      refreshedAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      updatedBy: opts.actorId ?? row.updatedBy ?? null,
    }).where(eq(zaloCredentials.key, KHOA));
    log.info("da lam moi token zalo", { expiresInSec: r.expiresInSec });
    return { token: r.accessToken, error: null };
  });
}

/**
 * Lấy access token dùng được ngay (tự làm mới khi sắp hết hạn).
 * Chưa khai báo trong CSDL thì rơi về biến môi trường cũ để hệ thống đang chạy không gãy.
 */
export async function accessTokenZalo(database: Database): Promise<string | null> {
  const db = asDb(database);
  const row = await docDong(db);
  if (!row?.appId) return (process.env.ZALO_OA_ACCESS_TOKEN ?? "").trim() || null;
  const conHan = row.expiresAt ? row.expiresAt.getTime() - Date.now() : 0;
  if (row.accessToken && conHan > REFRESH_TRUOC_MS) return openWith(NHAN, row.accessToken);
  const r = await lamMoiTokenZalo(database);
  if (r.token) return r.token;
  // Làm mới hỏng nhưng token cũ còn sống thì vẫn dùng nốt, hơn là dừng gửi
  if (row.accessToken && conHan > 0) return openWith(NHAN, row.accessToken);
  return (process.env.ZALO_OA_ACCESS_TOKEN ?? "").trim() || null;
}

/** Trạng thái cho màn Tích hợp — KHÔNG trả giá trị token */
export async function trangThaiTokenZalo(database: Database): Promise<ZaloTokenState> {
  const db = asDb(database);
  const row = await docDong(db);
  const envToken = (process.env.ZALO_OA_ACCESS_TOKEN ?? "").trim();
  if (!row?.appId) {
    return {
      configured: false, usable: !!envToken, expiresAt: null, refreshedAt: null, minutesLeft: null,
      lastError: null, lastErrorAt: null, oaId: null, appId: null, fromEnv: !!envToken,
    };
  }
  const left = row.expiresAt ? Math.round((row.expiresAt.getTime() - Date.now()) / 60000) : null;
  return {
    configured: !!(row.appId && row.secretKey && row.refreshToken),
    usable: !!row.accessToken && (left ?? 0) > 0,
    expiresAt: row.expiresAt, refreshedAt: row.refreshedAt, minutesLeft: left,
    lastError: row.lastError, lastErrorAt: row.lastErrorAt,
    oaId: row.oaId, appId: row.appId, fromEnv: false,
  };
}

/**
 * Khai báo ứng dụng Zalo. Người dùng tự dán app_id / secret_key / refresh token lấy từ
 * developers.zalo.me — hệ thống chỉ lưu (đã mã hoá) chứ không tự sinh được.
 */
export async function luuKhaiBaoZalo(ctx: ProtectedContext, input: { appId: string; secretKey?: string | null; refreshToken?: string | null; oaId?: string | null }) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản trị hệ thống được khai báo tích hợp" });
  const appId = input.appId.trim();
  if (!/^\d{5,25}$/.test(appId)) throw new TRPCError({ code: "BAD_REQUEST", message: "app_id phải là dãy số" });
  const row = await ctx.db.query.zaloCredentials.findFirst({ where: eq(zaloCredentials.key, KHOA) });
  const secret = input.secretKey?.trim() ? sealWith(NHAN, input.secretKey.trim()) : (row?.secretKey ?? null);
  const refresh = input.refreshToken?.trim() ? sealWith(NHAN, input.refreshToken.trim()) : (row?.refreshToken ?? null);
  const giaTri = {
    key: KHOA, appId, oaId: input.oaId?.trim() || row?.oaId || null, secretKey: secret, refreshToken: refresh,
    updatedBy: ctx.user.id, lastError: null, lastErrorAt: null,
    // Dán refresh token mới thì access token cũ coi như bỏ, buộc làm mới ở lần gửi kế tiếp
    ...(input.refreshToken?.trim() ? { accessToken: null, expiresAt: null } : {}),
  };
  if (row) await ctx.db.update(zaloCredentials).set(giaTri).where(eq(zaloCredentials.key, KHOA));
  else await ctx.db.insert(zaloCredentials).values(giaTri);
  // Nhật ký ghi CÓ/KHÔNG, tuyệt đối không ghi giá trị khoá
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "zalo_credentials", entityId: null,
    after: { appId, oaId: giaTri.oaId, secretKeySet: !!secret, refreshTokenSet: !!refresh }, ip: ctx.ip,
  });
  if (input.refreshToken?.trim()) return lamMoiTokenZalo(ctx.db as unknown as Database, { force: true, actorId: ctx.user.id });
  return { token: null, error: null };
}

/** Nút "Làm mới ngay" ở màn Tích hợp */
export async function lamMoiTokenTheoYeuCau(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản trị hệ thống được làm mới token" });
  const r = await lamMoiTokenZalo(ctx.db as unknown as Database, { force: true, actorId: ctx.user.id });
  return { ok: !!r.token, error: r.error };
}

/**
 * Việc nền: làm mới trước khi hết hạn. Gọi mỗi nhịp worker — rẻ, vì chỉ đụng Zalo khi còn < 2 giờ.
 */
export async function sweepZaloToken(database: Database): Promise<{ refreshed: boolean; error: string | null }> {
  const db = asDb(database);
  const row = await docDong(db);
  if (!row?.appId || !row.refreshToken) return { refreshed: false, error: null };
  const conHan = row.expiresAt ? row.expiresAt.getTime() - Date.now() : 0;
  if (row.accessToken && conHan > REFRESH_TRUOC_MS) return { refreshed: false, error: null };
  const r = await lamMoiTokenZalo(database);
  return { refreshed: !!r.token, error: r.error };
}
