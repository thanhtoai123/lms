-- Đợt 6: Nguồn & theo dõi của lead, lead dùng chung, con của lead, Đánh giá & Khảo sát v2.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM cột / bảng — không sửa, không xoá.

-- 1) Lead: khối "Nguồn & theo dõi" (chỉ ghi khi lead vào từ form công khai)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_agent text;

-- 2) Lead dùng chung: mọi CSKH cùng cơ sở thấy được lead đã bật dùng chung
ALTER TABLE leads ADD COLUMN IF NOT EXISTS shared_with_center boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_shared_idx ON leads (shared_with_center, center_id);

-- 3) Con của lead: giới tính, ngày sinh, cơ sở bé muốn học
ALTER TABLE lead_children ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE lead_children ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE lead_children ADD COLUMN IF NOT EXISTS interested_center_id uuid REFERENCES centers(id);
ALTER TABLE lead_children DROP CONSTRAINT IF EXISTS lead_children_gender_check;
ALTER TABLE lead_children ADD CONSTRAINT lead_children_gender_check CHECK (gender IS NULL OR gender IN ('male','female','other'));

-- 4) Đánh giá & Khảo sát v2 — enum
DO $$ BEGIN CREATE TYPE eval_form_type AS ENUM ('teacher_eval','center_survey','session_eval'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE eval_question_type AS ENUM ('rating','radio','checkbox','text','image'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE eval_round_status AS ENUM ('draft','open','closed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Ràng buộc nghiệp vụ của phiếu đánh giá (song song với kiểm tra thuần ở packages/core)
--    · RADIO/CHECKBOX cần tối thiểu 2 lựa chọn
--    · loại câu khác không có lựa chọn dựng sẵn
--    · câu "Tải ảnh" chỉ dùng cho phiếu Đánh giá buổi học (SESSION_EVAL)
ALTER TABLE eval_questions DROP CONSTRAINT IF EXISTS eval_questions_options_check;
ALTER TABLE eval_questions ADD CONSTRAINT eval_questions_options_check CHECK (
  length(btrim(label)) > 0
  AND (
    (type IN ('radio','checkbox') AND options IS NOT NULL AND jsonb_array_length(options) >= 2)
    OR (type NOT IN ('radio','checkbox') AND (options IS NULL OR jsonb_array_length(options) = 0))
  )
);
-- (Postgres không cho CHECK có truy vấn con, nên luật "Tải ảnh chỉ dùng cho SESSION_EVAL"
--  được canh bằng trigger dưới đây + kiểm tra thuần ở packages/core.)
CREATE OR REPLACE FUNCTION eval_questions_image_only_session() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'image' AND NOT EXISTS (SELECT 1 FROM eval_forms f WHERE f.id = NEW.form_id AND f.type = 'session_eval') THEN
    RAISE EXCEPTION 'Câu hỏi ''Tải ảnh'' chỉ dùng cho phiếu Đánh giá buổi học (SESSION_EVAL)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS eval_questions_image_only_session_trg ON eval_questions;
CREATE TRIGGER eval_questions_image_only_session_trg BEFORE INSERT OR UPDATE ON eval_questions
  FOR EACH ROW EXECUTE FUNCTION eval_questions_image_only_session();

-- 6) Đợt khảo sát: ngày kết thúc từ ngày bắt đầu trở đi
ALTER TABLE eval_rounds DROP CONSTRAINT IF EXISTS eval_rounds_dates_check;
ALTER TABLE eval_rounds ADD CONSTRAINT eval_rounds_dates_check CHECK (end_date >= start_date);

-- 7) Trả lời: chấm sao trong 1..5, mỗi câu trả lời một lần trong một lượt
ALTER TABLE eval_answers DROP CONSTRAINT IF EXISTS eval_answers_rating_check;
ALTER TABLE eval_answers ADD CONSTRAINT eval_answers_rating_check CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS eval_answers_unique ON eval_answers (response_id, question_id);
