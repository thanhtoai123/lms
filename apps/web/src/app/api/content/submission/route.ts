import { staffSubmit } from "@satarobo/api";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";

/** Giáo viên / giáo vụ nộp hộ bài (multipart: submissionId, text, link, files[]) */
export async function POST(req: Request) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const submissionId = String(form.get("submissionId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(submissionId)) return Response.json({ ok: false, error: "Thiếu bài nộp" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    const r = await staffSubmit(ctx, {
      submissionId, text: String(form.get("text") ?? "") || null, link: String(form.get("link") ?? "") || null,
      files: await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))),
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: errorStatus(e) });
  }
}
