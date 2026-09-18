-- Đợt 8 (hiệu năng / độ tin cậy): outbox thử lại có giãn cách, chống chạy trùng, hàng đợi chết.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM cột / chỉ mục — không xoá dữ liệu, không đổi nghiệp vụ.
--
-- Trước: worker đọc `processed_at is null and attempts < 5`, hỏng thì tăng `attempts` rồi
--        lượt sau (10 giây!) thử lại ngay. Nhà cung cấp sập → gọi dồn; hai worker chạy song song
--        → xử lý trùng một sự kiện (gửi hai lần cho phụ huynh).
-- Sau:   `next_attempt_at` giữ mốc được phép thử lại (30s · 2^(n-1), trần 15 phút),
--        `dead_letter_at` đóng dòng hỏng quá 5 lần, worker nhận việc bằng
--        `select … for update skip locked` nên không hai worker nào đụng cùng một dòng.

-- ------------------------------------------------------------------
-- 1) Ba cột độ tin cậy cho outbox
-- ------------------------------------------------------------------
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS dead_letter_at  timestamptz;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Dòng cũ đã hỏng đủ 5 lần: đánh dấu là hàng đợi chết để worker thôi đọc lại.
-- (Hành vi cũ `attempts < 5` cũng đã bỏ qua các dòng này — chỉ là trước đây không ghi rõ ra cột.)
UPDATE outbox
   SET dead_letter_at = COALESCE(dead_letter_at, now())
 WHERE processed_at IS NULL AND attempts >= 5 AND dead_letter_at IS NULL;

-- Dòng cũ chưa xử lý: cho phép thử lại ngay (không bắt chờ vô cớ sau khi nâng cấp)
UPDATE outbox
   SET next_attempt_at = COALESCE(created_at, now())
 WHERE processed_at IS NULL AND dead_letter_at IS NULL AND next_attempt_at > now();

-- ------------------------------------------------------------------
-- 2) Chỉ mục cho đường đọc của worker
--    Phục vụ: packages/api/src/services/engagement.ts — claimOutboxBatch()
--    (where processed_at is null and dead_letter_at is null and next_attempt_at <= now()
--     order by created_at)
--    Chỉ mục MỘT PHẦN: việc đã xong chiếm gần hết bảng nhưng không nằm trong chỉ mục,
--    nên chỉ mục luôn nhỏ dù outbox có hàng chục triệu dòng lịch sử.
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS outbox_ready_idx
  ON outbox (next_attempt_at, created_at)
  WHERE processed_at IS NULL AND dead_letter_at IS NULL;

-- Trang Hệ thống: đếm + liệt kê hàng đợi chết (engagement.ts — outboxStats)
CREATE INDEX IF NOT EXISTS outbox_dead_idx
  ON outbox (created_at DESC)
  WHERE dead_letter_at IS NOT NULL;

-- Dọn lịch sử / thống kê "đã xử lý 24h" (engagement.ts — outboxStats)
CREATE INDEX IF NOT EXISTS outbox_processed_idx
  ON outbox (processed_at)
  WHERE processed_at IS NOT NULL;

-- ------------------------------------------------------------------
-- 3) Chống phát trùng sự kiện SLA lead
--    scanLeadSla() chạy mỗi 10 giây; cửa sổ "quá hạn ≡ 0..5 phút (mod 60)" rộng 6 phút
--    nên một lead từng bị phát ~36 sự kiện mỗi giờ. Nay hàm đó kiểm tra "trong 1 giờ qua
--    đã phát cho lead này chưa" — chỉ mục dưới đây làm phép kiểm tra đó gần như miễn phí.
--    Phục vụ: packages/api/src/services/engagement.ts — scanLeadSla()
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS outbox_lead_sla_idx
  ON outbox ((payload ->> 'leadId'), created_at DESC)
  WHERE type = 'lead.sla_breached';
