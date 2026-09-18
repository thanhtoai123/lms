import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, outbox } from "@satarobo/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tồn đọng outbox coi là "quá tải" từ mức này (đổi bằng READY_OUTBOX_BACKLOG) */
const BACKLOG_LIMIT = Number(process.env.READY_OUTBOX_BACKLOG ?? 1000);
/** Việc nền chờ quá số giây này nghĩa là worker đang chết (đổi bằng READY_OUTBOX_AGE_SEC) */
const AGE_LIMIT_SEC = Number(process.env.READY_OUTBOX_AGE_SEC ?? 900);

/**
 * GET /api/ready — "có nhận lưu lượng được không?" (readiness).
 *
 * Kiểm tra hai thứ:
 *  1) CSDL: một câu `select 1` có trả lời trong 3 giây không.
 *  2) Tồn đọng outbox: việc nền còn chờ bao nhiêu và chờ bao lâu — worker chết thì thông báo
 *     cho phụ huynh, email phiếu thu và ZNS đều im lặng mà giao diện vẫn xanh.
 *
 * Không cần đăng nhập. KHÔNG lộ gì về cấu trúc hệ thống: không câu SQL, không tên bảng / cột,
 * không chuỗi kết nối, không thông điệp lỗi gốc của Postgres (chỉ `database: "down"`).
 * Trả 200 khi sẵn sàng, 503 khi chưa — bộ cân bằng tải chỉ cần đọc mã HTTP.
 */
export async function GET() {
  const checks: { database: "up" | "down"; outbox: "ok" | "backlog" | "unknown" } = { database: "down", outbox: "unknown" };
  let pending = 0;
  let oldestSec = 0;

  try {
    const db = getDb();
    // Hẹn giờ riêng: CSDL treo thì endpoint này phải trả lời chứ không treo theo
    const probe = (async () => {
      const rows = (await db.execute(sql`
        select
          count(*) filter (where processed_at is null and dead_letter_at is null)::int as pending,
          coalesce(extract(epoch from (now() - min(created_at) filter (where processed_at is null and dead_letter_at is null)))::int, 0) as oldest_sec
        from ${outbox}
      `)) as unknown as { pending: number; oldest_sec: number }[];
      return rows[0] ?? { pending: 0, oldest_sec: 0 };
    })();
    const r = await Promise.race([
      probe,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
    ]);
    checks.database = "up";
    pending = Number(r.pending ?? 0);
    oldestSec = Number(r.oldest_sec ?? 0);
    checks.outbox = pending > BACKLOG_LIMIT || oldestSec > AGE_LIMIT_SEC ? "backlog" : "ok";
  } catch {
    // Nuốt lỗi gốc có chủ đích: thông điệp của Postgres kèm nguyên văn câu truy vấn và tên cột
    checks.database = "down";
    checks.outbox = "unknown";
  }

  const ready = checks.database === "up" && checks.outbox === "ok";
  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", checks, outboxPending: pending, outboxOldestSec: oldestSec },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
