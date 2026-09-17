import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";

export const PH_COOKIE = "ph_session";

export async function currentParent() {
  const c = await cookies();
  return ParentPortal.parentFromToken(getDb(), c.get(PH_COOKIE)?.value);
}

export async function requireParent() {
  const p = await currentParent();
  if (!p) redirect("/ph/dang-nhap");
  return p;
}

/** Đọc phiên từ request (route handler) */
export async function parentFromRequest(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const tok = raw.split(/;\s*/).find((x) => x.startsWith(`${PH_COOKIE}=`))?.slice(PH_COOKIE.length + 1);
  return ParentPortal.parentFromToken(getDb(), tok ? decodeURIComponent(tok) : null);
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || origin === process.env.NEXT_PUBLIC_APP_URL;
  } catch {
    return false;
  }
}
