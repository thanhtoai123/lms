import { NextResponse, type NextRequest } from "next/server";

/**
 * Chặn sớm: chưa có phiên đăng nhập thì chuyển về /login?next=… trước khi render
 * (không render trang quản trị rồi mới redirect). Kiểm tra quyền thật vẫn ở service/policy.
 */
const PUBLIC = [/^\/login(\/|$)/, /^\/ks(\/|$)/, /^\/bt(\/|$)/, /^\/logout(\/|$)/, /^\/dang-ky(\/|$)/, /^\/api\//, /^\/_next\//, /^\/manifest\.webmanifest$/, /^\/favicon/, /\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const hasSession = req.cookies.has("sb-access-token") || (process.env.ALLOW_DEV_ACTOR === "1" && req.cookies.has("x-dev-actor"));
  if (hasSession) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/).*)"],
};
