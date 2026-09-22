-- Đợt 10 (học vụ): HỒ SƠ HỌC TẬP — phiếu nhận xét từng buổi, học bạ mốc tự tổng hợp, chia sẻ hồ sơ, PDF lưu trữ.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM bảng / cột / ràng buộc / chỉ mục / trigger — không đụng dữ liệu cũ.
--
-- Bảng do drizzle push tạo (packages/db/src/schema/portfolio.ts). Các khối CREATE TABLE dưới đây chỉ là
-- lưới an toàn cho môi trường chưa push kịp; đã có bảng thì bỏ qua. Xem docs/HO-SO-HOC-TAP.md.

-- ------------------------------------------------------------------
-- 1. Phiếu nhận xét buổi học
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_evaluations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  center_id        uuid NOT NULL REFERENCES centers(id),
  session_id       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  enrollment_id    uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id         uuid NOT NULL REFERENCES classes(id),
  course_id        uuid NOT NULL REFERENCES courses(id),
  lesson_id        uuid REFERENCES lessons(id) ON DELETE SET NULL,
  teacher_id       uuid REFERENCES teachers(id),
  status           text NOT NULL DEFAULT 'draft',
  revision         integer NOT NULL DEFAULT 0,
  snapshot         jsonb NOT NULL,
  objective_result text,
  highlights       text[] NOT NULL DEFAULT '{}',
  product_note     text,
  remark           text,
  media_ids        uuid[] NOT NULL DEFAULT '{}',
  published_at     timestamptz,
  published_by     uuid REFERENCES users(id),
  amended_at       timestamptz,
  amended_by       uuid REFERENCES users(id),
  amend_reason     text,
  created_by       uuid REFERENCES users(id),
  updated_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS session_evaluations_session_enrollment_uq ON session_evaluations (session_id, enrollment_id);
CREATE INDEX IF NOT EXISTS session_evaluations_student_idx ON session_evaluations (student_id, status);
CREATE INDEX IF NOT EXISTS session_evaluations_enrollment_idx ON session_evaluations (enrollment_id, status);
CREATE INDEX IF NOT EXISTS session_evaluations_center_status_idx ON session_evaluations (center_id, status);
-- Nhóm "Buổi chưa có phiếu nhận xét học viên" ở Việc hôm nay dò theo (buổi, trạng thái)
CREATE INDEX IF NOT EXISTS session_evaluations_session_status_idx ON session_evaluations (session_id, status);

-- Ràng buộc nghiệp vụ (bản sao phòng thủ của packages/core/src/portfolio/rubric.ts)
ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_status_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_status_check CHECK (status IN ('draft', 'published'));

ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_objective_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_objective_check CHECK (objective_result IS NULL OR objective_result IN ('achieved', 'partial', 'not_yet'));

-- Đã phát hành: phải có mốc, người phát hành, kết quả mục tiêu bài và revision >= 1
ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_published_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_published_check CHECK (
  status <> 'published' OR (published_at IS NOT NULL AND objective_result IS NOT NULL AND revision >= 1)
);

-- Sửa sau phát hành phải có lý do
ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_amend_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_amend_check CHECK (
  amended_at IS NULL OR length(trim(coalesce(amend_reason, ''))) >= 5
);

ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_revision_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_revision_check CHECK (revision >= 0);

ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_text_len_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_text_len_check CHECK (
  coalesce(length(product_note), 0) <= 1000 AND coalesce(length(remark), 0) <= 1000 AND coalesce(cardinality(highlights), 0) <= 6
);

ALTER TABLE session_evaluations DROP CONSTRAINT IF EXISTS session_evaluations_snapshot_check;
ALTER TABLE session_evaluations ADD CONSTRAINT session_evaluations_snapshot_check CHECK (
  jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(snapshot -> 'criteria') = 'array'
);

-- Phiếu đã phát hành là BẤT BIẾN: chỉ đổi được khi có ghi nhận sửa (amended_at mới + lý do + revision tăng).
-- Riêng media_ids (ảnh minh chứng) được gắn thêm sau khi ảnh lớp được duyệt — không đổi nội dung đánh giá.
-- Lớp chặn cuối ở CSDL — dịch vụ đã kiểm tra trước; seed / sửa tay vẫn phải đi qua đúng điều kiện này.
CREATE OR REPLACE FUNCTION session_evaluations_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.status <> 'published' THEN
      RAISE EXCEPTION 'Phiếu nhận xét đã phát hành không trở về bản nháp được';
    END IF;
    IF (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.objective_result IS DISTINCT FROM OLD.objective_result
        OR NEW.highlights IS DISTINCT FROM OLD.highlights OR NEW.product_note IS DISTINCT FROM OLD.product_note
        OR NEW.remark IS DISTINCT FROM OLD.remark)
       AND (NEW.revision <= OLD.revision OR NEW.amended_at IS NOT DISTINCT FROM OLD.amended_at) THEN
      RAISE EXCEPTION 'Phiếu nhận xét đã phát hành là bất biến — sửa phải ghi lý do (tăng số lần sửa)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS session_evaluations_immutable ON session_evaluations;
CREATE TRIGGER session_evaluations_immutable BEFORE UPDATE ON session_evaluations FOR EACH ROW EXECUTE FUNCTION session_evaluations_immutable();

