import { NextResponse, type NextRequest } from "next/server";
import { PATH_REQUEST_HEADER } from "@/lib/path-header";
import {
  idleExpired,
  devActorAllowed,
  DEV_ACTOR_HEADER,
  NEXT_NONCE_REQUEST_HEADER,
  NONCE_REQUEST_HEADER,
  cspHeaderName,
  generateNonce,
  securityHeaderOptions,
  securityHeaders,
} from "@satarobo/core";
import { ACCESS_COOKIE, IDLE_COOKIE, REFRESH_COOKIE, SEEN_COOKIE, cookieOptions, needsRefresh, refreshSession, seenCookieOptions, supabaseOn } from "@/lib/auth-session";

/**
 * Chặn sớm: chưa có phiên đăng nhập thì chuyển về /login?next=… trước khi render
 * (không render trang quản trị rồi mới redirect). Kiểm tra quyền thật vẫn ở service/policy.
 * Phiên Supabase sắp hết hạn thì làm mới tại đây (trang) và ở /api/trpc (gọi API).
 *
 * Đây cũng là NƠI DUY NHẤT gắn header bảo mật cho phản hồi trang, vì CSP có **nonce sinh
 * theo từng yêu cầu** nên không đặt tĩnh trong `next.config.ts` được.
 */
