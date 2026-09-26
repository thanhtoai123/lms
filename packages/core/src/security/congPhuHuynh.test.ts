import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nguonHopLe, phienNgungHan, conLaiTruocNgung, tenThietBi, PH_NGUNG_NGAY } from "./congPhuHuynh.js";

const HOST = "hocvien.satarobo.vn";

describe("nguồn yêu cầu ghi của cổng phụ huynh", () => {
  it("cùng nguồn thì cho qua", () => {
    assert.equal(nguonHopLe({ origin: `https://${HOST}`, secFetchSite: "same-origin", host: HOST }), true);
  });

  it("trang lạ gửi tới thì chặn", () => {
    assert.equal(nguonHopLe({ origin: "https://trang-la.example", secFetchSite: "cross-site", host: HOST }), false);
    // kể cả khi máy khách tự gỡ Origin đi
    assert.equal(nguonHopLe({ origin: null, secFetchSite: "cross-site", host: HOST }), false);
    // miền con khác của cùng site vẫn là nguồn khác
    assert.equal(nguonHopLe({ origin: `https://khac.${HOST}`, secFetchSite: "same-site", host: HOST }), false);
  });

  it("KHÔNG có Origin mà cũng KHÔNG có Sec-Fetch-Site thì chặn (bản cũ cho qua)", () => {
    assert.equal(nguonHopLe({ origin: null, secFetchSite: null, host: HOST }), false);
  });

  it("người dùng tự gõ địa chỉ (Sec-Fetch-Site: none) thì cho qua", () => {
    assert.equal(nguonHopLe({ origin: null, secFetchSite: "none", host: HOST }), true);
  });

  it("Origin 'null' (iframe sandbox, tệp cục bộ) thì chặn", () => {
    assert.equal(nguonHopLe({ origin: "null", secFetchSite: null, host: HOST }), false);
  });

  it("chạy sau proxy đổi host thì khớp theo địa chỉ công khai", () => {
    assert.equal(nguonHopLe({ origin: "https://hocvien.satarobo.vn", host: "10.0.0.5:3000", appUrl: "https://hocvien.satarobo.vn" }), true);
    assert.equal(nguonHopLe({ origin: "https://khac.example", host: "10.0.0.5:3000", appUrl: "https://hocvien.satarobo.vn" }), false);
  });

  it("Origin hỏng thì chặn", () => {
    assert.equal(nguonHopLe({ origin: "khong-phai-url", secFetchSite: "same-origin", host: HOST }), false);
  });
});

describe("phiên ngưng vì lâu không dùng", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  const truoc = (ngay: number) => new Date(now.getTime() - ngay * 86_400_000);

  it("mở hằng ngày thì không ngưng", () => {
    assert.equal(phienNgungHan(truoc(1), now), false);
    assert.equal(phienNgungHan(truoc(PH_NGUNG_NGAY - 1), now), false);
  });

  it("quá mốc thì ngưng", () => {
    assert.equal(phienNgungHan(truoc(PH_NGUNG_NGAY + 1), now), true);
  });

  it("đếm ngược số ngày còn lại", () => {
    assert.equal(conLaiTruocNgung(truoc(0), now), PH_NGUNG_NGAY);
    assert.equal(conLaiTruocNgung(truoc(PH_NGUNG_NGAY), now), 0);
    assert.equal(conLaiTruocNgung(null, now), PH_NGUNG_NGAY);
  });
});

describe("tên thiết bị dễ đọc", () => {
  it("điện thoại Android", () => {
    assert.equal(
      tenThietBi("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36"),
      "Chrome trên Android",
    );
  });

  it("iPhone dùng Safari", () => {
    assert.equal(
      tenThietBi("Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1"),
      "Safari trên iPhone",
    );
  });

  it("mở từ trong ứng dụng Zalo", () => {
    assert.ok(tenThietBi("Mozilla/5.0 (Linux; Android 13) ZaloTheme/dark Chrome/120.0.0.0").startsWith("Zalo trên Android"));
  });

  it("không có User-Agent thì nói rõ là không rõ, không để trống", () => {
    assert.equal(tenThietBi(null), "Thiết bị không rõ");
    assert.equal(tenThietBi("  "), "Thiết bị không rõ");
  });

  it("không in số phiên bản hệ điều hành", () => {
    const t = tenThietBi("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36");
    assert.equal(t, "Chrome trên Windows");
    assert.ok(!/\d/.test(t));
  });
});
