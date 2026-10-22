import "server-only";
import { cache } from "react";
import { headers, cookies } from "next/headers";
import { createCaller, createContext } from "@satarobo/api";
import { devActorAllowed } from "@satarobo/core";
import { ACCESS_COOKIE } from "@/lib/auth-session";

/** Caller dùng trong Server Components — không qua HTTP */
export const getServerCaller = cache(async () => {
  const h = new Headers(await headers());
  const c = await cookies();
  const token = c.get(ACCESS_COOKIE)?.value;
  if (token && !h.get("authorization")) h.set("authorization", `Bearer ${token}`);
  // Tài khoản mẫu chỉ từ cookie máy chủ đọc, và chỉ khi máy chủ cho phép (máy phát triển)
  h.delete("x-dev-actor");
  const dev = devActorAllowed(process.env) ? c.get("x-dev-actor")?.value : undefined;
  if (dev) h.set("x-dev-actor", dev);
  const ctx = await createContext({ headers: h });
  return { caller: createCaller(ctx), ctx };
});
