import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { PH_COOKIE, sameOrigin } from "@/lib/parent-session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const raw = req.headers.get("cookie") ?? "";
  const tok = raw.split(/;\s*/).find((x) => x.startsWith(`${PH_COOKIE}=`))?.slice(PH_COOKIE.length + 1);
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (tok) await ParentPortal.parentLogout(getDb(), decodeURIComponent(tok), all);
  const res = NextResponse.redirect(new URL("/ph/dang-nhap", req.url), 303);
  res.cookies.delete(PH_COOKIE);
  return res;
}
