import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwtPayload, devActorAllowed } from "@satarobo/core";
import { getDb } from "@satarobo/db";
import { recordLogin } from "@satarobo/api";
import { ACCESS_COOKIE, IDLE_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, clientMeta, revokeSession, supabaseOn } from "@/lib/auth-session";

export async function GET(req: Request) {
  const idle = new URL(req.url).searchParams.get("reason") === "idle";
  const c = await cookies();
  const access = c.get(ACCESS_COOKIE)?.value;
  // Chỉ ghi nhật ký "đăng xuất" cho token Supabase CHẤP NHẬN (token thật). Trước đây email được
  // giải mã từ cookie mà không kiểm chữ ký — ai cũng cài được cookie giả để ghi nhật ký dưới tên
  // người khác. Tài khoản mẫu chỉ ghi khi máy chủ cho phép tài khoản mẫu (máy phát triển).
  const thuHoi = access && supabaseOn() ? await revokeSession(access) : false;
  const devEmail = devActorAllowed(process.env) && c.get("x-dev-actor")?.value ? decodeURIComponent(c.get("x-dev-actor")!.value) : null;
  const email = (thuHoi ? decodeJwtPayload(access)?.email : null) ?? devEmail;
  if (email) await recordLogin(getDb(), { email, result: idle ? "idle_logout" : "logout", ...clientMeta(await headers()) });
  for (const n of ["x-dev-actor", ACCESS_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, IDLE_COOKIE]) c.delete(n);
  redirect(idle ? "/login?error=idle" : "/login");
}
