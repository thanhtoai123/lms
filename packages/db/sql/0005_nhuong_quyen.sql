-- Đợt 7 (nhượng quyền): trung tâm độc lập (tenant), cách ly dữ liệu, quyền riêng tư.
-- Chạy SAU drizzle push, idempotent. CHỈ THÊM cột / bảng / ràng buộc — không xoá dữ liệu.
--
-- Nguyên tắc: tenant mặc định `SATA` (type OWNED) nhận toàn bộ dữ liệu đang có,
-- nên hệ thống một-tenant chạy y hệt trước khi có file này.

-- ------------------------------------------------------------------
-- 1) Tenant gốc của chuỗi + cấu hình quyền riêng tư
-- ------------------------------------------------------------------
INSERT INTO tenants (code, name, type, status, is_default, note)
VALUES ('SATA', 'Sata Robo (chuỗi gốc)', 'OWNED', 'active', true, 'Tenant mặc định — mọi dữ liệu có trước khi bật nhượng quyền thuộc về đây')
ON CONFLICT (code) DO NOTHING;

-- Chỉ MỘT tenant được làm mặc định
CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_default ON tenants (is_default) WHERE is_default;

INSERT INTO tenant_settings (tenant_id, ho_sees_pii, ho_sees_finance_detail, data_retention_years, allow_cross_center_transfer)
SELECT id, true, true, 10, true FROM tenants WHERE code = 'SATA'
ON CONFLICT (tenant_id) DO NOTHING;

-- Cấu hình mặc định cho tenant chưa có dòng nào (OWNED mở hết, FRANCHISE đóng hết)
INSERT INTO tenant_settings (tenant_id, ho_sees_pii, ho_sees_finance_detail, data_retention_years, allow_cross_center_transfer)
SELECT t.id, t.type = 'OWNED', t.type = 'OWNED', CASE WHEN t.type = 'OWNED' THEN 10 ELSE 5 END, t.type = 'OWNED'
  FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id = t.id
 WHERE s.tenant_id IS NULL;

-- ------------------------------------------------------------------
-- 2) Tự điền tenant_id cho mọi đường ghi cũ
--    Ưu tiên tenant của cơ sở trên chính dòng dữ liệu; không có thì về tenant mặc định.
--    Nhờ trigger này, toàn bộ service hiện tại KHÔNG cần sửa chỗ INSERT.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fill_tenant_id() RETURNS trigger AS $$
DECLARE j jsonb; cid text; t uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN RETURN NEW; END IF;
  j := to_jsonb(NEW);
  cid := COALESCE(j->>'center_id', j->>'home_center_id', j->>'workplace_center_id');
  IF cid IS NOT NULL THEN
    SELECT c.tenant_id INTO t FROM centers c WHERE c.id = cid::uuid;
  END IF;
  IF t IS NULL THEN SELECT id INTO t FROM tenants WHERE is_default LIMIT 1; END IF;
  NEW.tenant_id := t;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('tenants', 'tenant_settings')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'fill_tenant_id_' || r.table_name, r.table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_tenant_id()', 'fill_tenant_id_' || r.table_name, r.table_name);
    -- Backfill: mọi dữ liệu đang có về tenant mặc định `SATA`
    EXECUTE format('UPDATE %I SET tenant_id = (SELECT id FROM tenants WHERE is_default LIMIT 1) WHERE tenant_id IS NULL', r.table_name);
    -- Lọc theo tenant phải rẻ: một index cho mỗi bảng
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', r.table_name || '_tenant_idx', r.table_name);
  END LOOP;
END $$;

-- Nhật ký (audit_log) không gắn cơ sở → lấy tenant theo NGƯỜI thao tác,
-- nhờ vậy nhật ký của bên nhượng quyền không lọt sang danh sách của Hội sở chuỗi.
CREATE OR REPLACE FUNCTION fill_audit_tenant_id() RETURNS trigger AS $$
DECLARE t uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.actor_id IS NOT NULL THEN SELECT u.tenant_id INTO t FROM users u WHERE u.id = NEW.actor_id; END IF;
  IF t IS NULL THEN SELECT id INTO t FROM tenants WHERE is_default LIMIT 1; END IF;
  NEW.tenant_id := t;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fill_tenant_id_audit_log ON audit_log;
CREATE TRIGGER fill_tenant_id_audit_log BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fill_audit_tenant_id();

