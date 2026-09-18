/**
 * Che dữ liệu cá nhân — kiểm thử theo góc nhìn bảo mật: các hình dạng dữ liệu
 * thật của hệ thống (hồ sơ trẻ em, phụ huynh, dòng xuất CSV) phải không lọt PII
 * ra nhật ký / vai trò không có quyền.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { maskPii, hasPii, maskPiiText, maskPhoneValue, maskEmailValue } from "../system/pii.js";
import { maskPhone, normalizeVnPhone } from "../admissions/leadMachine.js";
import { maskIp } from "../auth/security.js";
import { anonymizedPhone, ANON_NAME } from "../growth/rules.js";

test("che số điện thoại phụ huynh ở mọi dạng nhập", () => {
  assert.equal(maskPhoneValue("0912345678"), "09***78");
  assert.equal(maskPhoneValue("84912345678"), "84***78");
  assert.equal(maskPhoneValue("+84 912 345 678"), "84***78");
  assert.equal(maskPhoneValue("123"), "***");
  // maskPhone (dùng cho danh sách lead / học viên) giữ đầu–đuôi để đối chiếu
  assert.equal(maskPhone("84912345678"), "8491xxx5678");
  assert.ok(!maskPhone("84912345678").includes("234"), "phần giữa phải bị che");
  assert.equal(maskPhone("123"), "***");
});

test("che email", () => {
  assert.equal(maskEmailValue("an.nguyen@example.com"), "a***@e.com");
  assert.equal(maskEmailValue("khong-co-a-cong"), "***");
});

test("hồ sơ học viên trong audit bị che SĐT, email, CCCD", () => {
  const before = {
    fullName: "Nguyễn Minh An",
    dateOfBirth: "2016-05-02",
    guardians: [{ fullName: "Nguyễn Thị Lan", phone: "0912345678", email: "lan@example.com", nationalId: "079301001234" }],
    notes: "Gọi mẹ 0987654321 hoặc mail me@example.com",
  };
  const masked = maskPii(before);
  const s = JSON.stringify(masked);
  assert.ok(!s.includes("0912345678"), "SĐT phụ huynh không được lọt vào nhật ký");
  assert.ok(!s.includes("lan@example.com"), "email không được lọt");
  assert.ok(!s.includes("079301001234"), "CCCD không được lọt");
  assert.ok(!s.includes("0987654321"), "SĐT trong ghi chú tự do cũng phải bị che");
  assert.ok(!s.includes("me@example.com"));
  // Trường không phải PII giữ nguyên để nhật ký còn đọc được
  assert.equal(masked.fullName, "Nguyễn Minh An");
  assert.equal(masked.dateOfBirth, "2016-05-02");
  // Không sửa đối tượng gốc
  assert.equal(before.guardians[0]!.phone, "0912345678");
});

test("phát hiện bản ghi có PII để hiện nút Xem đầy đủ", () => {
  assert.equal(hasPii({ phone: "0912345678" }), true);
  assert.equal(hasPii({ nationalId: "079301001234" }), true);
  assert.equal(hasPii({ status: "active", total: 1000 }), false);
  assert.equal(hasPii({ note: "Đã chuyển lớp" }), false);
});

test("che PII trong chuỗi tự do (thông báo lỗi, nội dung tin nhắn)", () => {
  const out = maskPiiText("Không gửi được ZNS tới 0912345678 (ph@example.com)");
  assert.ok(!out.includes("0912345678"));
  assert.ok(!out.includes("ph@example.com"));
  assert.ok(out.includes("Không gửi được ZNS"), "phần không phải PII giữ nguyên");
});

test("che IP trong nhật ký đăng nhập", () => {
  assert.equal(maskIp("203.113.45.200"), "203.113.45.x");
  assert.equal(maskIp("203.113.45.200, 10.0.0.1"), "203.113.45.x", "chỉ lấy IP đầu chuỗi x-forwarded-for");
  assert.equal(maskIp("2001:0db8:85a3:0000::1"), "2001:0db8:85a3:…");
  assert.equal(maskIp(null), "—");
  assert.equal(maskIp(""), "—");
});

test("ẩn danh hoá (yêu cầu xoá dữ liệu) không để lại SĐT thật", () => {
  const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const anon = anonymizedPhone(id);
  assert.ok(!/^(0|84)(3|5|7|8|9)/.test(anon), "không được trông giống SĐT thật");
  assert.equal(normalizeVnPhone("0912345678"), "84912345678");
  assert.equal(ANON_NAME, "[Đã ẩn danh]");
  // Hai chủ thể khác nhau ra hai giá trị khác nhau
  assert.notEqual(anonymizedPhone("aaaaaaaa-0000-0000-0000-000000000000"), anon);
  // Lưu ý: chỉ 7 ký tự hex đầu của id được dùng → hai id trùng 7 ký tự đầu sẽ đụng nhau.
  // Xem mục "Còn lại" trong docs/KIEM-DINH-BAO-MAT.md.
  assert.equal(anonymizedPhone("3f2504e0-0000-0000-0000-000000000000"), anon);
});
