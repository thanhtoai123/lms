import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { duongNoiBo } from "./duongNoiBo.js";

describe("đường dẫn nội bộ — chống chuyển hướng mở", () => {
  it("nhận đường dẫn nội bộ bình thường", () => {
    for (const s of ["/", "/hoc-vien?page=2", "/ph/be/abc#ghi-chu"]) assert.equal(duongNoiBo(s), s);
  });
  it("chặn các dạng thoát ra miền khác", () => {
    for (const s of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", "\\\\evil.com", "", "evil.com"]) {
      assert.equal(duongNoiBo(s), null, JSON.stringify(s));
    }
  });
  it("không phải chuỗi thì bỏ", () => {
    assert.equal(duongNoiBo(null), null);
    assert.equal(duongNoiBo(42), null);
  });
});
