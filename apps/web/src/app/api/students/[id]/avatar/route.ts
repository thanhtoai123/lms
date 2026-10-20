import { uploadStudentAvatar, removeStudentAvatar } from "@satarobo/api";
import { STUDENT_AVATAR_MAX, clientSafeMessage } from "@satarobo/core";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";

const UUID = /^[0-9a-f-]{36}$/i;

/** Ảnh đại diện học viên (nhân sự): POST multipart `file` · DELETE. Quyền `student:update` kiểm ở service. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ ok: false, error: "Mã học viên không hợp lệ" }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > STUDENT_AVATAR_MAX + 100_000) return Response.json({ ok: false, error: "Ảnh tối đa 2MB" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "Chọn ảnh" }, { status: 400 });
  try {
    return Response.json(await uploadStudentAvatar(ctx, { studentId: id, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }));
  } catch (e) {
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(req)) return crossSiteResponse();
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ ok: false, error: "Mã học viên không hợp lệ" }, { status: 400 });
  try {
    return Response.json(await removeStudentAvatar(ctx, id));
  } catch (e) {
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