const PUBLIC = [/^\/login(\/|$)/, /^\/quen-mat-khau(\/|$)/, /^\/dat-mat-khau(\/|$)/, /^\/ks(\/|$)/, /^\/pdg(\/|$)/, /^\/hs(\/|$)/, /^\/cn(\/|$)/, /^\/in-ho-so(\/|$)/, /^\/bt(\/|$)/, /^\/tin-tuc(\/|$)/, /^\/gioi-thieu(\/|$)/, /^\/logout(\/|$)/, /^\/dang-ky(\/|$)/, /^\/tuyen-dung(\/|$)/, /^\/tn(\/|$)/, /^\/ph(\/|$)/, /^\/tra-cuu-hoa-don(\/|$)/, /^\/api\//, /^\/_next\//, /^\/manifest\.webmanifest$/, /^\/favicon/, /\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$/];

function toLogin(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

/**
 * Proxy chạy ở Edge runtime: biến môi trường chỉ chắc chắn có mặt khi được ĐỌC TƯỜNG MINH
 * (`process.env.X`) để trình đóng gói nhúng sẵn giá trị vào. Đọc cả đối tượng `process.env`
 * có thể trả về rỗng — và khi đó mọi đường thoát CSP dưới đây sẽ im lặng không có tác dụng.
 * Vì vậy liệt kê từng biến ở đây thay vì dựa vào việc duyệt đối tượng.
 */
const cspEnv = () => ({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
  CSP_ALLOW_UNSAFE_INLINE: process.env.CSP_ALLOW_UNSAFE_INLINE,
  CSP_STRICT_DYNAMIC: process.env.CSP_STRICT_DYNAMIC,
  CSP_SCRIPT_SRC_EXTRA: process.env.CSP_SCRIPT_SRC_EXTRA,
  CSP_CONNECT_SRC_EXTRA: process.env.CSP_CONNECT_SRC_EXTRA,
  CSP_IMG_SRC_EXTRA: process.env.CSP_IMG_SRC_EXTRA,
  CSP_FRAME_SRC_EXTRA: process.env.CSP_FRAME_SRC_EXTRA,
  CSP_STYLE_SRC_EXTRA: process.env.CSP_STYLE_SRC_EXTRA,
  CSP_FRAME_ANCESTORS: process.env.CSP_FRAME_ANCESTORS,
  CSP_REPORT_URI: process.env.CSP_REPORT_URI,
  HSTS_MAX_AGE: process.env.HSTS_MAX_AGE,
  HSTS_PRELOAD: process.env.HSTS_PRELOAD,
});

/**
 * Gắn bộ header bảo mật (CSP có nonce, HSTS, nosniff, Referrer-Policy, Permissions-Policy,
 * COOP, CORP, frame-ancestors) lên MỌI phản hồi đi qua proxy — kể cả redirect.
 * Định nghĩa nằm ở `@satarobo/core/security/headers` để chỉ có một nơi phải sửa.
 */
function withSecurity(res: NextResponse, nonce: string) {
  for (const [k, v] of securityHeaders(securityHeaderOptions(cspEnv(), nonce))) res.headers.set(k, v);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Mỗi yêu cầu một nonce. Next.js đọc nonce từ header `Content-Security-Policy` TRÊN YÊU CẦU
  // rồi tự gắn `nonce=…` cho các thẻ <script> nó sinh ra (bootstrap, dữ liệu RSC, các mảnh JS);
  // vì vậy phải đặt header này lên request, không chỉ lên response.
  const nonce = generateNonce();
  const opts = securityHeaderOptions(cspEnv(), nonce);
  const cspValue = securityHeaders(opts).find(([k]) => k === cspHeaderName(opts.reportOnly))![1];
  /**
   * Dựng lại header của YÊU CẦU tại thời điểm gọi — phải đọc `req.headers` muộn vì
   * `req.cookies.set()` ở nhánh làm mới phiên có sửa lại header `cookie`.
   */
  const requestHeaders = () => {
    const h = new Headers(req.headers);
    // Header do máy khách tự gửi không được lẫn vào, nếu không người gọi tự chọn nonce của chính mình
    h.delete(NONCE_REQUEST_HEADER);
    h.delete("content-security-policy");
    h.delete("content-security-policy-report-only");
    h.set(NONCE_REQUEST_HEADER, nonce);
    // Đường dẫn đang mở — khung quản trị dùng để áp hàng rào trang theo menu (pageAllowed).
    // Luôn GHI ĐÈ giá trị máy khách gửi lên để không ai tự khai đường dẫn khác.
    h.set(PATH_REQUEST_HEADER, pathname);
    h.set(opts.reportOnly ? "content-security-policy-report-only" : NEXT_NONCE_REQUEST_HEADER, cspValue);
    return h;
  };
  const pass = () => NextResponse.next({ request: { headers: requestHeaders() } });

  if (PUBLIC.some((r) => r.test(pathname))) return withSecurity(pass(), nonce);
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const dev = devActorAllowed(process.env) && req.cookies.has(DEV_ACTOR_HEADER);

  // Tự đăng xuất khi không thao tác (chỉ phiên nhân sự thật). /logout ghi nhật ký và thu hồi phiên.
  const now = Date.now();
  const seen = Number(req.cookies.get(SEEN_COOKIE)?.value) || null;
  const idleMin = Number(req.cookies.get(IDLE_COOKIE)?.value) || 60;
  if ((access || refresh) && idleExpired(seen, now, idleMin)) {
    const url = req.nextUrl.clone();
    url.pathname = "/logout";
    url.search = "?reason=idle";
    return withSecurity(NextResponse.redirect(url), nonce);
  }
  const touch = (res: NextResponse) => {
    // Mỗi lần mở trang = một lần thao tác; ghi tối đa mỗi 30 giây
    if ((access || refresh) && (!seen || now - seen > 30_000)) res.cookies.set(SEEN_COOKIE, String(now), seenCookieOptions());
    return withSecurity(res, nonce);
  };

  if (supabaseOn() && needsRefresh(access, refresh)) {
    const s = await refreshSession(refresh!);
    if (s && s !== "network") {
      req.cookies.set(ACCESS_COOKIE, s.access_token);
      req.cookies.set(REFRESH_COOKIE, s.refresh_token);
      const res = NextResponse.next({ request: { headers: requestHeaders() } });
      res.cookies.set(ACCESS_COOKIE, s.access_token, cookieOptions("access", s.expires_in));
      res.cookies.set(REFRESH_COOKIE, s.refresh_token, cookieOptions("refresh"));
      return touch(res);
    }
    if (s === null && !dev) {
      const res = toLogin(req);
      res.cookies.delete(ACCESS_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
      return withSecurity(res, nonce);
    }
  }
  if (access || refresh || dev) return touch(pass());
  return withSecurity(toLogin(req), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/).*)"],
};
