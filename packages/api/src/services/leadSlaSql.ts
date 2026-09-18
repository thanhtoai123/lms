/**
 * SLA lead — bản dịch sang SQL của `computeSla` trong `@satarobo/core`.
 *
 * VÌ SAO CẦN: bốn đường nóng (worker `scanLeadSla`, `inbox.today` → nhóm "Lead quá hạn",
 * `dashboard.adminOverview`, `leads.inbox` → khối tổng hợp) đều tải lead về rồi gọi `computeSla`
 * cho từng dòng trong JavaScript, chỉ để ĐẾM xem bao nhiêu lead quá hạn. Với 300 lead thì không
 * thấy gì; với 200.000 lead thì mỗi lượt vào trang chủ kéo 200.000 dòng qua mạng.
 *
 * NGUYÊN TẮC: KHÔNG chép lại luật nghiệp vụ. Ngưỡng vẫn lấy từ chính `SlaPolicy` mà
 * `resolveAdmissionsPolicy` trả về; ở đây chỉ dịch đúng ba dòng cuối của `computeSla` thành SQL:
 *
 *    due   = last_touch_at + minutes phút
 *    diff  = (now - due) tính bằng phút
 *    diff > 0                    → "overdue", overdueMinutes = round(diff)
 *    -diff <= minutes * 0.25     → "warning"
 *    còn lại                     → "ok"
 *
 * `now` được TRUYỀN VÀO từ JavaScript (không dùng `now()` của Postgres) để một lượt gọi API
 * cho ra cùng một kết quả ở mọi truy vấn, đúng như khi tính bằng JS.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { LEAD_STATUSES, type SlaPolicy } from "@satarobo/core";

/**
 * `case status when 'new' then 15 … end` — phút SLA của từng trạng thái; null = không áp SLA.
 *
 * Kiểu là `double precision` chứ KHÔNG phải `numeric`: Postgres chỉ có toán tử
 * `double precision * interval`, không có `numeric * interval`.
 */
function minutesCase(policy: SlaPolicy, statusCol: AnyPgColumn): SQL {
  const parts: SQL[] = [];
  for (const st of LEAD_STATUSES) {
    const m = policy.minutesByStatus[st];
    if (m === null || m === undefined) continue;
    // `m` là số lấy từ chính sách (không phải từ người dùng) nhưng vẫn đi qua tham số ràng buộc
    parts.push(sql`when ${statusCol}::text = ${st} then ${m}::double precision`);
  }
  if (parts.length === 0) return sql`null::double precision`;
  return sql`(case ${sql.join(parts, sql` `)} else null::double precision end)`;
}

/** Số phút đã quá hạn, làm tròn như `Math.round` — âm / null nghĩa là chưa quá hạn */
export function slaOverdueMinutesSql(policy: SlaPolicy, statusCol: AnyPgColumn, lastTouchCol: AnyPgColumn, now: Date): SQL<number | null> {
  const m = minutesCase(policy, statusCol);
  return sql<number | null>`round(
    (extract(epoch from (${now.toISOString()}::timestamptz - (${lastTouchCol} + ${m} * interval '1 minute'))) / 60)
  )::int`;
}

/** Điều kiện "đang quá hạn" — tương đương `computeSla(...).level === "overdue"` */
export function slaOverdueSql(policy: SlaPolicy, statusCol: AnyPgColumn, lastTouchCol: AnyPgColumn, now: Date): SQL<boolean> {
  const m = minutesCase(policy, statusCol);
  return sql<boolean>`(${m} is not null and ${lastTouchCol} + ${m} * interval '1 minute' < ${now.toISOString()}::timestamptz)`;
}

/**
 * Điều kiện "sắp tới hạn" — tương đương `level === "warning"`:
 * chưa quá hạn NHƯNG chỉ còn ≤ 25% quãng SLA.
 */
export function slaWarningSql(policy: SlaPolicy, statusCol: AnyPgColumn, lastTouchCol: AnyPgColumn, now: Date): SQL<boolean> {
  const m = minutesCase(policy, statusCol);
  const at = sql`${now.toISOString()}::timestamptz`;
  return sql<boolean>`(
    ${m} is not null
    and ${lastTouchCol} + ${m} * interval '1 minute' >= ${at}
    and ${lastTouchCol} + (${m} * 0.75::double precision) * interval '1 minute' <= ${at}
  )`;
}
