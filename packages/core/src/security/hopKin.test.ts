import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dongHop, moHop, hopHopLe, NHAN_PII } from "./hopKin.js";

const BI_MAT = "khoa-kiem-thu-du-dai-de-khong-bi-tu-choi-0123456789";

describe("hộp kín", () => {
  it("đóng rồi mở ra đúng chuỗi ban đầu", () => {
    const s = dongHop(NHAN_PII, BI_MAT, "001234567890");
    assert.notEqual(s, "001234567890", "không được lưu chuỗi trần");
    assert.equal(moHop(NHAN_PII, BI_MAT, s), "001234567890");
  });

  it("giữ nguyên tiếng Việt có dấu", () => {
    const dc = "Số 211 Nguyễn Hữu Thọ, Đà Nẵng";
    assert.equal(moHop(NHAN_PII, BI_MAT, dongHop(NHAN_PII, BI_MAT, dc)), dc);
  });

  it("chuỗi rỗng hay khoảng trắng thì không đóng hộp", () => {
    assert.equal(dongHop(NHAN_PII, BI_MAT, ""), null);
    assert.equal(dongHop(NHAN_PII, BI_MAT, "   "), null);
    assert.equal(dongHop(NHAN_PII, BI_MAT, null), null);
  });

  it("mỗi lần đóng ra một chuỗi khác (IV ngẫu nhiên) nhưng mở ra vẫn như nhau", () => {
    const a = dongHop(NHAN_PII, BI_MAT, "cùng một nội dung");
    const b = dongHop(NHAN_PII, BI_MAT, "cùng một nội dung");
    assert.notEqual(a, b);
    assert.equal(moHop(NHAN_PII, BI_MAT, a), moHop(NHAN_PII, BI_MAT, b));
  });

  it("sai khoá thì mở không được, không ném lỗi", () => {
    const s = dongHop(NHAN_PII, BI_MAT, "001234567890");
    assert.equal(moHop(NHAN_PII, "mot-khoa-hoan-toan-khac-0123456789012345", s), null);
  });

  it("nhãn khác thì mở không được — lộ token Zalo không kéo theo lộ CCCD", () => {
    const s = dongHop(NHAN_PII, BI_MAT, "001234567890");
    assert.equal(moHop("zalo", BI_MAT, s), null);
  });

  it("sửa một ký tự trong nội dung thì GCM phát hiện", () => {
    const s = dongHop(NHAN_PII, BI_MAT, "001234567890")!;
    const p = s.split(":");
    p[3] = p[3]!.slice(0, -1) + (p[3]!.endsWith("A") ? "B" : "A");
    assert.equal(moHop(NHAN_PII, BI_MAT, p.join(":")), null);
  });

  it("định dạng lạ thì trả null chứ không nổ", () => {
    for (const x of ["", "khong-phai-hop", "v2:a:b:c", "v1:a:b", "abc.def.ghi"]) {
      assert.equal(moHop(NHAN_PII, BI_MAT, x), null);
    }
  });

  it("phân biệt được 'ô trống' với 'có hộp nhưng mở không được'", () => {
    const s = dongHop(NHAN_PII, BI_MAT, "001234567890");
    assert.equal(hopHopLe(s), true);
    assert.equal(hopHopLe(null), false);
    assert.equal(hopHopLe(""), false);
    // Đúng hình dạng hộp nhưng khoá khác → vẫn là hộp hợp lệ, chỉ là mở không được
    assert.equal(hopHopLe(s), true);
    assert.equal(moHop(NHAN_PII, "khoa-khac-0123456789012345678901234567", s), null);
    // Định dạng cũ của script nhập dữ liệu (hex, dấu chấm) — KHÔNG phải hộp hợp lệ
    assert.equal(hopHopLe("aabb.ccdd.eeff"), false);
  });
});
