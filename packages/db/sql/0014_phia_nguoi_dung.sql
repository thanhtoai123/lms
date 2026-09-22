-- Đợt 14 (phía người dùng): PHẢN HỒI SAU BUỔI của phụ huynh trên cổng /ph, chỉ mục cho cổng PH và app GV.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM cột / ràng buộc / chỉ mục. Xem docs/PHIA-NGUOI-DUNG.md.

-- ------------------------------------------------------------------
-- 1. parent_feedback.reaction — cảm xúc một chạm (👍 happy / 🙂 ok / 😟 concern)
--    Vẫn ghi đủ rating 1–5 (happy 5, ok 4, concern 2) để báo cáo đánh giá cũ không đổi.
--    "concern" luôn đi kèm việc chăm sóc (care_task_id) — dịch vụ mở trong cùng transaction.
-- ------------------------------------------------------------------
ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS reaction text;

ALTER TABLE parent_feedback DROP CONSTRAINT IF EXISTS parent_feedback_reaction_check;
ALTER TABLE parent_feedback ADD CONSTRAINT parent_feedback_reaction_check CHECK (
  reaction IS NULL OR reaction IN ('happy', 'ok', 'concern')
);
-- Cảm xúc khớp điểm hài lòng (không để hai cột nói hai điều khác nhau)
ALTER TABLE parent_feedback DROP CONSTRAINT IF EXISTS parent_feedback_reaction_rating_check;
ALTER TABLE parent_feedback ADD CONSTRAINT parent_feedback_reaction_rating_check CHECK (
  reaction IS NULL
  OR (reaction = 'happy' AND rating = 5)
  OR (reaction = 'ok' AND rating BETWEEN 3 AND 4)
  OR (reaction = 'concern' AND rating <= 2)
);

COMMENT ON COLUMN parent_feedback.reaction IS
  'Cảm xúc phụ huynh thả trên phiếu buổi ở cổng /ph: happy (Rất vui) | ok (Ổn) | concern (Cần trao đổi → mở việc chăm sóc PARENT_CONCERN). Null = CSKH ghi hộ bằng sao.';

-- ------------------------------------------------------------------
-- 2. Chỉ mục
-- ------------------------------------------------------------------
-- Thẻ "Phản hồi mới của PH" trên app GV: theo giáo viên, mới nhất trước
CREATE INDEX IF NOT EXISTS parent_feedback_teacher_created_idx ON parent_feedback (teacher_id, created_at DESC);
-- Cổng PH: phản hồi của từng buổi / học viên (đã có unique (session_id, student_id)); yêu cầu theo phụ huynh
CREATE INDEX IF NOT EXISTS parent_requests_parent_idx ON parent_requests (parent_id, created_at DESC);
-- Lịch học của con: buổi học bù ở lớp khác (điểm danh 'makeup' trỏ về buổi đã vắng)
CREATE INDEX IF NOT EXISTS attendance_makeup_for_idx ON attendance (makeup_for_session_id) WHERE makeup_for_session_id IS NOT NULL;
-- Lịch sử xu của con, mới nhất trước (coin_tx_student_idx đã có (student_id, created_at))
