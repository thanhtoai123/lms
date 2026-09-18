import { createContext, registerUploadedMedia } from "@satarobo/api";
import { MEDIA_UPLOAD_MAX_FILES } from "@satarobo/core";

/**
 * Tải ảnh lớp vào **kho của lớp** (multipart): sessionId, caption, takenAt, classWide,
 * tagged (JSON mảng id HV), files[]. Ảnh chưa gửi duyệt nên phụ huynh chưa thấy.
 */
export async function POST(req: Request) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie") ?? "";
  const dev = cookie.split("; ").find((c) => c.startsWith("x-dev-actor="))?.split("=")[1];
  if (dev && !h.get("x-dev-actor")) h.set("x-dev-actor", decodeURIComponent(dev));
  const sb = cookie.split("; ").find((c) => c.startsWith("sb-access-token="))?.split("=")[1];
  if (sb && !h.get("authorization")) h.set("authorization", `Bearer ${decodeURIComponent(sb)}`);
  const ctx = await createContext({ headers: h, ip: req.headers.get("x-forwarded-for") ?? undefined });
  if (!ctx.actor || !ctx.user) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });

  const form = await req.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  const caption = String(form.get("caption") ?? "").trim() || null;
  const takenAtRaw = String(form.get("takenAt") ?? "").trim();
  const takenAt = /^\d{4}-\d{2}-\d{2}$/.test(takenAtRaw) ? takenAtRaw : null;
  const isClassWide = String(form.get("classWide") ?? "") === "1";
  let tagged: string[] = [];
  try { tagged = JSON.parse(String(form.get("tagged") ?? "[]")) as string[]; } catch { /* bỏ qua */ }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!sessionId || files.length === 0) return Response.json({ ok: false, error: "Chọn buổi học và ít nhất một ảnh" }, { status: 400 });
  if (files.length > MEDIA_UPLOAD_MAX_FILES) return Response.json({ ok: false, error: `Tối đa ${MEDIA_UPLOAD_MAX_FILES} ảnh mỗi lần` }, { status: 400 });

  const pctx = { ...ctx, actor: ctx.actor, user: ctx.user };
  const results: { name: string; ok: boolean; error?: string; id?: string }[] = [];
  for (const f of files) {
    try {
      const row = await registerUploadedMedia(pctx, { sessionId, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()), caption, taggedStudentIds: tagged, takenAt, isClassWide });
      results.push({ name: f.name, ok: true, id: row.id });
    } catch (e) {
      results.push({ name: f.name, ok: false, error: (e as Error).message });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  return Response.json({ ok: ok > 0, uploaded: ok, results }, { status: ok > 0 ? 200 : 400 });
}
