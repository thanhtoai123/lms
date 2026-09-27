/**
 * Móc của Next.js: bắt MỌI lỗi chưa xử lý khi render trang, server action và route handler,
 * gom vào bảng lỗi máy chủ (xem packages/core/src/ops/loiMayChu.ts, hiện ở /van-hanh).
 * Chỉ chạy ở Node runtime; không bao giờ ném lỗi ngược lại.
 */
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ghiLoiMayChu } = await import("@satarobo/api");
    await ghiLoiMayChu(err, `${context.routeType ?? "req"}:${request.method} ${request.path}`);
  } catch {
    /* ghi lỗi hỏng thì thôi — không làm hỏng phản hồi */
  }
}
