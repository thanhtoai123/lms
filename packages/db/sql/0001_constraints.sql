-- Chạy SAU khi `drizzle-kit push` / `migrate` tạo bảng.
-- Các ràng buộc không biểu diễn được bằng Drizzle schema.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Không cho 2 buổi trùng phòng trong cùng khoảng thời gian (lớp phòng thủ cuối; app đã check trước)
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_no_room_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND status NOT IN ('cancelled', 'rescheduled'));

-- 2) Không cho 1 giáo viên dạy 2 buổi trùng giờ
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_no_teacher_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_no_teacher_overlap
  EXCLUDE USING gist (
    teacher_id WITH =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp, '[)') WITH &&
  ) WHERE (teacher_id IS NOT NULL AND status NOT IN ('cancelled', 'rescheduled'));

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
