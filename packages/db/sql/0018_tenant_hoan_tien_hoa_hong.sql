-- Gắn tenant cho hai bảng tài chính còn sót: `refunds` (hoàn tiền) và `commissions` (hoa hồng).
--
-- Vì sao cần: mọi bảng tài chính khác đã có `tenant_id` từ 0005, riêng hai bảng này bị bỏ quên.
-- Hệ quả: RLS (0009) không có gì để lọc — một truy vấn quên điều kiện là đọc được hoàn tiền /
-- hoa hồng của trung tâm nhượng quyền khác.
--
-- Thứ tự chạy: `db:push` thêm cột theo schema → `apply-sql` chạy 0009 (tạo trigger điền tenant,
-- chính sách RLS cho mọi bảng có cột tenant_id — tự gồm cả hai bảng này) → file này SỬA backfill:
-- 0009 điền tenant MẶC ĐỊNH cho dòng cũ, còn đúng phải là tenant của CƠ SỞ sở hữu dòng.
-- Chạy lại nhiều lần vẫn an toàn.

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT;

DO $$
DECLARE tb text;
BEGIN
  FOREACH tb IN ARRAY ARRAY['refunds', 'commissions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fill_tenant_id_' || tb) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION fill_tenant_id()', 'fill_tenant_id_' || tb, tb);
    END IF;
    -- Tenant theo cơ sở sở hữu dòng (tắt trigger người dùng trong lúc sửa: bảng có thể "chỉ ghi thêm")
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', tb);
    EXECUTE format(
      'UPDATE %I x SET tenant_id = c.tenant_id FROM centers c WHERE c.id = x.center_id AND x.tenant_id IS DISTINCT FROM c.tenant_id AND c.tenant_id IS NOT NULL',
      tb);
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', tb);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', tb || '_tenant_idx', tb);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tb);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id))', tb);
  END LOOP;
END $$;

-- Vai trò đăng nhập của ứng dụng phải được phép `SET ROLE satarobo_app` (xem DB_RLS trong
-- .env.example). Siêu người dùng không cần; vai trò thường thì cần dòng này.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'satarobo_app', 'MEMBER') THEN
    EXECUTE format('GRANT satarobo_app TO %I', current_user);
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Không tự cấp được satarobo_app cho %: nhờ quản trị CSDL chạy GRANT satarobo_app TO %;', current_user, current_user;
END $$;
