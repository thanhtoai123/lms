-- Số điện thoại phụ huynh: chuẩn hoá và làm cho DUY NHẤT.
--
-- Vì sao cần: cổng phụ huynh tìm tài khoản bằng số điện thoại và từ chối khi thấy nhiều hơn
-- một dòng (`parentPortal.findParentByPhone`). Trùng số không gây lỗi ồn ào — nó lặng lẽ khiến
-- phụ huynh đó KHÔNG đăng nhập được và KHÔNG nhận được thông báo. Dữ liệu hệ cũ gần như chắc
-- chắn có trùng (bố và mẹ khai cùng số, hoặc nhập hai lần).
--
-- Chuẩn hoá vì `0911000001` và `84911000001` là cùng một người nhưng khác chuỗi. So theo 9 số
-- cuối là cách duy nhất bắt được cả hai cách viết.
--
-- Chạy lại nhiều lần vẫn an toàn.

-- 1. Cột số đã chuẩn hoá, giống cách `leads.phone_normalized` đang làm.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS phone_normalized text;

-- 2. Hàm chuẩn hoá dùng chung cho cả điền sẵn lẫn trigger. Bỏ mọi ký tự không phải số rồi
--    lấy 9 số cuối, thêm tiền tố 84 — trùng với `normalizeVnPhone` ở `@satarobo/core`.
CREATE OR REPLACE FUNCTION satarobo_chuan_hoa_sdt(p text) RETURNS text AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN length(regexp_replace(p, '\D', '', 'g')) < 9 THEN NULL
    ELSE '84' || right(regexp_replace(p, '\D', '', 'g'), 9)
  END;
$$ LANGUAGE sql IMMUTABLE;

-- 3. Điền cho dữ liệu đã có.
UPDATE parents SET phone_normalized = satarobo_chuan_hoa_sdt(phone)
WHERE phone_normalized IS DISTINCT FROM satarobo_chuan_hoa_sdt(phone);

-- 4. Giữ cột đồng bộ kể cả khi có nơi ghi thẳng vào CSDL (nhập dữ liệu cũ, sửa tay).
CREATE OR REPLACE FUNCTION satarobo_dong_bo_sdt_phu_huynh() RETURNS trigger AS $$
BEGIN
  NEW.phone_normalized := satarobo_chuan_hoa_sdt(NEW.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS parents_sdt_chuan_hoa ON parents;
CREATE TRIGGER parents_sdt_chuan_hoa
  BEFORE INSERT OR UPDATE OF phone ON parents
  FOR EACH ROW EXECUTE FUNCTION satarobo_dong_bo_sdt_phu_huynh();

-- 5. Chỉ mục tra cứu — có ngay, không phụ thuộc việc dọn trùng.
CREATE INDEX IF NOT EXISTS parents_phone_idx ON parents (phone_normalized);

-- 6. Chỉ mục DUY NHẤT. Chỉ áp cho dòng còn sống (chưa xoá mềm, chưa ẩn danh) và theo từng
--    trung tâm (tenant) — hai trung tâm nhượng quyền khác nhau có quyền có cùng một phụ huynh.
--
--    Nếu đang còn trùng thì DỪNG CẢ LƯỢT với thông báo rõ, thay vì tạo chỉ mục hỏng hoặc
--    bỏ qua im lặng. Dọn trùng bằng:  pnpm sdt-trung        (xem báo cáo)
--                                     pnpm sdt-trung --gop  (gộp thật)
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.parents_phone_uq') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT tenant_id, phone_normalized
    FROM parents
    WHERE deleted_at IS NULL AND anonymized_at IS NULL AND phone_normalized IS NOT NULL
    GROUP BY tenant_id, phone_normalized
    HAVING count(*) > 1
  ) t;

  IF n > 0 THEN
    RAISE EXCEPTION E'Còn % số điện thoại phụ huynh bị trùng — chưa tạo được chỉ mục duy nhất.\n'
      'Trùng số làm phụ huynh KHÔNG đăng nhập được cổng /ph. Dọn trước khi nhập dữ liệu thật:\n'
      '  pnpm sdt-trung        → xem từng nhóm trùng và dòng sẽ được giữ lại\n'
      '  pnpm sdt-trung --gop  → gộp con, đơn hàng, thông báo về dòng giữ lại rồi xoá mềm dòng còn lại', n;
  END IF;

  CREATE UNIQUE INDEX parents_phone_uq ON parents (tenant_id, phone_normalized)
    WHERE deleted_at IS NULL AND anonymized_at IS NULL AND phone_normalized IS NOT NULL;
END $$;
