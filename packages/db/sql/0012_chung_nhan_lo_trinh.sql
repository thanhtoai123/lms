-- Đợt 11 (học vụ): GIẤY CHỨNG NHẬN & LỘ TRÌNH HỌC — lộ trình, mẫu chứng nhận từ ảnh Canva, chứng nhận đã cấp.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM bảng / cột / ràng buộc / chỉ mục / trigger + backfill không phá dữ liệu.
--
-- Thuật ngữ: "chứng nhận" (giấy chứng nhận hoàn thành), KHÔNG phải "chứng chỉ" (văn bằng thuộc hệ thống giáo dục quốc dân).
-- Tên cột cũ `course_completions.certificate_no` giữ nguyên. Xem docs/CHUNG-NHAN-LO-TRINH.md.
--
-- Bảng do drizzle push tạo (packages/db/src/schema/certificates.ts). Các khối CREATE TABLE dưới đây chỉ là
-- lưới an toàn cho môi trường chưa push kịp; đã có bảng thì bỏ qua.

-- ------------------------------------------------------------------
-- 1. Mẫu giấy chứng nhận
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificate_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  name           text NOT NULL,
  orientation    text NOT NULL DEFAULT 'landscape',
  background_key text,
  width_px       integer,
  height_px      integer,
  fields         jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default     boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id),
  updated_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_templates_one_default ON certificate_templates (tenant_id) WHERE is_default;

ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_orientation_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_orientation_check CHECK (orientation IN ('landscape', 'portrait'));
-- Ảnh nền: tệp tải lên PNG/JPG trong kho tệp hoặc nền dựng sẵn (SVG do máy chủ phát, không nhận SVG tải lên)
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_background_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_background_check CHECK (
  background_key IS NULL OR background_key ~ '^(certificates/[A-Za-z0-9/_.-]+\.(png|jpg)|builtin/[a-z0-9-]+\.svg)$'
);
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_size_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_size_check CHECK (
  (width_px IS NULL OR width_px BETWEEN 1 AND 20000) AND (height_px IS NULL OR height_px BETWEEN 1 AND 20000)
);
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_fields_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_fields_check CHECK (jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) <= 20);
ALTER TABLE certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_name_check;
ALTER TABLE certificate_templates ADD CONSTRAINT certificate_templates_name_check CHECK (length(trim(name)) BETWEEN 2 AND 120);

