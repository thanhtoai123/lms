-- Đợt 13 (học vụ): CHUẨN THÔNG TIN HỒ SƠ HỌC TẬP — rubric có mô tả 4 mức, nhóm tiêu chí, tiêu chí trọng tâm theo bài,
-- chỉ mục cho màn "Quản lý hồ sơ học tập". Chạy SAU drizzle push, idempotent. CHỈ THÊM cột / bảng / ràng buộc / chỉ mục.
-- Xem docs/HO-SO-HOC-TAP.md, mục "Chuẩn thông tin hồ sơ học tập".

-- ------------------------------------------------------------------
-- 1. Tiêu chí năng lực: nhóm + mô tả hành vi cho từng mức (mảng 4 chuỗi, mức 1 → 4)
-- ------------------------------------------------------------------
ALTER TABLE competency_criteria ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE competency_criteria ADD COLUMN IF NOT EXISTS level_descriptors jsonb;

ALTER TABLE competency_criteria DROP CONSTRAINT IF EXISTS competency_criteria_level_descriptors_check;
ALTER TABLE competency_criteria ADD CONSTRAINT competency_criteria_level_descriptors_check CHECK (
  level_descriptors IS NULL OR (
    jsonb_typeof(level_descriptors) = 'array'
    AND jsonb_array_length(level_descriptors) = 4
    AND NOT jsonb_path_exists(level_descriptors, '$[*] ? (@.type() != "string")')
  )
);
ALTER TABLE competency_criteria DROP CONSTRAINT IF EXISTS competency_criteria_group_name_check;
ALTER TABLE competency_criteria ADD CONSTRAINT competency_criteria_group_name_check CHECK (coalesce(length(group_name), 0) <= 60);

COMMENT ON COLUMN competency_criteria.level_descriptors IS
  'Mô tả hành vi quan sát được cho 4 mức (Đang làm quen / Cần hỗ trợ / Đạt / Vượt mong đợi). NULL = dùng mô tả mặc định theo tên tiêu chí. Chụp vào phiếu buổi lúc phát hành.';

-- ------------------------------------------------------------------
-- 2. Tiêu chí trọng tâm của bài học (không bắt buộc)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_focus_criteria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES competency_criteria(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_focus_criteria_uq ON lesson_focus_criteria (lesson_id, criterion_id);
CREATE INDEX IF NOT EXISTS lesson_focus_criteria_criterion_idx ON lesson_focus_criteria (criterion_id);

-- Tiêu chí trọng tâm phải thuộc đúng khoá của giáo trình chứa bài (chặn gắn chéo khoá / chéo trung tâm)
CREATE OR REPLACE FUNCTION lesson_focus_criteria_same_course() RETURNS trigger AS $$
DECLARE lesson_course uuid; crit_course uuid;
BEGIN
  SELECT cu.course_id INTO lesson_course FROM lessons l JOIN curricula cu ON cu.id = l.curriculum_id WHERE l.id = NEW.lesson_id;
  SELECT course_id INTO crit_course FROM competency_criteria WHERE id = NEW.criterion_id;
  IF lesson_course IS DISTINCT FROM crit_course THEN
    RAISE EXCEPTION 'Tiêu chí trọng tâm phải thuộc khoá học của bài';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lesson_focus_criteria_same_course ON lesson_focus_criteria;
CREATE TRIGGER lesson_focus_criteria_same_course BEFORE INSERT OR UPDATE ON lesson_focus_criteria
  FOR EACH ROW EXECUTE FUNCTION lesson_focus_criteria_same_course();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'satarobo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_focus_criteria TO satarobo_app;
  END IF;
END $$;

COMMENT ON TABLE lesson_focus_criteria IS
  'Tiêu chí trọng tâm của bài học: đánh dấu và xếp lên đầu phiếu nhận xét buổi. Bài không khai thì phiếu dùng toàn bộ tiêu chí của khoá.';

-- ------------------------------------------------------------------
-- 3. Kết quả mục tiêu bài theo cấu hình chuẩn
--    Trước: CSDL bắt buộc objective_result khi phát hành. Nay "Phiếu phải có kết quả mục tiêu bài"
--    là cấu hình vận hành (requireObjectiveResult, mặc định BẬT — dịch vụ vẫn chặn như cũ);
--    cơ sở tắt cấu hình thì phiếu phát hành được khi bài không có mục tiêu đánh giá.
-- ------------------------------------------------------------------
ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_published_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_published_check CHECK (
  status <> 'published' OR (published_at IS NOT NULL AND revision >= 1)
);

-- ------------------------------------------------------------------
-- 4. Chỉ mục cho màn "Quản lý hồ sơ học tập" (tổng hợp theo GV / lớp / khoảng ngày)
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS attendance_session_status_idx ON attendance (session_id, status);
CREATE INDEX IF NOT EXISTS session_evaluations_teacher_idx ON session_evaluations (teacher_id, status);
