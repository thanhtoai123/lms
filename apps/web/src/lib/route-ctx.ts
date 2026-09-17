import { createContext } from "@satarobo/api";

/** Dựng ngữ cảnh đăng nhập cho route handler (cookie → header như tRPC) */
export async function routeContext(req: Request) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie") ?? "";
  const dev = cookie.split("; ").find((c) => c.startsWith("x-dev-actor="))?.split("=")[1];
  if (dev && !h.get("x-dev-actor")) h.set("x-dev-actor", decodeURIComponent(dev));
  const sb = cookie.split("; ").find((c) => c.startsWith("sb-access-token="))?.split("=")[1];
  if (sb && !h.get("authorization")) h.set("authorization", `Bearer ${decodeURIComponent(sb)}`);
  const ctx = await createContext({ headers: h, ip: req.headers.get("x-forwarded-for") ?? undefined });
  if (!ctx.actor || !ctx.user) return null;
  return { ...ctx, actor: ctx.actor, user: ctx.user };
}

const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return true;
  arr.push(now);
  hits.set(key, arr);
  return false;
}

export function errorStatus(e: unknown) {
  const code = (e as { code?: string }).code;
  if ((e as Error)?.name === "ForbiddenError") return 403;
  return code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "UNAUTHORIZED" ? 401 : 400;
}
