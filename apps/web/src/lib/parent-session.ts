import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { nguonHopLe } from "@satarobo/core";

/**
 * PHIÊN PHỤ HUYNH — đọc cookie phiên và kiểm nguồn của yêu cầu ghi.
 *
 * Tên cookie khác nhau theo môi trường: ở bản chạy thật dùng tiền tố `__Host-`, thứ trình duyệt
 * chỉ chấp nhận khi cookie có `Secure`, `Path=/` và KHÔNG có `Domain`. Nhờ đó một miền con bị
 * chiếm (vd. trang tin chạy trên `blog.satarobo.vn`) không thể ghi đè cookie phiên của cổng.
 * Bản phát triển chạy http://localhost nên trình duyệt từ chối tiền tố đó → giữ tên thường.
 */
const PROD = process.env.NODE_ENV === "production";
const TEN_THUONG = "ph_session";
const TEN_HOST = "__Host-ph_session";

/** Tên cookie dùng khi ĐẶT phiên */
export const PH_COOKIE = PROD ? TEN_HOST : TEN_THUONG;
/** Mọi tên có thể gặp khi ĐỌC phiên (đổi tên giữa hai lần triển khai không làm rớt ai) */
export const PH_COOKIE_NAMES = [TEN_HOST, TEN_THUONG] as const;

/** Thuộc tính cookie phiên — gom một chỗ để nơi đặt và nơi xoá không lệch nhau */
export function phCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: PROD,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

function tokenTuChuoiCookie(raw: string): string | null {
  const parts = raw.split(/;\s*/);
  for (const ten of PH_COOKIE_NAMES) {
    const hit = parts.find((x) => x.startsWith(`${ten}=`))?.slice(ten.length + 1);
    if (hit) return decodeURIComponent(hit);
  }
  return null;
}

export async function currentParent() {
  const c = await cookies();
  const tok = PH_COOKIE_NAMES.map((n) => c.get(n)?.value).find(Boolean) ?? null;
  return ParentPortal.parentFromToken(getDb(), tok);
}

export async function requireParent() {
  const p = await currentParent();
  if (!p) redirect("/ph/dang-nhap");
  return p;
}

/** Đọc phiên từ request (route handler) */
export async function parentFromRequest(req: Request) {
  return ParentPortal.parentFromToken(getDb(), tokenTuChuoiCookie(req.headers.get("cookie") ?? ""));
}

/** Token thô trong request — chỉ dùng cho đăng xuất (cần chính token để thu hồi đúng phiên) */
export function parentTokenFromRequest(req: Request) {
  return tokenTuChuoiCookie(req.headers.get("cookie") ?? "");
}

/**
 * Yêu cầu ghi có đến từ chính cổng này không (chống CSRF).
 * Bản trước trả `true` khi thiếu header `Origin`; nay thiếu cả `Origin` lẫn `Sec-Fetch-Site`
 * thì từ chối — xem `nguonHopLe` ở `@satarobo/core`.
 */
export function sameOrigin(req: Request) {
  let host: string;
  try {
    host = new URL(req.url).host;
  } catch {
    return false;
  }
  return nguonHopLe({
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    host,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  });
}
