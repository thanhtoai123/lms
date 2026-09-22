-- Đợt 9 (tuyển sinh): PHIẾU ĐÁNH GIÁ BUỔI HỌC THỬ gửi phụ huynh qua link riêng.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM bảng / ràng buộc / chỉ mục / trigger — không đụng dữ liệu cũ.
--
-- Bảng do drizzle push tạo (packages/db/src/schema/admissions.ts, bảng trial_reports). Khối CREATE TABLE
-- dưới đây chỉ là lưới an toàn cho môi trường chưa push kịp; đã có bảng thì bỏ qua.
-- Xem docs/PHIEU-DANH-GIA-HOC-THU.md.

CREATE TABLE IF NOT EXISTS trial_reports (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  center_id                 uuid NOT NULL REFERENCES centers(id),
  lead_id                   uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  child_id                  uuid REFERENCES lead_children(id) ON DELETE SET NULL,
  trial_booking_id          uuid REFERENCES trial_bookings(id) ON DELETE SET NULL,
  trial_class_enrollment_id uuid REFERENCES trial_class_enrollments(id) ON DELETE SET NULL,
  course_id                 uuid REFERENCES courses(id),
  teacher_id                uuid REFERENCES teachers(id),
  code                      text NOT NULL UNIQUE,
  status                    text NOT NULL DEFAULT 'draft',
  child_name                text NOT NULL,
  session_at                timestamptz,
  answers                   jsonb NOT NULL,
  strengths                 text,
  growth                    text,
  product_note              text,
  readiness                 text,
  recommended_course_id     uuid REFERENCES courses(id),
  recommended_level         text,
  recommendation_note       text,
  pathway                   boolean NOT NULL DEFAULT false,
  competition_potential     boolean NOT NULL DEFAULT false,
  share_token               text,
  share_expires_at          timestamptz,
  published_at              timestamptz,
  published_by              uuid REFERENCES users(id),
  revoked_at                timestamptz,
  revoked_by                uuid REFERENCES users(id),
  revoke_reason             text,
  view_count                integer NOT NULL DEFAULT 0,
  first_viewed_at           timestamptz,
  last_viewed_at            timestamptz,
  parent_response           text,
  parent_responded_at       timestamptz,
  created_by                uuid REFERENCES users(id),
  updated_by                uuid REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_reports_lead_idx ON trial_reports (lead_id);
CREATE INDEX IF NOT EXISTS trial_reports_center_status_idx ON trial_reports (center_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS trial_reports_share_token_uq ON trial_reports (share_token);
CREATE INDEX IF NOT EXISTS trial_reports_booking_idx ON trial_reports (trial_booking_id);
CREATE INDEX IF NOT EXISTS trial_reports_enrollment_idx ON trial_reports (trial_class_enrollment_id);
-- Nhóm "Phiếu đánh giá chưa gửi" ở Việc hôm nay dò theo nguồn + trạng thái
CREATE INDEX IF NOT EXISTS trial_reports_booking_status_idx ON trial_reports (trial_booking_id, status) WHERE trial_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trial_reports_enrollment_status_idx ON trial_reports (trial_class_enrollment_id, status) WHERE trial_class_enrollment_id IS NOT NULL;

-- ------------------------------------------------------------------
-- Ràng buộc nghiệp vụ (bản sao phòng thủ của packages/core/src/admissions/trialReport.ts)
-- ------------------------------------------------------------------
ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_status_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_status_check CHECK (status IN ('draft', 'published', 'revoked'));

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_readiness_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_readiness_check CHECK (readiness IS NULL OR readiness IN ('ready', 'one_more_trial', 'not_yet'));

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_parent_response_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_parent_response_check CHECK (
  (parent_response IS NULL AND parent_responded_at IS NULL)
  OR (parent_response = 'consult_requested' AND parent_responded_at IS NOT NULL)
);

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_code_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_code_check CHECK (code ~ '^PDG-[A-Z0-9_]+-[0-9]{2}-[0-9]{6,9}$');

-- Token đủ dài để không dò được (32 byte ngẫu nhiên base64url = 43 ký tự; token mẫu dễ nhớ ≥ 32)
ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_share_token_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_share_token_check CHECK (share_token IS NULL OR share_token ~ '^[A-Za-z0-9_-]{32,80}$');

-- Đã phát hành thì phải có token, hạn link và mốc phát hành
ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_published_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_published_check CHECK (
  status <> 'published' OR (share_token IS NOT NULL AND share_expires_at IS NOT NULL AND published_at IS NOT NULL)
);

-- Thu hồi phải có mốc và lý do
ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_revoked_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_revoked_check CHECK (
  status <> 'revoked' OR (revoked_at IS NOT NULL AND length(trim(coalesce(revoke_reason, ''))) >= 3)
);

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_view_count_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_view_count_check CHECK (view_count >= 0);

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_text_len_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_text_len_check CHECK (
  coalesce(length(strengths), 0) <= 1000 AND coalesce(length(growth), 0) <= 1000 AND coalesce(length(product_note), 0) <= 1000
  AND coalesce(length(recommendation_note), 0) <= 300 AND coalesce(length(recommended_level), 0) <= 60
);

ALTER TABLE trial_reports DROP CONSTRAINT IF EXISTS trial_reports_answers_check;
ALTER TABLE trial_reports ADD CONSTRAINT trial_reports_answers_check CHECK (jsonb_typeof(answers) = 'object' AND jsonb_typeof(answers -> 'groups') = 'array');

-- ------------------------------------------------------------------
-- Cách ly trung tâm: tự điền tenant_id theo cơ sở (như 0005), chỉ mục tenant,
-- chặn ghi chéo cơ sở / tenant, chính sách RLS (như 0009, chưa tự bật).
-- ------------------------------------------------------------------
DROP TRIGGER IF EXISTS fill_tenant_id_trial_reports ON trial_reports;
CREATE TRIGGER fill_tenant_id_trial_reports BEFORE INSERT ON trial_reports FOR EACH ROW EXECUTE FUNCTION fill_tenant_id();

CREATE INDEX IF NOT EXISTS trial_reports_tenant_idx ON trial_reports (tenant_id);

DROP TRIGGER IF EXISTS assert_center_tenant_trial_reports ON trial_reports;
CREATE CONSTRAINT TRIGGER assert_center_tenant_trial_reports AFTER INSERT OR UPDATE ON trial_reports
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_center_tenant();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_tenant_visible') THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON trial_reports';
    EXECUTE 'CREATE POLICY tenant_isolation ON trial_reports FOR ALL TO PUBLIC USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'satarobo_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON trial_reports TO satarobo_app';
  END IF;
END $$;

COMMENT ON TABLE trial_reports IS
  'Phiếu đánh giá buổi học thử gửi phụ huynh qua link /pdg/<share_token>. answers = bản chụp mẫu tiêu chí + giá trị (đổi mẫu không đổi phiếu cũ).';
COMMENT ON COLUMN trial_reports.share_token IS
  'Token ngẫu nhiên ≥ 32 byte (base64url) — ai có link là xem được phiếu. Thu hồi / hết hạn thì link ngừng hiệu lực.';
