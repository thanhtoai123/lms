import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Kiểm thử này có hai việc:
 *  1. Chốt hợp đồng mã hoá PII của ứng dụng (đóng → mở ra đúng chuỗi ban đầu).
 *  2. **Chốt đúng cái lỗi đã từng xảy ra**: script `migrate-legacy` mã hoá theo một cách
 *     khác (`<iv>.<tag>.<ct>` hex, khoá thô từ `ENCRYPTION_KEY`) nên `openPii()` trả `null`
 *     lặng lẽ và CCCD phụ huynh nhập từ hệ cũ thành rác. Nếu ai đó lại tách hai bên ra,
 *     bài kiểm thử cuối trong tệp này hỏng ngay.
 *
 * Cũng là tệp kiểm thử đầu tiên nằm trong `services/` — trước đây mẫu `test` của
 * `packages/api` chỉ quét một cấp nên mọi tệp ở đây bị bỏ qua âm thầm.
 */
process.env.PII_ENCRYPTION_KEY ??= "khoa-kiem-thu-du-dai-de-khong-bi-tu-choi-0123456789";

const { sealPii, openPii, sealWith, openWith, piiMoKhongDuoc } = await import("./pii.ts");

describe("mã hoá PII của ứng dụng", () => {
  it("đóng rồi mở ra đúng chuỗi ban đầu", () => {
    const s = sealPii("001234567890");
    assert.notEqual(s, "001234567890");
    assert.equal(openPii(s), "001234567890");
  });

  it("địa chỉ tiếng Việt có dấu vẫn nguyên vẹn", () => {
    const dc = "Số 211 Nguyễn Hữu Thọ, Quận Hải Châu, Đà Nẵng";
    assert.equal(openPii(sealPii(dc)), dc);
  });

  it("ô trống thì không lưu hộp rỗng vào CSDL", () => {
    assert.equal(sealPii(null), null);
    assert.equal(sealPii(""), null);
    assert.equal(sealPii("  "), null);
  });

  it("nhãn riêng cho token tích hợp: lộ nhãn này không mở được nhãn kia", () => {
    const tok = sealWith("zalo", "ACCESS-TOKEN-GIA-DINH");
    assert.equal(openWith("zalo", tok), "ACCESS-TOKEN-GIA-DINH");
    assert.equal(openPii(tok), null);
  });

  it("phân biệt ô trống với ô có dữ liệu nhưng mở không được", () => {
    assert.equal(piiMoKhongDuoc(null), false);
    assert.equal(piiMoKhongDuoc(sealPii("001234567890")), false);
    // Hộp đúng hình dạng nhưng mã hoá bằng khoá khác
    assert.equal(piiMoKhongDuoc("v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCC"), true);
  });

  it("KHÔNG đọc được định dạng cũ của script nhập dữ liệu — đây là lỗi đã sửa", () => {
    // `<iv>.<tag>.<ct>` hex: hình dạng này không phải hộp hợp lệ, và openPii trả null.
    const kieuCu = "aabbccddeeff00112233445566.778899aabbccddeeff001122334455.66778899aabb";
    assert.equal(openPii(kieuCu), null);
    assert.equal(piiMoKhongDuoc(kieuCu), false, "không phải hộp → phải báo là 'không có hộp', đừng nhầm là hỏng khoá");
  });
});
