import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { PH_COOKIE_NAMES, parentTokenFromRequest, phCookieOptions, sameOrigin } from "@/lib/parent-session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const tok = parentTokenFromRequest(req);
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (tok) await ParentPortal.parentLogout(getDb(), tok, all);
  const res = NextResponse.redirect(new URL("/ph/dang-nhap", req.url), 303);
  // Xoá cả tên cũ lẫn tên có tiền tố `__Host-`: đổi tên giữa hai lần triển khai vẫn sạch cookie
  for (const ten of PH_COOKIE_NAMES) res.cookies.set(ten, "", { ...phCookieOptions(new Date(0)), maxAge: 0 });
  return res;
}
