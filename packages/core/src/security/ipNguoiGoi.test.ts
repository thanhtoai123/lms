import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ipNguoiGoi, soLopProxy } from "./ipNguoiGoi.js";

describe("IP người gọi — chống giả X-Forwarded-For", () => {
  it("lấy phần tử do proxy nối vào cuối, không lấy phần máy khách tự khai", () => {
    assert.equal(ipNguoiGoi("6.6.6.6, 203.0.113.9", null), "203.0.113.9");
  });
  it("đổi IP bịa ở đầu danh sách không đổi được khoá đếm", () => {
    const a = ipNguoiGoi("1.1.1.1, 203.0.113.9", null);
    const b = ipNguoiGoi("2.2.2.2, 203.0.113.9", null);
    assert.equal(a, b);
  });
  it("hai lớp proxy thì lấy phần tử thứ hai từ phải", () => {
    assert.equal(ipNguoiGoi("6.6.6.6, 203.0.113.9, 10.0.0.2", null, 2), "203.0.113.9");
  });
  it("không có X-Forwarded-For thì dùng X-Real-IP", () => {
    assert.equal(ipNguoiGoi(null, "198.51.100.4"), "198.51.100.4");
  });
  it("chuỗi rác không thành khoá đếm", () => {
    assert.equal(ipNguoiGoi("<script>", null), "unknown");
    assert.equal(ipNguoiGoi(null, null), "unknown");
  });
  it("IPv6 hợp lệ", () => {
    assert.equal(ipNguoiGoi("2001:db8::1", null), "2001:db8::1");
  });
  it("số lớp proxy ngoài khoảng 1–5 thì về 1", () => {
    assert.equal(soLopProxy({ TRUSTED_PROXY_HOPS: "0" }), 1);
    assert.equal(soLopProxy({ TRUSTED_PROXY_HOPS: "3" }), 3);
    assert.equal(soLopProxy({}), 1);
  });
});
