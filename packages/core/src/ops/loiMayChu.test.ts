import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { taoLoiMayChu, chuanHoaThongDiep, chuanHoaDuongDan , laLoiCanGhi } from "./loiMayChu.js";

describe("gom lỗi máy chủ theo vân tay", () => {
  it("cùng lỗi khác id / số → cùng một vân tay", () => {
    const a = taoLoiMayChu({ name: "TypeError", msg: "Cannot read x of order 5f1c2a8e-1111-4a2b-9c3d-123456789abc", path: "/api/trpc/finance.debts?batch=1" });
    const b = taoLoiMayChu({ name: "TypeError", msg: "Cannot read x of order 0a1b2c3d-2222-4a2b-9c3d-abcdefabcdef", path: "/api/trpc/finance.debts" });
    assert.equal(a.vanTay, b.vanTay);
  });
  it("khác đường dẫn hoặc khác loại lỗi → khác vân tay", () => {
    const a = taoLoiMayChu({ name: "TypeError", msg: "x", path: "/a" });
    assert.notEqual(a.vanTay, taoLoiMayChu({ name: "TypeError", msg: "x", path: "/b" }).vanTay);
    assert.notEqual(a.vanTay, taoLoiMayChu({ name: "RangeError", msg: "x", path: "/a" }).vanTay);
  });
  it("chuẩn hoá thông điệp và đường dẫn", () => {
    assert.equal(chuanHoaThongDiep("timeout after 15000 ms"), "timeout after «số» ms");
    assert.equal(chuanHoaDuongDan("/hoc-vien/5f1c2a8e-1111-4a2b-9c3d-123456789abc/sua?x=1"), "/hoc-vien/«id»/sua");
  });
});

it("laLoiCanGhi: bỏ từ chối quyền, ngắt kết nối, điều hướng; giữ lỗi thật", () => {
  const trpc = (code: string) => Object.assign(new Error("x"), { name: "TRPCError", code });
  assert.equal(laLoiCanGhi(trpc("FORBIDDEN")), false);
  assert.equal(laLoiCanGhi(trpc("PRECONDITION_FAILED")), false);
  assert.equal(laLoiCanGhi(trpc("INTERNAL_SERVER_ERROR")), true);
  assert.equal(laLoiCanGhi(Object.assign(new Error("Không có quyền"), { name: "ForbiddenError" })), false);
  assert.equal(laLoiCanGhi(new Error("The destination stream closed early.")), false);
  assert.equal(laLoiCanGhi(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })), false);
  assert.equal(laLoiCanGhi(new Error("relation does not exist")), true);
  assert.equal(laLoiCanGhi(null), false);
});
