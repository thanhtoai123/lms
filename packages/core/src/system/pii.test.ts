import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPhoneValue, maskEmailValue, maskPiiText, maskPii, hasPii, validateRevealReason } from "./pii.js";

test("che SĐT dạng 09***78", () => {
  assert.equal(maskPhoneValue("0912345678"), "09***78");
  assert.equal(maskPhoneValue("+84912345678"), "84***78");
  assert.equal(maskPhoneValue("090 123 4567"), "09***67");
  assert.equal(maskPhoneValue("123"), "***");
});

test("che email dạng a***@x.com", () => {
  assert.equal(maskEmailValue("an.nguyen@example.com"), "a***@e.com");
  assert.equal(maskEmailValue("x@y.vn"), "x***@y.vn");
  assert.equal(maskEmailValue("khong-phai-email"), "***");
});

test("che PII trong chuỗi tự do", () => {
  assert.equal(maskPiiText("Gọi 0912345678 hoặc mail an@example.com nhé"), "Gọi 09***78 hoặc mail a***@e.com nhé");
  assert.equal(maskPiiText("Không có gì nhạy cảm"), "Không có gì nhạy cảm");
});

test("maskPii đi sâu vào object / array, giữ nguyên hình dạng", () => {
  const before = {
    parentName: "Nguyễn Văn A",
    phone: "0912345678",
    email: "an.nguyen@example.com",
    amount: 4800000,
    active: true,
    children: [{ childName: "Minh An", zaloPhone: "0987654321" }],
    note: null,
  };
  const after = maskPii(before);
  assert.equal(after.phone, "09***78");
  assert.equal(after.email, "a***@e.com");
  assert.equal(after.children[0]!.zaloPhone, "09***21");
  assert.equal(after.children[0]!.childName, "Minh An");
  assert.equal(after.amount, 4800000);
  assert.equal(after.active, true);
  assert.equal(after.note, null);
  // không sửa đối tượng gốc
  assert.equal(before.phone, "0912345678");
});

test("trường giấy tờ tuỳ thân / tài khoản bị che cả giá trị", () => {
  const r = maskPii({ cccd: "040200012345", bankAccount: "0123456789", taxCode: "0401234567" });
  assert.equal(r.cccd, "0***5");
  assert.equal(r.bankAccount, "0***9");
  assert.equal(r.taxCode, "0***7");
});

test("hasPii biết khi nào cần nút Xem đầy đủ", () => {
  assert.ok(hasPii({ phone: "0912345678" }));
  assert.ok(hasPii({ note: "liên hệ an@example.com" }));
  assert.ok(!hasPii({ status: "active", sessions: 24 }));
  assert.ok(!hasPii(null));
});

test("Xem đầy đủ bắt buộc lý do", () => {
  assert.ok(validateRevealReason(""));
  assert.ok(validateRevealReason("ngắn"));
  assert.equal(validateRevealReason("Kiểm tra khiếu nại của phụ huynh CS1"), null);
  assert.ok(validateRevealReason("x".repeat(501)));
});
