import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — "tiến trình còn sống không?" (liveness).
 *
 * KHÔNG chạm CSDL: bộ điều phối (Docker / Kubernetes / load balancer) dùng endpoint này để
 * quyết định có KHỞI ĐỘNG LẠI tiến trình hay không. Nếu nó phụ thuộc vào Postgres thì một sự cố
 * CSDL sẽ làm cả cụm web bị giết và khởi động lại vòng quanh trong khi chẳng tiến trình nào hỏng.
 * Câu hỏi "CSDL có sẵn sàng không?" thuộc về /api/ready.
 *
 * Không cần đăng nhập, nhưng cũng KHÔNG tiết lộ gì: không tên máy, không phiên bản, không biến
 * môi trường, không đường dẫn, không cấu trúc bảng. Chỉ một chữ "ok" và thời gian chạy.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", uptimeSec: Math.floor(process.uptime()) },
    { headers: { "cache-control": "no-store" } },
  );
}
