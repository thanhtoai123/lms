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

-- 11) Hệ thống
ALTER TABLE revenue_targets DROP CONSTRAINT IF EXISTS revenue_targets_amount_check;
ALTER TABLE revenue_targets ADD CONSTRAINT revenue_targets_amount_check CHECK (amount >= 0 AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- 12) Kho & SataCoin: sổ chỉ thêm, tồn không âm
CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% chỉ được thêm: lập phiếu / giao dịch điều chỉnh thay vì sửa, xoá', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_movements_no_update ON stock_movements;
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION append_only_guard();
DROP TRIGGER IF EXISTS coin_transactions_no_update ON coin_transactions;
CREATE TRIGGER coin_transactions_no_update BEFORE UPDATE OR DELETE ON coin_transactions FOR EACH ROW EXECUTE FUNCTION append_only_guard();
ALTER TABLE stock_levels DROP CONSTRAINT IF EXISTS stock_levels_nonneg_check;
ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_nonneg_check CHECK (on_hand >= 0 AND avg_cost >= 0);
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_qty_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_qty_check CHECK (qty <> 0 AND balance_after >= 0);
ALTER TABLE kit_components DROP CONSTRAINT IF EXISTS kit_components_check;
ALTER TABLE kit_components ADD CONSTRAINT kit_components_check CHECK (qty > 0 AND kit_id <> component_id);
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_tx_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_tx_check CHECK (amount <> 0 AND balance_after >= 0);
ALTER TABLE reward_items DROP CONSTRAINT IF EXISTS reward_items_cost_check;
ALTER TABLE reward_items ADD CONSTRAINT reward_items_cost_check CHECK (cost > 0);
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_dates_check;
ALTER TABLE rentals ADD CONSTRAINT rentals_dates_check CHECK (due_date >= start_date AND qty > 0 AND deposit >= 0 AND fee >= 0);

-- 13) Học liệu & bài tập
ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_check;
ALTER TABLE document_versions ADD CONSTRAINT document_versions_check CHECK (version >= 1 AND size_bytes > 0);
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_content_check;
ALTER TABLE documents ADD CONSTRAINT documents_content_check CHECK ((kind = 'link' AND url IS NOT NULL) OR kind <> 'link');
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_check CHECK (max_score IN (10, 100) AND coin_reward BETWEEN 0 AND 20);
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_score_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_score_check CHECK (score IS NULL OR score >= 0);
ALTER TABLE scorm_attempts DROP CONSTRAINT IF EXISTS scorm_attempts_score_check;
ALTER TABLE scorm_attempts ADD CONSTRAINT scorm_attempts_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 100));
CREATE OR REPLACE FUNCTION document_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_versions chỉ được thêm: tải phiên bản mới thay vì sửa';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS document_versions_no_update ON document_versions;
CREATE TRIGGER document_versions_no_update BEFORE UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION document_versions_immutable();

-- 14) Website, marketing, tuân thủ dữ liệu
CREATE OR REPLACE FUNCTION consent_records_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'consent_records chỉ được thêm: ghi bản ghi mới khi đồng ý / rút đồng ý';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS consent_records_no_update ON consent_records;
CREATE TRIGGER consent_records_no_update BEFORE UPDATE OR DELETE ON consent_records FOR EACH ROW EXECUTE FUNCTION consent_records_immutable();
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_check CHECK (budget >= 0 AND (end_date IS NULL OR end_date >= start_date));
ALTER TABLE campaign_spends DROP CONSTRAINT IF EXISTS campaign_spends_check;
ALTER TABLE campaign_spends ADD CONSTRAINT campaign_spends_check CHECK (amount >= 0 AND (clicks IS NULL OR clicks >= 0) AND (impressions IS NULL OR impressions >= 0));
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_publish_check;
ALTER TABLE posts ADD CONSTRAINT posts_publish_check CHECK (status <> 'scheduled' OR publish_at IS NOT NULL);
ALTER TABLE data_requests DROP CONSTRAINT IF EXISTS data_requests_check;
ALTER TABLE data_requests ADD CONSTRAINT data_requests_check CHECK (due_at >= received_at);
ALTER TABLE data_incidents DROP CONSTRAINT IF EXISTS data_incidents_check;
ALTER TABLE data_incidents ADD CONSTRAINT data_incidents_check CHECK (affected_count >= 0 AND notify_due_at >= detected_at AND (status <> 'closed' OR closed_at IS NOT NULL));

-- 15) Hoá đơn điện tử: đã phát hành thì không sửa nội dung / số; chỉ đổi trạng thái sang điều chỉnh / thay thế
ALTER TABLE einvoices DROP CONSTRAINT IF EXISTS einvoices_amount_check;
ALTER TABLE einvoices ADD CONSTRAINT einvoices_amount_check CHECK (total = subtotal + vat_amount AND (kind = 'adjustment' OR total >= 0) AND (status NOT IN ('issued','adjusted','replaced') OR (number IS NOT NULL AND issued_at IS NOT NULL)));
CREATE OR REPLACE FUNCTION einvoices_lock_issued() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('issued','adjusted','replaced') THEN
    IF NEW.lines IS DISTINCT FROM OLD.lines OR NEW.total IS DISTINCT FROM OLD.total OR NEW.number IS DISTINCT FROM OLD.number
       OR NEW.serial IS DISTINCT FROM OLD.serial OR NEW.buyer_name IS DISTINCT FROM OLD.buyer_name OR NEW.buyer_tax_code IS DISTINCT FROM OLD.buyer_tax_code
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'Hoá đơn đã phát hành không được sửa — lập hoá đơn điều chỉnh hoặc thay thế';
    END IF;
    IF NEW.status NOT IN ('issued','adjusted','replaced') THEN
      RAISE EXCEPTION 'Hoá đơn đã phát hành không được huỷ';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Không xoá hoá đơn';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS einvoices_lock ON einvoices;
CREATE TRIGGER einvoices_lock BEFORE UPDATE ON einvoices FOR EACH ROW EXECUTE FUNCTION einvoices_lock_issued();
CREATE OR REPLACE FUNCTION einvoices_no_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Không xoá hoá đơn'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS einvoices_nodel ON einvoices;
CREATE TRIGGER einvoices_nodel BEFORE DELETE ON einvoices FOR EACH ROW EXECUTE FUNCTION einvoices_no_delete();

-- 16) Tuyển sinh: sổ chia lead & lịch sử pool chỉ thêm (không sửa); lượt không âm
DROP TRIGGER IF EXISTS lead_distribution_log_no_update ON lead_distribution_log;
CREATE TRIGGER lead_distribution_log_no_update BEFORE UPDATE ON lead_distribution_log FOR EACH ROW EXECUTE FUNCTION append_only_guard();
DROP TRIGGER IF EXISTS lead_pool_events_no_update ON lead_pool_events;
CREATE TRIGGER lead_pool_events_no_update BEFORE UPDATE ON lead_pool_events FOR EACH ROW EXECUTE FUNCTION append_only_guard();
ALTER TABLE lead_assignees DROP CONSTRAINT IF EXISTS lead_assignees_rounds_check;
ALTER TABLE lead_assignees ADD CONSTRAINT lead_assignees_rounds_check CHECK (rounds_received >= 0 AND weight >= 1);
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_reentry_check;
ALTER TABLE leads ADD CONSTRAINT leads_reentry_check CHECK (reentry_count >= 0);
