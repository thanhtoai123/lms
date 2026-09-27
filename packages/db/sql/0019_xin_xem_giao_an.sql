-- Bảng yêu cầu xem giáo án ngoài ca dạy (`lesson_plan_access_requests`, schema/content.ts).
--
-- Thứ tự chạy: `db:push` tạo bảng theo schema → `apply-sql` (0009 tự gắn trigger điền tenant + chính sách
-- RLS cho mọi bảng có cột tenant_id) → file này nói rõ lại cho riêng bảng mới và sửa tenant theo CƠ SỞ
-- (0009 điền tenant mặc định). Chạy lại nhiều lần vẫn an toàn.

DO $$
BEGIN
  IF to_regclass('public.lesson_plan_access_requests') IS NULL THEN
    RAISE NOTICE 'Chưa có bảng lesson_plan_access_requests — chạy db:push trước';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fill_tenant_id_lesson_plan_access_requests') THEN
    CREATE TRIGGER fill_tenant_id_lesson_plan_access_requests BEFORE INSERT ON lesson_plan_access_requests
      FOR EACH ROW EXECUTE FUNCTION fill_tenant_id();
  END IF;
  UPDATE lesson_plan_access_requests x SET tenant_id = c.tenant_id
    FROM centers c WHERE c.id = x.center_id AND x.tenant_id IS DISTINCT FROM c.tenant_id AND c.tenant_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS lesson_plan_access_requests_tenant_idx ON lesson_plan_access_requests (tenant_id);
  -- Chỉ bật RLS khi hệ thống ĐÃ bật (theo bảng sessions) — bật / tắt chung bằng satarobo_rls_enable() (0009 mục 6)
  IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'sessions' AND relkind = 'r' LIMIT 1) THEN
    ALTER TABLE lesson_plan_access_requests ENABLE ROW LEVEL SECURITY;
  END IF;
  DROP POLICY IF EXISTS tenant_isolation ON lesson_plan_access_requests;
  CREATE POLICY tenant_isolation ON lesson_plan_access_requests FOR ALL TO PUBLIC
    USING (app_tenant_visible(tenant_id)) WITH CHECK (app_tenant_visible(tenant_id));
END $$;
