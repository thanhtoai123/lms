import { uploadSiteMedia, SITE_MEDIA_MAX } from "@satarobo/api";
import { routeContext, errorStatus } from "@/lib/route-ctx";

/** Tải ảnh cho website (multipart: file, alt) */
export async function POST(req: Request) {
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > SITE_MEDIA_MAX + 100_000) return Response.json({ ok: false, error: "Ảnh tối đa 5MB" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Chọn ảnh" }, { status: 400 });
  try {
    const r = await uploadSiteMedia(ctx, { fileName: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()), alt: String(form?.get("alt") ?? "") || null });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: errorStatus(e) });
  }
}
