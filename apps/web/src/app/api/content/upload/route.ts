import { addDocumentVersion } from "@satarobo/api";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";
import { clientSafeMessage } from "@satarobo/core";

/** Tải phiên bản tệp cho tài liệu (multipart: documentId, note, file) */
export async function POST(req: Request) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Dữ liệu tải lên không hợp lệ" }, { status: 400 });
  }
  const documentId = String(form.get("documentId") ?? "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/.test(documentId) || !(file instanceof File)) return Response.json({ ok: false, error: "Chọn tài liệu và tệp" }, { status: 400 });
  try {
    const r = await addDocumentVersion(ctx, { documentId, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), note: String(form.get("note") ?? "") || null });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    // Lỗi tầng CSDL không được trả nguyên văn (lộ câu SQL / tên cột) — xem core/security/log.ts
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
