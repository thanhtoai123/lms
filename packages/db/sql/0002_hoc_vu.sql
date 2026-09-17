-- Đợt 3 (học vụ): chạy SAU drizzle push, idempotent.

-- 1) Ngày đăng ký lần đầu của học viên: tự điền từ ghi danh đầu tiên (mọi đường tạo ghi danh: form, chốt lead, nhập dữ liệu)
CREATE OR REPLACE FUNCTION students_fill_first_enrolled() RETURNS trigger AS $$
BEGIN
  UPDATE students
     SET first_enrolled_on = (NEW.enrolled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
   WHERE id = NEW.student_id AND first_enrolled_on IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS enrollments_fill_first_enrolled ON enrollments;
CREATE TRIGGER enrollments_fill_first_enrolled AFTER INSERT ON enrollments
  FOR EACH ROW EXECUTE FUNCTION students_fill_first_enrolled();

-- 2) Đợt bảo lưu: ngày trở lại sau ngày bắt đầu
ALTER TABLE student_pauses DROP CONSTRAINT IF EXISTS student_pauses_dates_check;
ALTER TABLE student_pauses ADD CONSTRAINT student_pauses_dates_check CHECK (expected_return IS NULL OR expected_return > from_date);
-- Mỗi học viên chỉ một đợt bảo lưu đang mở
CREATE UNIQUE INDEX IF NOT EXISTS student_pauses_one_open ON student_pauses (student_id) WHERE ended_at IS NULL;

-- 3) Yêu cầu chuyển lớp: phải có lớp đích; danh sách chờ phải có thứ hạng
ALTER TABLE class_transfer_requests DROP CONSTRAINT IF EXISTS class_transfer_requests_check;
ALTER TABLE class_transfer_requests ADD CONSTRAINT class_transfer_requests_check CHECK (to_class_id IS NOT NULL AND to_class_id <> from_class_id AND (status <> 'waitlisted' OR waitlist_rank IS NOT NULL));

-- 4) Buổi học: dải số lưu trữ (5001+) chỉ dành cho buổi đã huỷ
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_archive_seq_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_archive_seq_check CHECK (sequence_no <= 5000 OR status = 'cancelled');

-- 5) Học viên: danh sách dị ứng là mảng JSON
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_allergies_check;
ALTER TABLE students ADD CONSTRAINT students_allergies_check CHECK (jsonb_typeof(allergies) = 'array');
