import { createContext } from "@satarobo/api";
import { devActorAllowed, DEV_ACTOR_HEADER, MemoryRateLimiter } from "@satarobo/core";

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
export function rateLimited(key: string, max: number, windowMs: number) {
  return !limiter.hit(key, Date.now(), max, windowMs).allowed;
}
/** Xoá bộ đếm sau khi xác thực thành công */
export function clearRateLimit(key: string) {
  limiter.reset(key);
}

export function errorStatus(e: unknown) {
  const code = (e as { code?: string }).code;
  const name = (e as Error)?.name;
  if (name === "ForbiddenError" || name === "ScopeError") return 403;
  return code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "UNAUTHORIZED" ? 401 : 400;
}
