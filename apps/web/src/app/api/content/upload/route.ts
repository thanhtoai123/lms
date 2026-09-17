import { addDocumentVersion } from "@satarobo/api";
import { routeContext, errorStatus } from "@/lib/route-ctx";

/** Tải phiên bản tệp cho tài liệu (multipart: documentId, note, file) */
export async function POST(req: Request) {
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
    return Response.json({ ok: false, error: (e as Error).message }, { status: errorStatus(e) });
  }
}
