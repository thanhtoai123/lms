-- Đợt 2 (tài chính hằng ngày): chạy SAU drizzle push, idempotent.

-- 1) Dòng đơn: hình thức lớp hợp lệ, giảm không vượt thành tiền, net = thành tiền − giảm
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_class_format_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_class_format_check CHECK (class_format IN ('group','coach_1_1','coach_1_2','coach_1_4'));
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_discount_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_discount_check CHECK (discount_amount >= 0 AND discount_amount <= amount AND net_amount = amount - discount_amount);
-- Dữ liệu cũ: net = thành tiền
UPDATE order_items SET net_amount = amount WHERE net_amount = 0 AND amount <> 0;

-- 2) Khoản giảm theo dòng: lý do bắt buộc, % trong 1..100
ALTER TABLE order_item_discounts DROP CONSTRAINT IF EXISTS order_item_discounts_check;
ALTER TABLE order_item_discounts ADD CONSTRAINT order_item_discounts_check
  CHECK (length(btrim(reason)) >= 3 AND amount > 0 AND (kind <> 'percent' OR (value BETWEEN 1 AND 100)));

-- 3) Kế hoạch thanh toán: cọc tối đa 1 mỗi đơn, số tiền > 0, unique theo đợt còn hiệu lực
ALTER TABLE order_installments DROP CONSTRAINT IF EXISTS order_installments_amount_check;
ALTER TABLE order_installments ADD CONSTRAINT order_installments_amount_check CHECK (amount > 0);
CREATE UNIQUE INDEX IF NOT EXISTS order_installments_one_deposit ON order_installments (order_id) WHERE kind = 'deposit' AND cancelled_at IS NULL;

-- 4) Khoản thu: điều chỉnh phải có lý do, khoản huỷ phải có lý do gỡ
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_void_check;
ALTER TABLE payments ADD CONSTRAINT payments_void_check CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL));
ALTER TABLE payment_adjustments DROP CONSTRAINT IF EXISTS payment_adjustments_check;
ALTER TABLE payment_adjustments ADD CONSTRAINT payment_adjustments_check CHECK (length(btrim(reason)) >= 5 AND before_amount <> after_amount);

-- 5) Biến động số dư: chuyển quan hệ 1-1 cũ sang bảng phân bổ, tiền thừa không âm
INSERT INTO bank_tx_allocations (bank_tx_id, payment_id, amount, created_at)
SELECT bt.id, bt.payment_id, bt.amount, bt.received_at
  FROM bank_transactions bt
 WHERE bt.payment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM bank_tx_allocations a WHERE a.bank_tx_id = bt.id AND a.payment_id = bt.payment_id);
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_tx_surplus_check;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_surplus_check CHECK (surplus_amount >= 0 AND surplus_amount <= amount);
ALTER TABLE bank_tx_allocations DROP CONSTRAINT IF EXISTS bank_tx_allocations_amount_check;
ALTER TABLE bank_tx_allocations ADD CONSTRAINT bank_tx_allocations_amount_check CHECK (amount > 0);

-- 6) Khoản thu gắn ghi danh / dòng đơn phải thuộc đúng đơn
CREATE OR REPLACE FUNCTION payments_check_item() RETURNS trigger AS $$
BEGIN
  IF NEW.order_item_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = NEW.order_item_id AND oi.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'Khoản thu gắn dòng đơn không thuộc đơn %', NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_item_belongs ON payments;
CREATE TRIGGER payments_item_belongs BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_check_item();

-- 7) Dữ liệu cũ: đơn một ghi danh → gắn ghi danh / học viên xuống dòng đơn (công nợ theo con)
UPDATE order_items oi
   SET enrollment_id = o.enrollment_id, student_id = COALESCE(oi.student_id, o.student_id)
  FROM orders o
 WHERE oi.order_id = o.id AND oi.enrollment_id IS NULL AND o.enrollment_id IS NOT NULL;
