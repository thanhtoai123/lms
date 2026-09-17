-- Chạy SAU khi `drizzle-kit push` / `migrate` tạo bảng.
-- Các ràng buộc không biểu diễn được bằng Drizzle schema.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Không cho 2 buổi trùng phòng trong cùng khoảng thời gian (lớp phòng thủ cuối; app đã check trước)
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_no_room_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND status NOT IN ('cancelled', 'rescheduled'))
  DEFERRABLE INITIALLY IMMEDIATE;  -- "Áp lịch mới" hoãn kiểm tra tới cuối transaction khi xếp lại nhiều buổi

-- 2) Không cho 1 giáo viên dạy 2 buổi trùng giờ
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_no_teacher_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_no_teacher_overlap
  EXCLUDE USING gist (
    teacher_id WITH =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp, '[)') WITH &&
  ) WHERE (teacher_id IS NOT NULL AND status NOT IN ('cancelled', 'rescheduled'))
  DEFERRABLE INITIALLY IMMEDIATE;

-- 3) Giờ kết thúc phải sau giờ bắt đầu
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_time_order;
ALTER TABLE sessions ADD CONSTRAINT sessions_time_order CHECK (end_time > start_time);
ALTER TABLE class_schedules DROP CONSTRAINT IF EXISTS class_schedules_time_order;
ALTER TABLE class_schedules ADD CONSTRAINT class_schedules_time_order CHECK (end_time > start_time AND weekday BETWEEN 1 AND 7);

-- 4) Audit log append-only: cấm UPDATE/DELETE ở tầng DB
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- 5) View "hàng đợi việc": buổi học chưa hoàn tất đã qua ngày — dashboard chỉ cần SELECT
CREATE OR REPLACE VIEW v_overdue_sessions AS
SELECT s.*, c.code AS class_code, c.name AS class_name, c.center_id
FROM sessions s
JOIN classes c ON c.id = s.class_id
WHERE s.status IN ('scheduled', 'in_progress', 'attendance_done', 'notes_done')
  AND s.date < CURRENT_DATE;

-- 6) Sổ cái tài chính append-only
CREATE OR REPLACE FUNCTION finance_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'finance_ledger is append-only: ghi bút toán điều chỉnh thay vì sửa/xoá';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS finance_ledger_no_update ON finance_ledger;
CREATE TRIGGER finance_ledger_no_update BEFORE UPDATE OR DELETE ON finance_ledger
  FOR EACH ROW EXECUTE FUNCTION finance_ledger_immutable();

-- 7) Tiền không âm
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_amounts_check;
ALTER TABLE orders ADD CONSTRAINT orders_amounts_check CHECK (subtotal >= 0 AND discount_amount >= 0 AND total >= 0 AND total = subtotal - discount_amount);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0 AND recorded_amount > 0);
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_amount_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_check CHECK (amount > 0 AND amount <= proposed_amount);

-- 8) Biến động số dư & hoa hồng
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_tx_amount_check;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_amount_check CHECK (amount > 0);
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_tx_matched_check;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_matched_check CHECK (status <> 'matched' OR (order_id IS NOT NULL AND payment_id IS NOT NULL));
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_sign_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_sign_check CHECK ((parent_id IS NULL AND amount >= 0 AND amount <= original_amount) OR (parent_id IS NOT NULL AND amount <= 0));
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_beneficiary_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_beneficiary_check CHECK (beneficiary_user_id IS NOT NULL OR beneficiary_parent_id IS NOT NULL);

-- 9) Chấm công: lượt chấm thô chỉ thêm
CREATE OR REPLACE FUNCTION attendance_punches_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'attendance_punches is append-only: dùng chỉnh công có lý do thay vì sửa/xoá lượt chấm';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS attendance_punches_no_update ON attendance_punches;
CREATE TRIGGER attendance_punches_no_update BEFORE UPDATE OR DELETE ON attendance_punches
  FOR EACH ROW EXECUTE FUNCTION attendance_punches_immutable();
ALTER TABLE staff_requests DROP CONSTRAINT IF EXISTS staff_requests_dates_check;
ALTER TABLE staff_requests ADD CONSTRAINT staff_requests_dates_check CHECK (date_to >= date_from);
ALTER TABLE timesheet_overrides DROP CONSTRAINT IF EXISTS timesheet_overrides_units_check;
ALTER TABLE timesheet_overrides ADD CONSTRAINT timesheet_overrides_units_check CHECK (units >= 0 AND units <= 1.5);

-- 10) CSKH
ALTER TABLE parent_feedback DROP CONSTRAINT IF EXISTS parent_feedback_rating_check;
ALTER TABLE parent_feedback ADD CONSTRAINT parent_feedback_rating_check CHECK (rating BETWEEN 1 AND 5 AND (teacher_rating IS NULL OR teacher_rating BETWEEN 1 AND 5));
ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_nps_check;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_nps_check CHECK (nps_score IS NULL OR nps_score BETWEEN 0 AND 10);