-- Dòng dữ liệu của cơ sở phải cùng tenant với cơ sở đó (phòng thủ ở tầng CSDL)
CREATE OR REPLACE FUNCTION assert_center_tenant() RETURNS trigger AS $$
DECLARE ct uuid;
BEGIN
  IF NEW.center_id IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO ct FROM centers WHERE id = NEW.center_id;
  IF ct IS NOT NULL AND ct <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Cơ sở thuộc trung tâm khác — dữ liệu giữa các trung tâm được cách ly, không ghi chéo được';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.table_name
      FROM information_schema.columns a
      JOIN information_schema.columns b ON b.table_name = a.table_name AND b.table_schema = a.table_schema AND b.column_name = 'center_id'
      JOIN information_schema.tables tb ON tb.table_name = a.table_name AND tb.table_schema = a.table_schema AND tb.table_type = 'BASE TABLE'
     WHERE a.table_schema = 'public' AND a.column_name = 'tenant_id'
       -- chỉ các bảng "gốc" hay bị ghi chéo; không gắn đại trà để khỏi nặng khi sinh buổi học hàng loạt
       AND a.table_name IN ('leads', 'classes', 'orders', 'payments', 'staff', 'rooms', 'trial_classes', 'parent_requests')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'assert_center_tenant_' || r.table_name, r.table_name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_center_tenant()', 'assert_center_tenant_' || r.table_name, r.table_name);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 3) Danh mục dùng chung đổi sang "duy nhất TRONG một tenant"
--    (nhân bản mô hình mẫu phải chép được cùng mã sang tenant mới)
-- ------------------------------------------------------------------
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_code_unique;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS courses_code_tenant_uq ON courses (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS courses_slug_tenant_uq ON courses (tenant_id, slug);

ALTER TABLE course_packages DROP CONSTRAINT IF EXISTS course_packages_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS course_packages_code_tenant_uq ON course_packages (tenant_id, code);

ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_code_tenant_uq ON payment_methods (tenant_id, code);

ALTER TABLE notification_types DROP CONSTRAINT IF EXISTS notification_types_prefix_unique;
CREATE UNIQUE INDEX IF NOT EXISTS notification_types_prefix_tenant_uq ON notification_types (tenant_id, prefix);

ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_event_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_event_tenant_uq ON email_templates (tenant_id, event_key);

ALTER TABLE user_groups DROP CONSTRAINT IF EXISTS user_groups_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS user_groups_name_tenant_uq ON user_groups (tenant_id, name);

-- ------------------------------------------------------------------
-- 4) Ràng buộc nghiệp vụ của bảng tenant
-- ------------------------------------------------------------------
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_code_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_code_check CHECK (code ~ '^[A-Z][A-Z0-9_]{1,11}$');

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_contract_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_contract_check CHECK (contract_to IS NULL OR contract_from IS NULL OR contract_to >= contract_from);

-- Tenant mặc định phải là tenant của chuỗi
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_default_owned_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_default_owned_check CHECK (NOT is_default OR type = 'OWNED');

ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_retention_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_retention_check CHECK (data_retention_years BETWEEN 1 AND 20);

-- Không cho xoá tenant còn dữ liệu: khoá ngoại tenant_id đã dùng ON DELETE RESTRICT (drizzle),
-- ở đây chỉ chặn xoá tenant mặc định.
CREATE OR REPLACE FUNCTION protect_default_tenant() RETURNS trigger AS $$
BEGIN
  IF OLD.is_default THEN RAISE EXCEPTION 'Không xoá được tenant mặc định của chuỗi'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tenants_protect_default ON tenants;
CREATE TRIGGER tenants_protect_default BEFORE DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION protect_default_tenant();

-- ------------------------------------------------------------------
-- 5) Index phụ cho các truy vấn danh sách hay dùng nhất
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS leads_tenant_center_idx ON leads (tenant_id, center_id);
CREATE INDEX IF NOT EXISTS students_tenant_status_idx ON students (tenant_id, status);
CREATE INDEX IF NOT EXISTS classes_tenant_status_idx ON classes (tenant_id, status);
CREATE INDEX IF NOT EXISTS sessions_tenant_date_idx ON sessions (tenant_id, date);
CREATE INDEX IF NOT EXISTS payments_tenant_paid_idx ON payments (tenant_id, paid_at);
CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log (tenant_id, created_at);
