-- Đợt 8 (hiệu năng): chỉ mục cho các cột hay xuất hiện trong WHERE / ORDER BY / JOIN
-- trên những đường nóng của hệ. Chạy SAU drizzle push, idempotent (CREATE INDEX IF NOT EXISTS).
-- Không xoá, không sửa dữ liệu, không đổi nghiệp vụ.
--
-- Quy ước đặt chỉ mục ở đây:
--  1) Chỉ mục TỔ HỢP đặt cột theo đúng thứ tự dùng: cột lọc bằng "=" trước, rồi cột lọc theo
--     khoảng, cuối cùng là cột sắp xếp. Sai thứ tự thì Postgres chỉ dùng được phần đầu.
--  2) Chỉ mục MỘT PHẦN (WHERE …) cho những bộ lọc trạng thái phổ biến — bảng lịch sử phình to
--     nhưng chỉ mục vẫn nhỏ, vì phần "đã xong" không nằm trong chỉ mục.
--  3) Mỗi chỉ mục ghi rõ nó phục vụ truy vấn nào ở `tệp:dòng`.
--
-- Đã có sẵn (KHÔNG lặp lại ở đây): leads_status_idx, leads_last_touch_idx, leads_assigned_idx,
-- sessions_date_idx, sessions_teacher_date_idx, sessions_class_seq_unique, enrollments_class_idx,
-- attendance_unique, payments_status_idx, refunds_status_idx, parent_requests_status_idx,
-- care_tasks_status_idx, report_cards_unique, staff_requests_status_idx, user_notif_user_idx.
-- Chỉ mục outbox nằm ở 0006_outbox_do_tin_cay.sql.

-- ============================================================================
-- 1) LEAD — bốn đường nóng cùng lọc "lead đang mở của cơ sở tôi, cũ nhất trước"
-- ============================================================================

-- Phục vụ:
--   packages/api/src/services/inbox.ts — leadSlaGroup (đếm + lấy 25 lead quá hạn)
--   packages/api/src/services/dashboard.ts — adminOverview, khối "Lead cần xử lý"
--   packages/api/src/services/engagement.ts — scanLeadSla (worker, mỗi 10 giây)
-- Cả ba đều: WHERE deleted_at IS NULL AND status IN (<đang mở>) AND center_id = … ORDER BY last_touch_at
-- `leads_status_idx (status, center_id)` có sẵn KHÔNG giúp sắp xếp; chỉ mục dưới đây trả về
-- đúng thứ tự cần, nên Postgres bỏ được bước sort.
CREATE INDEX IF NOT EXISTS leads_open_center_touch_idx
  ON leads (center_id, last_touch_at)
  WHERE deleted_at IS NULL
    AND status IN ('new','contacted','nurturing','trial_scheduled','trial_in_progress','trial_done','consulting','deciding');

-- Nhánh "lead của chính tôi" của cùng nhóm việc (inbox.ts — leadSlaGroup, điều kiện mineCond)
CREATE INDEX IF NOT EXISTS leads_open_assignee_touch_idx
  ON leads (assigned_to_id, last_touch_at)
  WHERE deleted_at IS NULL
    AND status IN ('new','contacted','nurturing','trial_scheduled','trial_in_progress','trial_done','consulting','deciding');

-- Màn Danh sách Lead khi xem "mọi trạng thái" sắp theo ngày nhận
-- Phục vụ: packages/api/src/services/leads.ts — leadInbox (nhánh openView = false)
CREATE INDEX IF NOT EXISTS leads_center_created_idx
  ON leads (center_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Phễu lead theo tuần + biểu đồ 14 ngày (dashboard.ts — adminOverview)
CREATE INDEX IF NOT EXISTS leads_converted_idx
  ON leads (converted_at)
  WHERE converted_at IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 2) VIỆC HẸN VỚI KHÁCH
-- ============================================================================

-- Phục vụ: packages/api/src/services/leads.ts — myLeadTasks
--   WHERE done_at IS NULL AND assignee_id = … AND due_at <= … ORDER BY due_at
-- `lead_tasks_due_idx (done_at, due_at)` có sẵn không lọc được theo người phụ trách.
CREATE INDEX IF NOT EXISTS lead_tasks_open_assignee_idx
  ON lead_tasks (assignee_id, due_at)
  WHERE done_at IS NULL;

-- Cột "việc đang mở" của từng dòng trong danh sách lead (truy vấn con tương quan)
-- Phục vụ: packages/api/src/services/leads.ts — leadInbox, cột `openTasks`
CREATE INDEX IF NOT EXISTS lead_tasks_open_lead_idx
  ON lead_tasks (lead_id)
  WHERE done_at IS NULL;

-- ============================================================================
-- 3) BUỔI HỌC — hàng đợi "chưa hoàn tất" là truy vấn nặng nhất của trang chủ
-- ============================================================================

