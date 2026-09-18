import { createContext, checkRateLimit, rateKey, tooManyMessage } from "@satarobo/api";
import { getDb } from "@satarobo/db";
import { devActorAllowed, DEV_ACTOR_HEADER, MemoryRateLimiter, type RateLimitName } from "@satarobo/core";

type RateKeyKind = Parameters<typeof rateKey>[1];

const readCookie = (cookie: string, name: string) => {
  const raw = cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return raw ? decodeURIComponent(raw) : undefined;
};

/** Dựng ngữ cảnh đăng nhập cho route handler (cookie → header như tRPC) */
export async function routeContext(req: Request) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie") ?? "";
  // Tài khoản mẫu chỉ đến từ cookie máy chủ đọc — xoá header do client tự gửi
  h.delete(DEV_ACTOR_HEADER);
  const dev = devActorAllowed(process.env) ? readCookie(cookie, DEV_ACTOR_HEADER) : undefined;
  if (dev) h.set(DEV_ACTOR_HEADER, dev);
  const sb = readCookie(cookie, "sb-access-token");
  if (sb && !h.get("authorization")) h.set("authorization", `Bearer ${sb}`);
  const ctx = await createContext({ headers: h, ip: req.headers.get("x-forwarded-for") ?? undefined });
  if (!ctx.actor || !ctx.user) return null;
  return { ...ctx, actor: ctx.actor, user: ctx.user };
}

/**
 * Chặn gọi API từ trang web khác (CSRF) — cùng quy tắc với /api/trpc.
 * Cookie phiên là SameSite=Lax nên trình duyệt đã chặn phần lớn, đây là lớp thứ hai
 * cho các route handler nhận multipart / JSON.
 */
export function crossSite(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Phản hồi 403 chuẩn khi yêu cầu đến từ trang khác */
export const crossSiteResponse = () => Response.json({ ok: false, error: "Yêu cầu từ trang khác bị chặn" }, { status: 403 });

const limiter = new MemoryRateLimiter();
/**
 * Trần trong BỘ NHỚ một tiến trình — chỉ là lớp chặn đầu tiên.
 * Luồng nhạy cảm (đăng nhập, OTP, quên mật khẩu, webhook) phải dùng `sharedRateLimited`
 * bên dưới để trần còn đúng khi chạy nhiều bản sao máy chủ.
 */
export function rateLimited(key: string, max: number, windowMs: number) {
  return !limiter.hit(key, Date.now(), max, windowMs).allowed;
}
/** Xoá bộ đếm sau khi xác thực thành công */
export function clearRateLimit(key: string) {
  limiter.reset(key);
}

/**
 * Trần DÙNG CHUNG giữa các bản sao (bảng `rate_limits` trong Postgres).
 * Trả về `null` khi được phép, hoặc quyết định chặn khi đụng trần.
 *
 * CSDL lỗi thì **cho qua** (xem `checkRateLimit`): trần tần suất không bao giờ được
 * biến thành lý do khiến không ai đăng nhập được.
 */
export async function sharedRateLimit(name: RateLimitName, kind: RateKeyKind, value: string | null | undefined, purpose?: string) {
  const d = await checkRateLimit(getDb(), name, rateKey(purpose ?? name, kind, value));
  return d.allowed ? null : d;
}

/** Bản rút gọn trả `true` khi bị chặn — thay thế trực tiếp cho `rateLimited` */
export async function sharedRateLimited(name: RateLimitName, kind: RateKeyKind, value: string | null | undefined, purpose?: string) {
  return (await sharedRateLimit(name, kind, value, purpose)) !== null;
}

/** Phản hồi 429 chuẩn, kèm `Retry-After` để máy khách biết chờ bao lâu */
export function tooManyResponse(d: { retryAfterSec: number }, what = "thao tác") {
  return Response.json(
    { ok: false, error: tooManyMessage(d, what) },
    { status: 429, headers: { "Retry-After": String(Math.max(1, d.retryAfterSec)) } },
  );
}

/** Địa chỉ IP của người gọi (chuỗi rỗng → "unknown" để khoá đếm không bị tách) */
export function clientIp(req: Request | Headers) {
  const h = req instanceof Headers ? req : req.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export function errorStatus(e: unknown) {
  const code = (e as { code?: string }).code;
  const name = (e as Error)?.name;
  if (name === "ForbiddenError" || name === "ScopeError") return 403;
  return code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "UNAUTHORIZED" ? 401 : 400;
}
