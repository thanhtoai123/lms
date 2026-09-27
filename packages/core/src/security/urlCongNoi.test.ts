import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loiUrlCongNoi } from "./urlCongNoi.js";

describe("địa chỉ cổng nối — chặn SSRF vào siêu dữ liệu đám mây", () => {
  it("nhận máy chủ ngoài, localhost và mạng riêng (cấu hình hợp lệ)", () => {
    for (const u of ["https://zalo-gw.example.vn", "http://localhost:3001", "http://10.0.0.5:8080", "http://192.168.1.20"]) assert.equal(loiUrlCongNoi(u), null, u);
  });
  it("chặn địa chỉ siêu dữ liệu và các dạng viết lách", () => {
    for (const u of ["http://169.254.169.254/latest/meta-data", "http://metadata.google.internal", "http://[fd00:ec2::254]", "http://2852039166", "http://0xa9fea9fe"]) {
      assert.notEqual(loiUrlCongNoi(u), null, u);
    }
  });
  it("chặn giao thức lạ và URL kèm mật khẩu", () => {
    assert.notEqual(loiUrlCongNoi("file:///etc/passwd"), null);
    assert.notEqual(loiUrlCongNoi("https://a:b@zalo-gw.example.vn"), null);
    assert.notEqual(loiUrlCongNoi("khong-phai-url"), null);
  });
});
