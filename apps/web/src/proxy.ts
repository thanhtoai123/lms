import { NextResponse, type NextRequest } from "next/server";
import { idleExpired } from "@satarobo/core";
import { ACCESS_COOKIE, IDLE_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, cookieOptions, needsRefresh, refreshSession, seenCookieOptions, supabaseOn } from "@/lib/auth-session";

/**
 * Chặn sớm: chưa có phiên đăng nhập thì chuyển về /login?next=… trước khi render
 * (không render trang quản trị rồi mới redirect). Kiểm tra quyền thật vẫn ở service/policy.
 * Phiên Supabase sắp hết hạn thì làm mới tại đây (trang) và ở /api/trpc (gọi API).
 */
const PUBLIC = [/^\/login(\/|$)/, /^\/quen-mat-khau(\/|$)/, /^\/dat-mat-khau(\/|$)/, /^\/ks(\/|$)/, /^\/bt(\/|$)/, /^\/tin-tuc(\/|$)/, /^\/gioi-thieu(\/|$)/, /^\/logout(\/|$)/, /^\/dang-ky(\/|$)/, /^\/tuyen-dung(\/|$)/, /^\/tn(\/|$)/, /^\/ph(\/|$)/, /^\/tra-cuu-hoa-don(\/|$)/, /^\/api\//, /^\/_next\//, /^\/manifest\.webmanifest$/, /^\/favicon/, /\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$/];

function toLogin(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const dev = process.env.ALLOW_DEV_ACTOR === "1" && req.cookies.has("x-dev-actor");

  // Tự đăng xuất khi không thao tác (chỉ phiên nhân sự thật). /logout ghi nhật ký và thu hồi phiên.
  const now = Date.now();
  const seen = Number(req.cookies.get(SEEN_COOKIE)?.value) || null;
  const idleMin = Number(req.cookies.get(IDLE_COOKIE)?.value) || 60;
  if ((access || refresh) && idleExpired(seen, now, idleMin)) {
    const url = req.nextUrl.clone();
    url.pathname = "/logout";
    url.search = "?reason=idle";
    return NextResponse.redirect(url);
  }
  const touch = (res: NextResponse) => {
    // Mỗi lần mở trang = một lần thao tác; ghi tối đa mỗi 30 giây
    if ((access || refresh) && (!seen || now - seen > 30_000)) res.cookies.set(SEEN_COOKIE, String(now), seenCookieOptions());
    return res;
  };

  if (supabaseOn() && needsRefresh(access, refresh)) {
    const s = await refreshSession(refresh!);
    if (s && s !== "network") {
      req.cookies.set(ACCESS_COOKIE, s.access_token);
      req.cookies.set(REFRESH_COOKIE, s.refresh_token);
      const res = NextResponse.next({ request: { headers: req.headers } });
      res.cookies.set(ACCESS_COOKIE, s.access_token, cookieOptions("access", s.expires_in));
      res.cookies.set(REFRESH_COOKIE, s.refresh_token, cookieOptions("refresh"));
      return touch(res);
    }
    if (s === null && !dev) {
      const res = toLogin(req);
      res.cookies.delete(ACCESS_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
      return res;
    }
  }
  if (access || refresh || dev) return touch(NextResponse.next());
  return toLogin(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/).*)"],
};
