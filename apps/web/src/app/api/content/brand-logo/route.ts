import { uploadBrandLogo } from "@satarobo/api";
import { BRAND_LOGO_MAX, clientSafeMessage } from "@satarobo/core";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";

/** Tải logo thương hiệu (multipart: file). Chỉ Quản trị hệ thống — kiểm quyền ở service. */
export async function POST(req: Request) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > BRAND_LOGO_MAX + 100_000) return Response.json({ ok: false, error: "Logo tối đa 1MB" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Chọn tệp logo" }, { status: 400 });
  try {
    const r = await uploadBrandLogo(ctx, { mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
