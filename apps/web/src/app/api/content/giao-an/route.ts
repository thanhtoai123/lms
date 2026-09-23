import { uploadPlan, apiLogger } from "@satarobo/api";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";
import { clientSafeMessage, validatePlanFile } from "@satarobo/core";

/**
 * Đẩy & thay giáo án của một buổi học (multipart: lessonId, file .pdf hoặc .zip).
 * Đi đường HTTP chứ không qua tRPC vì tệp có thể tới 200MB — tRPC gói dữ liệu trong JSON.
 */
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
  const lessonId = String(form.get("lessonId") ?? "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/.test(lessonId) || !(file instanceof File)) return Response.json({ ok: false, error: "Chọn buổi học và tệp giáo án" }, { status: 400 });
  // Chặn sớm ngay ở biên: khỏi nạp cả tệp 300MB vào bộ nhớ rồi mới báo sai định dạng
  const early = validatePlanFile(file.name, file.size);
  if (early) return Response.json({ ok: false, error: early }, { status: 400 });
  try {
    const r = await uploadPlan(ctx, { lessonId, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    // Người dùng chỉ thấy câu chung chung (không lộ SQL/cấu trúc bảng); chi tiết vào nhật ký máy chủ
    // để còn tìm được nguyên nhân khi gói SCORM hỏng theo kiểu lạ.
    apiLogger.child("giao-an").error("day giao an loi", { err: e, lessonId });
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
