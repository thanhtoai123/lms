-- KT-30 — dọn giá trị enum cũ `locked` của `timesheet_periods.status`.
--
-- Bản đầu dùng `locked` cho kỳ công đã chốt; sau đổi thành `closed` nhưng vẫn phải giữ `locked`
-- trong enum để đọc dữ liệu cũ, kéo theo một hằng "legacy" trong mã và một hàm chuẩn hoá ở mọi
-- chỗ đọc. Đổi dữ liệu một lần rồi bỏ hẳn giá trị cũ thì mã sạch và không ai lỡ ghi `locked` nữa.
--
-- Chạy lại nhiều lần vẫn an toàn: nếu enum không còn `locked` thì bỏ qua toàn bộ.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'timesheet_period_status' AND e.enumlabel = 'locked'
  ) THEN
    -- 1) Dữ liệu: kỳ đang mang giá trị cũ về đúng nghĩa "đã chốt"
    UPDATE timesheet_periods SET status = 'closed' WHERE status::text = 'locked';

    -- 2) Enum: Postgres không xoá được một nhãn, phải dựng lại kiểu
    ALTER TYPE timesheet_period_status RENAME TO timesheet_period_status_cu;
    CREATE TYPE timesheet_period_status AS ENUM ('not_open', 'open', 'closing', 'closed', 'reopened');

    ALTER TABLE timesheet_periods ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE timesheet_periods
      ALTER COLUMN status TYPE timesheet_period_status
      USING (CASE WHEN status::text = 'locked' THEN 'closed' ELSE status::text END)::timesheet_period_status;
    ALTER TABLE timesheet_periods ALTER COLUMN status SET DEFAULT 'open';

    DROP TYPE timesheet_period_status_cu;
  END IF;
END $$;
