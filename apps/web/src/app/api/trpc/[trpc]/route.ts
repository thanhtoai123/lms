import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@satarobo/api";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, needsRefresh, refreshSession, supabaseOn } from "@/lib/auth-session";

const readCookie = (cookie: string, name: string) => {
  const v = cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return v ? decodeURIComponent(v) : undefined;
};
const serialize = (name: string, value: string, o: ReturnType<typeof cookieOptions>) =>
  `${name}=${encodeURIComponent(value)}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;

const handler = async (req: Request) => {
  const cookie = req.headers.get("cookie") ?? "";
  let access = readCookie(cookie, ACCESS_COOKIE);
  const refresh = readCookie(cookie, REFRESH_COOKIE);
  const setCookies: string[] = [];
  if (supabaseOn() && needsRefresh(access, refresh)) {
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