-- ------------------------------------------------------------------
-- 2. Lộ trình học
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_paths (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  code                    text NOT NULL,
  name                    text NOT NULL,
  description             text,
  criteria_text           text,
  certificate_template_id uuid REFERENCES certificate_templates(id) ON DELETE SET NULL,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES users(id),
  updated_by              uuid REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_paths_code_tenant_uq ON learning_paths (tenant_id, code);
ALTER TABLE learning_paths DROP CONSTRAINT IF EXISTS learning_paths_code_check;
ALTER TABLE learning_paths ADD CONSTRAINT learning_paths_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$');
ALTER TABLE learning_paths DROP CONSTRAINT IF EXISTS learning_paths_text_check;
ALTER TABLE learning_paths ADD CONSTRAINT learning_paths_text_check CHECK (
  length(trim(name)) BETWEEN 3 AND 160 AND coalesce(length(description), 0) <= 2000 AND coalesce(length(criteria_text), 0) <= 600
);

CREATE TABLE IF NOT EXISTS learning_path_courses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id    uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  seq        integer NOT NULL,
  required   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_courses_uq ON learning_path_courses (path_id, course_id);
CREATE INDEX IF NOT EXISTS learning_path_courses_course_idx ON learning_path_courses (course_id);
ALTER TABLE learning_path_courses DROP CONSTRAINT IF EXISTS learning_path_courses_seq_check;
ALTER TABLE learning_path_courses ADD CONSTRAINT learning_path_courses_seq_check CHECK (seq BETWEEN 1 AND 100);

-- ------------------------------------------------------------------
-- 3. Giấy chứng nhận đã cấp
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  kind                 text NOT NULL,
  learning_path_id     uuid REFERENCES learning_paths(id) ON DELETE RESTRICT,
  course_completion_id uuid REFERENCES course_completions(id) ON DELETE RESTRICT,
  student_id           uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  center_id            uuid REFERENCES centers(id),
  template_id          uuid REFERENCES certificate_templates(id) ON DELETE SET NULL,
  number               text NOT NULL,
  verify_token         text NOT NULL,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  issued_by            uuid REFERENCES users(id),
  status               text NOT NULL DEFAULT 'valid',
  revoked_at           timestamptz,
  revoked_by           uuid REFERENCES users(id),
  revoke_reason        text,
  snapshot             jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_number_uq ON certificates (number);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_verify_token_uq ON certificates (verify_token);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_path_student_valid_uq ON certificates (learning_path_id, student_id) WHERE status = 'valid' AND learning_path_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_completion_valid_uq ON certificates (course_completion_id) WHERE status = 'valid' AND course_completion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificates_student_idx ON certificates (student_id, issued_at);
CREATE INDEX IF NOT EXISTS certificates_path_idx ON certificates (learning_path_id, status);

ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_kind_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_kind_check CHECK (
  (kind = 'path' AND learning_path_id IS NOT NULL) OR (kind = 'course' AND course_completion_id IS NOT NULL)
);
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_status_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_status_check CHECK (status IN ('valid', 'revoked'));
-- Thu hồi phải có mốc + lý do; còn hiệu lực thì không có dấu thu hồi
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_revoked_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_revoked_check CHECK (
  (status = 'valid' AND revoked_at IS NULL)
  OR (status = 'revoked' AND revoked_at IS NOT NULL AND length(trim(coalesce(revoke_reason, ''))) >= 5)
);
-- Token trong QR: ≥ 24 byte ngẫu nhiên (máy chủ sinh 32 byte base64url = 43 ký tự; backfill dùng 64 ký tự hex)
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_token_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_token_check CHECK (verify_token ~ '^[A-Za-z0-9_-]{32,80}$');
-- Số mới: CN-<mã cơ sở>-<yy>-<6 số>; số cũ của hoàn thành khoá (SR-…) giữ nguyên nên chỉ chặn ký tự lạ
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_number_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_number_check CHECK (number ~ '^[A-Za-z0-9._/-]{3,60}$');
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_snapshot_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_snapshot_check CHECK (
  jsonb_typeof(snapshot) = 'object' AND snapshot ? 'studentName' AND snapshot ? 'pathName' AND snapshot ? 'issuedDate'
);

-- Nội dung đã in là BẤT BIẾN: sau khi cấp chỉ được đổi trạng thái (thu hồi) và mẫu dùng để in lại.
CREATE OR REPLACE FUNCTION certificates_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.verify_token IS DISTINCT FROM OLD.verify_token OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'Giấy chứng nhận đã cấp là bất biến — thu hồi và cấp lại nếu cần sửa nội dung';
  END IF;
  IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'Giấy chứng nhận đã thu hồi không khôi phục được — cấp chứng nhận mới';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS certificates_immutable ON certificates;
CREATE TRIGGER certificates_immutable BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION certificates_immutable();

-- ------------------------------------------------------------------
-- 4. Cách ly trung tâm: tự điền tenant_id (như 0005), chỉ mục tenant, chặn ghi chéo cơ sở / tenant,
--    chính sách RLS (như 0009, chưa tự bật). learning_path_courses đi theo lộ trình cha.
-- ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['certificate_templates', 'learning_paths', 'certificates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'fill_tenant_id_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_tenant_id()', 'fill_tenant_id_' || t, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', t || '_tenant_idx', t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_tenant_visible') THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id))', t);
    END IF;
  END LOOP;
  DROP TRIGGER IF EXISTS assert_center_tenant_certificates ON certificates;
  CREATE CONSTRAINT TRIGGER assert_center_tenant_certificates AFTER INSERT OR UPDATE ON certificates
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_center_tenant();
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'satarobo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON certificate_templates, learning_paths, learning_path_courses, certificates TO satarobo_app;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 5. Mẫu mặc định dựng sẵn cho mỗi trung tâm chưa có mẫu nào
--    (nền SVG do máy chủ phát tại /mau-chung-nhan/sata-mac-dinh.svg; fields rỗng = bố cục mặc định của core)
-- ------------------------------------------------------------------
INSERT INTO certificate_templates (tenant_id, name, orientation, background_key, width_px, height_px, fields, is_default)
SELECT t.id, 'Mẫu mặc định Sata Robo (A4 ngang)', 'landscape', 'builtin/sata-mac-dinh.svg', 3508, 2480, '[]'::jsonb, true
  FROM tenants t
 WHERE NOT EXISTS (SELECT 1 FROM certificate_templates ct WHERE ct.tenant_id = t.id);

-- ------------------------------------------------------------------
-- 6. BACKFILL: mỗi hoàn thành khoá ĐÃ DUYỆT có số → một chứng nhận kind='course' giữ nguyên số cũ,
--    kèm token xác thực mới (64 ký tự hex từ hai UUID ngẫu nhiên ≈ 244 bit) và bản chụp chữ đã in.
--    Chạy lại không nhân đôi (bỏ qua bản ghi đã có chứng nhận hoặc số đã tồn tại).
-- ------------------------------------------------------------------
INSERT INTO certificates (tenant_id, kind, course_completion_id, student_id, center_id, template_id, number, verify_token,
                          issued_at, issued_by, status, revoked_at, revoke_reason, snapshot)
SELECT ce.tenant_id, 'course', cc.id, e.student_id, cl.center_id, NULL, cc.certificate_no,
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
       coalesce(cc.issued_at, cc.decided_at, cc.updated_at), coalesce(cc.issued_by, cc.decided_by),
       CASE WHEN cc.revoked_at IS NULL THEN 'valid' ELSE 'revoked' END,
       cc.revoked_at,
       CASE WHEN cc.revoked_at IS NULL THEN NULL ELSE 'Thu hồi trước khi có sổ chứng nhận (chuyển dữ liệu)' END,
       jsonb_build_object(
         'v', 1, 'kind', 'course', 'certificateNo', cc.certificate_no,
         'studentName', s.full_name, 'studentCode', s.code,
         'pathName', co.name, 'description', NULL,
         'criteriaText', 'Hoàn thành chương trình khoá học ' || co.name || ' (' || co.total_sessions || ' buổi)',
         'courses', jsonb_build_array(jsonb_build_object('code', co.code, 'name', co.name)),
         'issuedDate', to_char(coalesce(cc.issued_at, cc.decided_at, cc.updated_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
         'grade', cc.grade,
         'centerName', ce.name, 'centerAddress', ce.address, 'centerPhone', ce.phone,
         'issuerName', 'Sata Robo', 'signerName', '', 'signerTitle', '', 'customText', ''
       )
  FROM course_completions cc
  JOIN enrollments e ON e.id = cc.enrollment_id
  JOIN students s ON s.id = e.student_id
  JOIN classes cl ON cl.id = e.class_id
  JOIN centers ce ON ce.id = cl.center_id
  JOIN courses co ON co.id = cc.course_id
 WHERE cc.status = 'approved' AND cc.certificate_no IS NOT NULL
   AND cc.certificate_no ~ '^[A-Za-z0-9._/-]{3,60}$'
   AND NOT EXISTS (SELECT 1 FROM certificates x WHERE x.course_completion_id = cc.id)
   AND NOT EXISTS (SELECT 1 FROM certificates x WHERE x.number = cc.certificate_no);

COMMENT ON TABLE certificates IS
  'Giấy chứng nhận đã cấp (lộ trình / khoá). QR trỏ /cn/<verify_token>, không trỏ số chứng nhận. snapshot = mọi chữ đã in; bất biến sau khi cấp, chỉ thu hồi (có lý do).';
COMMENT ON TABLE certificate_templates IS
  'Mẫu giấy chứng nhận: ảnh nền PNG/JPG (thiết kế trên Canva) + ô trường theo % khung (fields). Mỗi trung tâm tối đa một mẫu mặc định.';
COMMENT ON TABLE learning_paths IS
  'Lộ trình học: chuỗi khoá có thứ tự (learning_path_courses); hoàn thành mọi khoá bắt buộc → đủ điều kiện nhận chứng nhận lộ trình.';
