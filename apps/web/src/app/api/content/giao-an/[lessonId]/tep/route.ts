import { planFileStream } from "@satarobo/api";
import { routeContext, errorStatus, crossSite, crossSiteResponse } from "@/lib/route-ctx";
import { clientSafeMessage } from "@satarobo/core";

/**
 * Phát slide giáo án của một buổi — THEO PHIÊN ĐĂNG NHẬP, không có link tải.
 *
 * Vì sao không dùng URL ký sẵn như ảnh lớp học: URL ký là tấm vé mang theo được, ai cầm link cũng mở
 * được cho tới khi hết hạn. Học liệu là tài sản của trung tâm nên mỗi lần phát đều kiểm tra lại phiên,
 * quyền và phạm vi khoá dạy, rồi ghi nhật ký. Trình duyệt cũng được yêu cầu không lưu đệm.
 */
export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (crossSite(req)) return crossSiteResponse();
  const { lessonId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(lessonId)) return new Response("Buổi học không hợp lệ", { status: 400 });
  const ctx = await routeContext(req);
  if (!ctx) return new Response("Chưa đăng nhập", { status: 401 });
  try {
    const f = await planFileStream(ctx, { lessonId });
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mimeType,
        // inline: mở trong khung chiếu, không phải tải về; tên tệp không mang thông tin nội bộ
        "Content-Disposition": `inline; filename="giao-an.pdf"`,
        // Không lưu đệm ở trình duyệt / proxy: đóng phiên là không còn bản sao trong máy
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return new Response(clientSafeMessage(e), { status: errorStatus(e) });
  }
}