-- Phục vụ:
--   packages/api/src/services/sessions.ts — countSessions / listSessions / overdueQueue
--   packages/api/src/services/inbox.ts — sessionGroups (2 nhóm: chưa điểm danh, chưa nhận xét)
--   packages/api/src/services/dashboard.ts — adminOverview, khối "Buổi học chưa hoàn tất"
-- Tất cả lọc theo khoảng ngày + trạng thái CHƯA xong. Buổi đã `completed` chiếm gần hết bảng
-- theo thời gian nhưng không nằm trong chỉ mục một phần này, nên nó luôn nhỏ.
CREATE INDEX IF NOT EXISTS sessions_open_date_idx
  ON sessions (date, class_id)
  WHERE status IN ('scheduled','in_progress','attendance_done','notes_done');

-- Lịch của một lớp theo khoảng ngày (sessions.ts — listSessions khi có classId;
-- classOps.ts — điều chỉnh / huỷ buổi; reportCards.ts — classReportCards)
CREATE INDEX IF NOT EXISTS sessions_class_date_idx
  ON sessions (class_id, date);

-- Lịch phòng — kiểm tra trùng phòng khi xếp lớp
-- Phục vụ: packages/api/src/services/sessions.ts — listSessions (roomId); classOps — findConflicts
CREATE INDEX IF NOT EXISTS sessions_room_date_idx
  ON sessions (room_id, date)
  WHERE room_id IS NOT NULL;

-- Buổi là mốc học bạ (nối lessons theo lesson_id)
-- Phục vụ: packages/api/src/services/reportCards.ts — dueReportCards / countDueReportCards
CREATE INDEX IF NOT EXISTS sessions_lesson_idx
  ON sessions (lesson_id)
  WHERE lesson_id IS NOT NULL;

-- ============================================================================
-- 4) GHI DANH — truy vấn con đếm sĩ số chạy cho TỪNG dòng của danh sách buổi
-- ============================================================================

-- Phục vụ: packages/api/src/services/sessions.ts — listSessions, cột `enrolled`
--   (select count(*) from enrollments e where e.class_id = … and e.status in ('active','trial')
--    and e.start_sequence_no <= …)
-- `enrollments_class_idx (class_id, status)` phải đọc thêm dòng để so `start_sequence_no`;
-- thêm cột thứ ba làm phép so nằm luôn trong chỉ mục (index-only scan).
CREATE INDEX IF NOT EXISTS enrollments_class_status_seq_idx
  ON enrollments (class_id, status, start_sequence_no);

-- Ghi danh đang học của một học viên (students.ts — listStudents cột `classes`;
-- reportCards.ts — issueCompletion kiểm tra còn lớp nào khác)
CREATE INDEX IF NOT EXISTS enrollments_student_open_idx
  ON enrollments (student_id)
  WHERE status IN ('trial','active','paused');

-- ============================================================================
-- 5) DUYỆT ẢNH LỚP
-- ============================================================================

-- Phục vụ: packages/api/src/services/media.ts — countMedia / listMedia (status = 'pending')
--          packages/api/src/services/dashboard.ts — adminOverview, khối "Ảnh chờ duyệt"
-- `session_media_status_idx (status)` không giúp sắp xếp theo ngày tải lên.
CREATE INDEX IF NOT EXISTS session_media_pending_idx
  ON session_media (created_at DESC)
  WHERE status = 'pending';

-- ============================================================================
-- 6) HỌC BẠ VÀ CHỨNG CHỈ
-- ============================================================================

-- Hàng đợi duyệt học bạ (reportCards.ts — reviewQueue: status IN ('submitted','approved')
-- ORDER BY submitted_at)
CREATE INDEX IF NOT EXISTS report_cards_review_idx
  ON report_cards (submitted_at)
  WHERE status IN ('submitted','approved');

-- Đề xuất hoàn thành khoá chờ duyệt (reportCards.ts — pendingCompletions)
CREATE INDEX IF NOT EXISTS completions_proposed_idx
  ON course_completions (proposed_at)
  WHERE status = 'proposed';

-- Bài học là mốc học bạ của một giáo trình (reportCards.ts — classMilestones)
CREATE INDEX IF NOT EXISTS lessons_milestone_idx
  ON lessons (curriculum_id, sequence_no)
  WHERE is_report_card_milestone;

-- ============================================================================
-- 7) HỌC BÙ
-- ============================================================================

-- Phục vụ: packages/api/src/services/makeup.ts — listMakeup (đếm + danh sách chờ xếp buổi)
--          packages/api/src/services/inbox.ts — makeupGroup
CREATE INDEX IF NOT EXISTS makeup_requested_idx
  ON makeup_requests (created_at DESC)
  WHERE status = 'requested';

-- Bảng `makeup_requests` trước nay KHÔNG có chỉ mục nào ngoài khoá chính, trong khi
-- `listMakeup` nối nó với ghi danh và với hai bảng buổi học (buổi vắng, buổi bù).
-- Phục vụ: packages/api/src/services/makeup.ts — listMakeup, loadRequest
CREATE INDEX IF NOT EXISTS makeup_enrollment_idx
  ON makeup_requests (enrollment_id);
CREATE INDEX IF NOT EXISTS makeup_missed_session_idx
  ON makeup_requests (missed_session_id);
CREATE INDEX IF NOT EXISTS makeup_target_session_idx
  ON makeup_requests (target_session_id)
  WHERE target_session_id IS NOT NULL;

