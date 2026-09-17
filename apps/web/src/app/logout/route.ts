import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, REFRESH_COOKIE, revokeSession, supabaseOn } from "@/lib/auth-session";

export async function GET() {
  const c = await cookies();
  const access = c.get(ACCESS_COOKIE)?.value;
  if (access && supabaseOn()) await revokeSession(access);
  c.delete("x-dev-actor");
  c.delete(ACCESS_COOKIE);
  c.delete(REFRESH_COOKIE);
  redirect("/login");
}