-- ------------------------------------------------------------------
-- 2. Link chia sẻ hồ sơ học tập
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  center_id       uuid REFERENCES centers(id),
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token           text NOT NULL,
  scope           text NOT NULL DEFAULT 'all',
  enrollment_id   uuid REFERENCES enrollments(id) ON DELETE CASCADE,
  from_date       date,
  to_date         date,
  label           text,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES users(id),
  revoke_reason   text,
  view_count      integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_shares_token_uq ON portfolio_shares (token);
CREATE INDEX IF NOT EXISTS portfolio_shares_student_idx ON portfolio_shares (student_id, created_at);

ALTER TABLE portfolio_shares DROP CONSTRAINT IF EXISTS portfolio_shares_scope_check;
ALTER TABLE portfolio_shares ADD CONSTRAINT portfolio_shares_scope_check CHECK (
  (scope = 'all')
  OR (scope = 'course' AND enrollment_id IS NOT NULL)
  OR (scope = 'range' AND from_date IS NOT NULL AND to_date IS NOT NULL AND from_date <= to_date)
);
-- Token đủ dài để không dò được (32 byte ngẫu nhiên base64url = 43 ký tự; token mẫu dễ nhớ ≥ 32)
ALTER TABLE portfolio_shares DROP CONSTRAINT IF EXISTS portfolio_shares_token_check;
ALTER TABLE portfolio_shares ADD CONSTRAINT portfolio_shares_token_check CHECK (token ~ '^[A-Za-z0-9_-]{32,80}$');
ALTER TABLE portfolio_shares DROP CONSTRAINT IF EXISTS portfolio_shares_revoked_check;
ALTER TABLE portfolio_shares ADD CONSTRAINT portfolio_shares_revoked_check CHECK (
  revoked_at IS NULL OR length(trim(coalesce(revoke_reason, ''))) >= 3
);
ALTER TABLE portfolio_shares DROP CONSTRAINT IF EXISTS portfolio_shares_view_count_check;
ALTER TABLE portfolio_shares ADD CONSTRAINT portfolio_shares_view_count_check CHECK (view_count >= 0);
ALTER TABLE portfolio_shares DROP CONSTRAINT IF EXISTS portfolio_shares_label_check;
ALTER TABLE portfolio_shares ADD CONSTRAINT portfolio_shares_label_check CHECK (coalesce(length(label), 0) <= 120);

-- ------------------------------------------------------------------
-- 3. Bản PDF lưu trữ (xuất phía máy chủ, tuỳ chọn)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  center_id     uuid REFERENCES centers(id),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_key      text NOT NULL,
  size_bytes    integer NOT NULL,
  scope         text NOT NULL DEFAULT 'all',
  enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  from_date     date,
  to_date       date,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_exports_student_idx ON portfolio_exports (student_id, created_at);
ALTER TABLE portfolio_exports DROP CONSTRAINT IF EXISTS portfolio_exports_file_check;
ALTER TABLE portfolio_exports ADD CONSTRAINT portfolio_exports_file_check CHECK (file_key ~ '^portfolio/[A-Za-z0-9/_.-]+\.pdf$' AND size_bytes > 0);

-- ------------------------------------------------------------------
-- 4. Học bạ mốc: thang điểm + bản chụp số liệu tổng hợp từ phiếu buổi
-- ------------------------------------------------------------------
ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS rubric_scale smallint NOT NULL DEFAULT 5;
ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS aggregate jsonb;
ALTER TABLE report_cards DROP CONSTRAINT IF EXISTS report_cards_rubric_scale_check;
ALTER TABLE report_cards ADD CONSTRAINT report_cards_rubric_scale_check CHECK (rubric_scale IN (4, 5));

-- ------------------------------------------------------------------
-- 5. Cách ly trung tâm: tự điền tenant_id theo cơ sở (như 0005), chỉ mục tenant,
--    chặn ghi chéo cơ sở / tenant, chính sách RLS (như 0009, chưa tự bật).
-- ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['session_evaluations', 'portfolio_shares', 'portfolio_exports'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'fill_tenant_id_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_tenant_id()', 'fill_tenant_id_' || t, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'assert_center_tenant_' || t, t);
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_center_tenant()', 'assert_center_tenant_' || t, t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_tenant_visible') THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id))', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'satarobo_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO satarobo_app', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 6. Mốc bật tính năng: nhóm "Buổi chưa có phiếu nhận xét học viên" ở Việc hôm nay chỉ tính buổi
--    từ ngày này — buổi cũ trước khi có phiếu buổi không bị nhắc hàng loạt. Đã có thì giữ nguyên.
-- ------------------------------------------------------------------
INSERT INTO app_settings (key, value, updated_at)
VALUES ('ho_so_hoc_tap', jsonb_build_object('since', to_char(current_date, 'YYYY-MM-DD')), now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE session_evaluations IS
  'Phiếu nhận xét buổi học (hồ sơ học tập): một phiếu / học viên có mặt / buổi. snapshot = bản chụp tiêu chí + mô tả mức + điểm + bối cảnh buổi lúc phát hành. Đã phát hành là bất biến; sửa phải có lý do, revision tăng.';
COMMENT ON TABLE portfolio_shares IS
  'Link chia sẻ hồ sơ học tập /hs/<token>. Không bao giờ trả SĐT / email / địa chỉ phụ huynh, ghi chú nội bộ, lý do vắng.';
COMMENT ON COLUMN report_cards.rubric_scale IS
  '5 = học bạ cũ chấm tay 1–5; 4 = học bạ mốc tổng hợp từ phiếu buổi (rubric 4 mức).';
