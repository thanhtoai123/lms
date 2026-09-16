import "server-only";
import { cache } from "react";
import { headers, cookies } from "next/headers";
import { createCaller, createContext } from "@satarobo/api";

/** Caller dùng trong Server Components — không qua HTTP */
export const getServerCaller = cache(async () => {
  const h = new Headers(await headers());
  const c = await cookies();
  const token = c.get("sb-access-token")?.value;
  if (token && !h.get("authorization")) h.set("authorization", `Bearer ${token}`);
  const dev = c.get("x-dev-actor")?.value;
  if (dev) h.set("x-dev-actor", dev);
  const ctx = await createContext({ headers: h });
  return { caller: createCaller(ctx), ctx };
});
