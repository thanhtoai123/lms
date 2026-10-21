-- ============================================================================
-- 0020 — CHUẨN HOÁ NỘI DUNG GIẤY CHỨNG NHẬN (một lần, có kiểm soát)
-- ============================================================================
-- Giấy chứng nhận vẫn BẤT BIẾN (0012). Ngoại lệ duy nhất: bản chụp theo phiên bản nội dung chuẩn CŨ hơn
-- (khoá "std" nhỏ hơn hoặc chưa có) được nâng lên phiên bản mới — mỗi phiên bản một lần — bởi `pnpm db:seed-thsteam`
-- (packages/db/src/thsteam-certificates.ts), khi phiên đặt `satarobo.chuan_hoa_chung_nhan = 'on'`.
-- Khi nâng: số chứng nhận, tên học viên, ngày cấp, xếp loại trong bản chụp phải giữ nguyên; mọi cột khác không đổi.
-- Không hạ phiên bản, không sửa lại trong cùng phiên bản (kể cả khi bật cờ).

CREATE OR REPLACE FUNCTION certificates_immutable() RETURNS trigger AS $$
DECLARE
  nang_chuan boolean := false;
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    nang_chuan := coalesce(current_setting('satarobo.chuan_hoa_chung_nhan', true), '') = 'on'
      AND coalesce((NEW.snapshot ->> 'std')::int, 0) > coalesce((OLD.snapshot ->> 'std')::int, 0)
      AND NEW.snapshot ->> 'certificateNo' IS NOT DISTINCT FROM OLD.snapshot ->> 'certificateNo'
      AND NEW.snapshot ->> 'studentName' IS NOT DISTINCT FROM OLD.snapshot ->> 'studentName'
      AND NEW.snapshot ->> 'issuedDate' IS NOT DISTINCT FROM OLD.snapshot ->> 'issuedDate'
      AND NEW.snapshot ->> 'grade' IS NOT DISTINCT FROM OLD.snapshot ->> 'grade'
      AND NEW.snapshot ->> 'kind' IS NOT DISTINCT FROM OLD.snapshot ->> 'kind';
    IF NOT nang_chuan THEN
      RAISE EXCEPTION 'Giấy chứng nhận đã cấp là bất biến — thu hồi và cấp lại nếu cần sửa nội dung';
    END IF;
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number
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
