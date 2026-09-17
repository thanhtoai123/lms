import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwtPayload } from "@satarobo/core";
import { getDb } from "@satarobo/db";
import { recordLogin } from "@satarobo/api";
import { ACCESS_COOKIE, IDLE_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, clientMeta, revokeSession, supabaseOn } from "@/lib/auth-session";

export async function GET(req: Request) {
  const idle = new URL(req.url).searchParams.get("reason") === "idle";
  const c = await cookies();
  const access = c.get(ACCESS_COOKIE)?.value;
  const email = decodeJwtPayload(access)?.email ?? (c.get("x-dev-actor")?.value ? decodeURIComponent(c.get("x-dev-actor")!.value) : null);
  if (email) await recordLogin(getDb(), { email, result: idle ? "idle_logout" : "logout", ...clientMeta(await headers()) });
  if (access && supabaseOn()) await revokeSession(access);
  for (const n of ["x-dev-actor", ACCESS_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, IDLE_COOKIE]) c.delete(n);
  redirect(idle ? "/login?error=idle" : "/login");
}
