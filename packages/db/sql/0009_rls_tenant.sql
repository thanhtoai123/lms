-- Đợt 7b (nhượng quyền): ROW LEVEL SECURITY — lớp phòng thủ CUỐI cho cách ly trung tâm.
--
-- Nguồn sự thật vẫn là tầng service (`tenantCond` / `assertTenant`). File này dựng thêm một
-- hàng rào ở CSDL để một truy vấn quên lọc cũng không đọc được dữ liệu của trung tâm khác.
--
-- Chạy SAU `pnpm db:push`, idempotent, và **không tự bật RLS**: chạy file này chỉ tạo
-- vai trò, hàm và chính sách. Bật / tắt bằng một lệnh (xem mục 6 ở cuối file).
-- Lý do không bật sẵn: ứng dụng phải đổi sang vai trò `satarobo_app` và đặt biến phiên
-- ở đầu mỗi giao dịch trước đã — bật trước khi làm hai việc đó là làm hỏng hệ thống đang chạy.

-- ------------------------------------------------------------------
-- 1) Hai biến phiên và cách đọc chúng
--    app.tenant_ids  = danh sách uuid, phân tách bằng dấu phẩy (ứng dụng đặt mỗi giao dịch)
--    app.bypass_rls  = 'on' cho lệnh quản trị (migrate, seed, nhân bản tenant, worker)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_tenant_ids() RETURNS uuid[] AS $$
  SELECT CASE
    WHEN coalesce(replace(current_setting('app.tenant_ids', true), ' ', ''), '') = '' THEN '{}'::uuid[]
    ELSE string_to_array(replace(current_setting('app.tenant_ids', true), ' ', ''), ',')::uuid[]
  END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean AS $$
  SELECT lower(coalesce(current_setting('app.bypass_rls', true), 'off')) IN ('on', 'true', '1', 'yes');
$$ LANGUAGE sql STABLE;

-- Luật cho MỘT dòng — bản sao thuần của luật này nằm ở packages/core/src/org/tenant.ts (có test):
--   bỏ qua RLS → cho; dòng chưa gắn tenant (dữ liệu di sản) → cho; còn lại phải nằm trong danh sách.
--   Chưa đặt biến phiên (danh sách rỗng) → CHẶN: mặc định an toàn.
CREATE OR REPLACE FUNCTION app_tenant_visible(t uuid) RETURNS boolean AS $$
  SELECT app_bypass_rls() OR t IS NULL OR t = ANY (app_tenant_ids());
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------------
-- 2) Vai trò riêng cho ứng dụng
--    KHÔNG phải chủ sở hữu bảng → RLS mới có hiệu lực với nó.
--    Chủ sở hữu bảng (vai trò chạy migrate / seed) không bị RLS chặn vì ta chỉ ENABLE, không FORCE.
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'satarobo_app') THEN
    CREATE ROLE satarobo_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO satarobo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO satarobo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO satarobo_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO satarobo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO satarobo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO satarobo_app;

-- ------------------------------------------------------------------
-- 3) Bảng nào có RLS
--    Bỏ qua `tenants`, `tenant_settings`, `users`: ba bảng này được đọc ở bước DỰNG NGỮ CẢNH
--    đăng nhập — lúc đó hệ thống còn chưa biết người dùng thuộc trung tâm nào, nên không thể
--    đặt `app.tenant_ids` trước. Ba bảng đó vẫn được lọc chặt ở tầng service.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION satarobo_rls_tables() RETURNS TABLE (table_name text) AS $$
  SELECT c.table_name::text
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema AND tb.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
     AND c.table_name NOT IN ('tenants', 'tenant_settings', 'users')
   ORDER BY 1;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------------
-- 4) Bảng mới có cột tenant_id (vd email_logs) cũng phải có trigger điền tenant + index
--    (lặp lại phần idempotent của 0005 để không phải chạy lại file cũ)
-- ------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM satarobo_rls_tables() LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fill_tenant_id_' || r.table_name) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_tenant_id()', 'fill_tenant_id_' || r.table_name, r.table_name);
      EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', r.table_name);
      EXECUTE format('UPDATE %I SET tenant_id = (SELECT id FROM tenants WHERE is_default LIMIT 1) WHERE tenant_id IS NULL', r.table_name);
      EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', r.table_name);
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', r.table_name || '_tenant_idx', r.table_name);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 5) Chính sách: một chính sách cho MỌI lệnh, áp cho mọi vai trò không phải chủ bảng
-- ------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM satarobo_rls_tables() LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id))',
      r.table_name);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 6) Bật / tắt bằng MỘT lệnh (chỉ chạy khi ứng dụng đã đổi sang vai trò satarobo_app
--    và đã đặt app.tenant_ids ở đầu mỗi giao dịch):
--      SELECT satarobo_rls_enable();     -- bật
--      SELECT satarobo_rls_disable();    -- tắt, quay lại hiện trạng
--    Trả về số bảng đã đổi.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION satarobo_rls_enable() RETURNS integer AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT table_name FROM satarobo_rls_tables() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION satarobo_rls_disable() RETURNS integer AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT table_name FROM satarobo_rls_tables() LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.table_name);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$ LANGUAGE plpgsql;

-- Xem đang bật ở những bảng nào:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (SELECT table_name FROM satarobo_rls_tables());
