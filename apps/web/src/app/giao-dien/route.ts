import { NextResponse } from "next/server";
import { duongNoiBo } from "@satarobo/core";
import { GIAO_DIEN_COOKIE } from "@/lib/giao-dien";

/**
 * Đổi khung hiển thị cho người kiêm nhiệm: `?m=ql` về khu quản trị, `?m=gv` sang giao diện giáo viên.
 * Chỉ ghi cookie chọn khung (không liên quan quyền) rồi chuyển về `next` (đường nội bộ đã kiểm).
 */
export function GET(req: Request) {
  const u = new URL(req.url);
  const m = u.searchParams.get("m") === "gv" ? "gv" : "ql";
  const next = duongNoiBo(u.searchParams.get("next")) ?? (m === "gv" ? "/teacher" : "/viec-hom-nay");
  const res = NextResponse.redirect(new URL(next, u.origin), 303);
  res.cookies.set(GIAO_DIEN_COOKIE, m, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  return res;
}