-- Cột "đã học bù chưa" — truy vấn con tương quan chạy cho TỪNG dòng của danh sách học bù
-- Phục vụ: makeup.ts — listMakeup, cột `done`
--   exists (select 1 from attendance a where a.enrollment_id = … and a.makeup_for_session_id = …)
CREATE INDEX IF NOT EXISTS attendance_makeup_idx
  ON attendance (enrollment_id, makeup_for_session_id)
  WHERE makeup_for_session_id IS NOT NULL;

-- ============================================================================
-- 8) TÀI CHÍNH
-- ============================================================================

-- Phiếu thu chờ kế toán (finance.ts — listPayments status='recorded', financeQueues)
-- `payments_status_idx (status, center_id, recorded_at)` đã phủ; thêm bản MỘT PHẦN vì
-- phiếu `confirmed` chiếm gần hết bảng theo thời gian còn hàng đợi chờ xác nhận luôn nhỏ.
CREATE INDEX IF NOT EXISTS payments_recorded_open_idx
  ON payments (center_id, recorded_at DESC)
  WHERE status = 'recorded';

-- Hoàn tiền chờ duyệt / chờ chi (finance.ts — listRefunds, financeQueues)
CREATE INDEX IF NOT EXISTS refunds_open_idx
  ON refunds (center_id, created_at DESC)
  WHERE status IN ('pending','approved');

-- Tổng đã thu của một đơn — truy vấn con tương quan trong danh sách hoàn tiền
-- Phục vụ: finance.ts — listRefunds, cột `paid`
CREATE INDEX IF NOT EXISTS payments_order_confirmed_idx
  ON payments (order_id)
  WHERE status = 'confirmed';

-- ============================================================================
-- 9) THÔNG BÁO VÀ HÀNG ĐỢI GỬI
-- ============================================================================

-- Thông báo nội bộ chưa đọc, ưu tiên cao trước
-- Phục vụ: packages/api/src/services/engagement.ts — urgentNotifications, myNotifications
-- `user_notif_user_idx (user_id, read_at, created_at)` không có cột `priority`.
CREATE INDEX IF NOT EXISTS user_notif_unread_idx
  ON user_notifications (user_id, priority, created_at DESC)
  WHERE read_at IS NULL;

-- Chống tạo thông báo trùng (engagement.ts — executeAction, nhánh notify_user)
CREATE INDEX IF NOT EXISTS user_notif_dup_idx
  ON user_notifications (user_id, link)
  WHERE read_at IS NULL AND link IS NOT NULL;

-- Hàng đợi ZNS / SMS của worker
-- Phục vụ: packages/api/src/services/delivery.ts — dispatchParentMessages
--   WHERE status='queued' AND channel IN (…) AND (next_attempt_at IS NULL OR <= now) ORDER BY created_at
CREATE INDEX IF NOT EXISTS parent_notif_queued_idx
  ON parent_notifications (next_attempt_at, created_at)
  WHERE status = 'queued';

-- Trần "mỗi phụ huynh mỗi ngày" (delivery.ts — dispatchParentMessages, đếm tin đã gửi hôm nay)
CREATE INDEX IF NOT EXISTS parent_notif_sent_today_idx
  ON parent_notifications (parent_id, sent_at DESC)
  WHERE status = 'sent';

-- ============================================================================
-- 10) HỌC VIÊN
-- ============================================================================

-- Phục vụ: packages/api/src/services/students.ts — listStudents / exportStudents
--   WHERE deleted_at IS NULL AND home_center_id = … ORDER BY created_at DESC
-- `students_center_idx (home_center_id)` và `students_status_idx (status)` đều không giúp sắp xếp.
CREATE INDEX IF NOT EXISTS students_center_created_idx
  ON students (home_center_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Tra người giám hộ chính — truy vấn con tương quan chạy cho TỪNG học viên trong danh sách
-- Phục vụ: students.ts — listStudents / exportStudents, cột `parentName` và `parentPhone`
CREATE INDEX IF NOT EXISTS sg_student_primary_idx
  ON student_guardians (student_id, is_primary DESC);

-- ============================================================================
-- 11) ĐƠN TỪ NHÂN SỰ
-- ============================================================================

-- Phục vụ: packages/api/src/services/hrRequests.ts — listRequests (đơn chờ duyệt trước, mới nhất trước)
-- `staff_requests_status_idx (status, center_id)` không giúp sắp xếp theo ngày tạo.
CREATE INDEX IF NOT EXISTS staff_requests_pending_idx
  ON staff_requests (center_id, created_at DESC)
  WHERE status = 'pending';

-- ============================================================================
-- 12) NHẬT KÝ KIỂM TOÁN — bảng chỉ-ghi-thêm, lớn nhanh nhất hệ
-- ============================================================================

-- Xem nhật ký của một bản ghi theo thời gian (audit.ts / admin.ts — màn Nhật ký)
-- `audit_entity_idx (entity, entity_id)` không có cột thời gian nên vẫn phải sort.
CREATE INDEX IF NOT EXISTS audit_entity_created_idx
  ON audit_log (entity, entity_id, created_at DESC);
