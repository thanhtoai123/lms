import { uploadTemplateBackground } from "@satarobo/api";
import { CERTIFICATE_BG_MAX_BYTES, clientSafeMessage } from "@satarobo/core";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";

/**
 * Tải ảnh nền cho MẪU GIẤY CHỨNG NHẬN (multipart: templateId, file).
 * PNG / JPG ≤ 15 MB, soi magic bytes ở service (không tin Content-Type), lưu kho tệp, phát qua URL có chữ ký.
 */
export async function POST(req: Request) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > CERTIFICATE_BG_MAX_BYTES + 200_000) {
    return Response.json({ ok: false, error: "Ảnh nền tối đa 15MB — xuất lại PNG từ Canva với kích thước 3508×2480 px" }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const templateId = String(form?.get("templateId") ?? "");
  const file = form?.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return Response.json({ ok: false, error: "Thiếu mẫu chứng nhận" }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Chọn ảnh nền PNG hoặc JPG" }, { status: 400 });
  try {
    const r = await uploadTemplateBackground(ctx, { templateId, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json({ ok: true, warnings: r.warnings, template: { id: r.template.id, backgroundUrl: r.template.backgroundUrl, widthPx: r.template.widthPx, heightPx: r.template.heightPx } });
  } catch (e) {
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
