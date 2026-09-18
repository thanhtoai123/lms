-- Đợt 8 (bảo mật): trần tần suất DÙNG CHUNG giữa các bản sao máy chủ.
-- Chạy được cả khi đã `drizzle push` (idempotent). CHỈ THÊM bảng / index — không đụng dữ liệu cũ.
--
-- Vì sao cần: mọi trần tần suất trước đây đếm trong `Map` của MỘT tiến trình. Chạy nhiều bản sao
-- thì trần thực tế nhân lên theo số bản sao, và mỗi lần triển khai lại là đếm về 0 — kẻ dò mã
-- kích hoạt phụ huynh (6 chữ số) chỉ cần đợi một lần deploy. Bảng này là kho đếm chung,
-- tăng nguyên tử bằng INSERT … ON CONFLICT DO UPDATE.

CREATE TABLE IF NOT EXISTS rate_limits (
  -- `<mục đích>|<loại>:<định danh>` — định danh nhạy cảm (SĐT, email) đã băm trước khi ghép khoá
  key          text        NOT NULL,
  -- Mốc đầu ô thời gian (cửa sổ cố định): now chia hết cho độ dài cửa sổ
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  -- window_start + độ dài cửa sổ; dùng để dọn dòng hết hạn
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start)
);

-- Dọn dòng hết hạn (worker gọi định kỳ) quét theo cột này
CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);

-- Số đếm không bao giờ âm
ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_count_check;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_count_check CHECK (count >= 0);

COMMENT ON TABLE rate_limits IS
  'Bộ đếm trần tần suất dùng chung giữa các bản sao máy chủ (cửa sổ cố định). Dòng hết hạn được worker dọn định kỳ.';
