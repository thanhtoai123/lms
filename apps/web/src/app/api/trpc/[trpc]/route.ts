import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@satarobo/api";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => {
      const h = new Headers(req.headers);
      // Dev bypass qua cookie (không dùng ở production)
      const cookie = req.headers.get("cookie") ?? "";
      const dev = cookie.split("; ").find((c) => c.startsWith("x-dev-actor="))?.split("=")[1];
      if (dev && !h.get("x-dev-actor")) h.set("x-dev-actor", decodeURIComponent(dev));
      const sb = cookie.split("; ").find((c) => c.startsWith("sb-access-token="))?.split("=")[1];
      if (sb && !h.get("authorization")) h.set("authorization", `Bearer ${decodeURIComponent(sb)}`);
      return createContext({ headers: h, ip: req.headers.get("x-forwarded-for") ?? undefined });
    },
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path}:`, error);
    },
  });

export { handler as GET, handler as POST };
