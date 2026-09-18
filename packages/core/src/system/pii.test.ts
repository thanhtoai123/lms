import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maskPhoneValue, maskEmailValue, maskPiiText, maskPii, hasPii, validateRevealReason,
  maskPhoneKeepPrefix, maskEmailKeepDomain, maskAddressValue, maskPersonName, maskOutsideTenant,
} from "./pii.js";

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

/* ---- Che dữ liệu khi trả cho người NGOÀI tenant (nhượng quyền) ---- */

test("che SĐT giữ đầu số: 0912****78", () => {
  assert.equal(maskPhoneKeepPrefix("0912345678"), "0912****78");
  assert.equal(maskPhoneKeepPrefix("090 123 4567"), "0901****67");
  // giữ đúng độ dài số gốc: 11 chữ số → 4 đầu + 5 sao + 2 cuối
  assert.equal(maskPhoneKeepPrefix("+84912345678"), "8491*****78");
  assert.equal(maskPhoneKeepPrefix("12345"), "***");
});

test("che email giữ nhà cung cấp: a***@gmail.com", () => {
  assert.equal(maskEmailKeepDomain("an.nguyen@gmail.com"), "a***@gmail.com");
  assert.equal(maskEmailKeepDomain("x@y.vn"), "x***@y.vn");
  assert.equal(maskEmailKeepDomain("khong-phai-email"), "***");
});

test("địa chỉ chỉ còn quận / tỉnh", () => {
  assert.equal(maskAddressValue("211 Nguyễn Hữu Thọ, Hải Châu, Đà Nẵng"), "Hải Châu, Đà Nẵng");
  assert.equal(maskAddressValue("Số 5 ngõ 12"), "***");
  assert.equal(maskAddressValue("Đà Nẵng"), "Đà Nẵng");
  assert.equal(maskAddressValue(""), "***");
});

test("họ tên rút gọn giữ họ", () => {
  assert.equal(maskPersonName("Nguyễn Văn An"), "Nguyễn V. A.");
  assert.equal(maskPersonName("Trần Minh"), "Trần M.");
  assert.equal(maskPersonName("An"), "A***");
  assert.equal(maskPersonName("   "), "***");
});

test("maskOutsideTenant che cả bản ghi, giữ số liệu tổng hợp", () => {
  const before = {
    fullName: "Nguyễn Văn An",
    childName: "Nguyễn Minh Anh",
    phone: "0912345678",
    email: "an.nguyen@gmail.com",
    address: "211 Nguyễn Hữu Thọ, Hải Châu, Đà Nẵng",
    cccd: "040200012345",
    courseName: "Robotics cơ bản",
    revenue: 48000000,
    paidAt: null,
    children: [{ studentName: "Lê Thị Bình", zaloPhone: "0987654321" }],
  };
  const after = maskOutsideTenant(before);
  assert.equal(after.fullName, "Nguyễn V. A.");
  assert.equal(after.childName, "Nguyễn M. A.");
  assert.equal(after.phone, "0912****78");
  assert.equal(after.email, "a***@gmail.com");
  assert.equal(after.address, "Hải Châu, Đà Nẵng");
  assert.equal(after.cccd, "0***5");
  assert.equal(after.courseName, "Robotics cơ bản", "tên khoá học không phải PII");
  assert.equal(after.revenue, 48000000);
  assert.equal(after.paidAt, null);
  assert.equal(after.children[0]!.studentName, "Lê T. B.");
  assert.equal(after.children[0]!.zaloPhone, "0987****21");
  assert.equal(before.phone, "0912345678", "không sửa đối tượng gốc");
});

test("Xem đầy đủ bắt buộc lý do", () => {
  assert.ok(validateRevealReason(""));
  assert.ok(validateRevealReason("ngắn"));
  assert.equal(validateRevealReason("Kiểm tra khiếu nại của phụ huynh CS1"), null);
  assert.ok(validateRevealReason("x".repeat(501)));
});
