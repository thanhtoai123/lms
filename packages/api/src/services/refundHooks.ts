import { and, eq, inArray, sql } from "drizzle-orm";
import { orders, payments } from "@satarobo/db";
import type { ProtectedContext } from "../trpc";

type Db = ProtectedContext["db"];

/**
 * Hook vòng đời học vụ (Đợt 3) — Đợt 2 đã chuyển phần thân vào `finance.ts` (đề xuất theo dòng đơn,
 * cột `refunds.trigger` / `refunds.auto`). Giữ nguyên tên và chữ ký cho các nơi đang gọi
 * (`enrollments.ts` khi rút học / chuyển lớp, `classOps.ts` khi huỷ lớp).
 */
export { proposeRefundIfPaid, type RefundTrigger } from "./finance";

/** Tổng tiền đã thu (đã xác nhận) của các ghi danh — dùng cho xem trước huỷ lớp */
export async function collectedForEnrollments(db: Db, enrollmentIds: string[]): Promise<number> {
  if (!enrollmentIds.length) return 0;
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(inArray(orders.enrollmentId, enrollmentIds), eq(payments.status, "confirmed")));
  return Number(r?.n ?? 0);
}
