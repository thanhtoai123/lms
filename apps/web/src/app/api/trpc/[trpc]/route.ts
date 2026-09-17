import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@satarobo/api";
import { idleExpired } from "@satarobo/core";
import { ACCESS_COOKIE, IDLE_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, cookieOptions, needsRefresh, refreshSession, supabaseOn } from "@/lib/auth-session";

/** Chặn gọi API từ trang web khác (CSRF): trình duyệt luôn gửi Sec-Fetch-Site / Origin */
function crossSite(req: Request) {
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

const readCookie = (cookie: string, name: string) => {
  const v = cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return v ? decodeURIComponent(v) : undefined;
};
const serialize = (name: string, value: string, o: ReturnType<typeof cookieOptions>) =>
  `${name}=${encodeURIComponent(value)}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;

const handler = async (req: Request) => {
  if (crossSite(req)) return Response.json({ error: { message: "Yêu cầu từ trang khác bị chặn" } }, { status: 403 });
  const cookie = req.headers.get("cookie") ?? "";
  let access = readCookie(cookie, ACCESS_COOKIE);
  let refresh = readCookie(cookie, REFRESH_COOKIE);
  const setCookies: string[] = [];
  // Hết phiên do không thao tác: coi như chưa đăng nhập (trang sẽ chuyển về /logout?reason=idle ở lần mở kế tiếp)
  if ((access || refresh) && idleExpired(Number(readCookie(cookie, SEEN_COOKIE)) || null, Date.now(), Number(readCookie(cookie, IDLE_COOKIE)) || 60)) {
    access = undefined;
    refresh = undefined;
  }
  if (supabaseOn() && refresh && needsRefresh(access, refresh)) {
    const s = await refreshSession(refresh!);
    if (s && s !== "network") {
      access = s.access_token;
      setCookies.push(serialize(ACCESS_COOKIE, s.access_token, cookieOptions("access", s.expires_in)), serialize(REFRESH_COOKIE, s.refresh_token, cookieOptions("refresh")));
    }
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => {
      const h = new Headers(req.headers);
      // Dev bypass qua cookie (không dùng ở production)
      const dev = readCookie(cookie, "x-dev-actor");
      if (dev && !h.get("x-dev-actor")) h.set("x-dev-actor", dev);
      if (access && !h.get("authorization")) h.set("authorization", `Bearer ${access}`);
      return createContext({ headers: h, ip: req.headers.get("x-forwarded-for") ?? undefined });
    },
    responseMeta() {
      if (!setCookies.length) return {};
      const headers = new Headers();
      for (const c of setCookies) headers.append("Set-Cookie", c);
      return { headers };
    },
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path}:`, error);
    },
  });
};

export { handler as GET, handler as POST };
