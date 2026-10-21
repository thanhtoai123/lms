-- ============================================================================
-- 0021 — TỰ XẾP LỚP KHI TIỀN VỀ
-- ============================================================================
-- Dòng đơn tạo từ lead có thể chọn sẵn lớp sẽ xếp. Khi đơn nhận khoản tiền đầu tiên (chuyển khoản tự khớp
-- hoặc kế toán xác nhận), worker tự chốt học viên + ghi danh vào lớp này (packages/api/src/services/autoEnroll.ts).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS target_class_id uuid REFERENCES classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS order_items_target_class_idx ON order_items (target_class_id) WHERE target_class_id IS NOT NULL;
