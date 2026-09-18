import test from "node:test";
import assert from "node:assert/strict";
import { inScope, assertInScope, filterInScope, ScopeError } from "./scope.js";

const CS1 = "11111111-1111-1111-1111-111111111111";
const CS2 = "22222222-2222-2222-2222-222222222222";

test("Hội sở (null) thấy mọi cơ sở", () => {
  assert.equal(inScope(null, CS1), true);
  assert.equal(inScope(null, null), true);
});

test("người của cơ sở A không đọc được bản ghi cơ sở B", () => {
  assert.equal(inScope([CS1], CS1), true);
  assert.equal(inScope([CS1], CS2), false);
  assert.equal(inScope([CS1, CS2], CS2), true);
});

test("không có cơ sở nào thì không thấy gì", () => {
  assert.equal(inScope([], CS1), false);
  assert.equal(inScope([], null), false);
});

test("bản ghi không gắn cơ sở chỉ Hội sở được thấy", () => {
  assert.equal(inScope([CS1], null), false);
  assert.equal(inScope([CS1], undefined), false);
  assert.equal(inScope(null, undefined), true);
});

test("assertInScope ném ScopeError kèm thông báo tiếng Việt", () => {
  assert.doesNotThrow(() => assertInScope([CS1], CS1));
  assert.throws(
    () => assertInScope([CS1], CS2, "Học viên"),
    (e: unknown) => e instanceof ScopeError && /Học viên không thuộc phạm vi cơ sở/.test((e as Error).message),
  );
  // tên lỗi giữ nguyên để tầng tRPC ánh xạ sang FORBIDDEN
  try {
    assertInScope([], CS1);
  } catch (e) {
    assert.equal((e as Error).name, "ScopeError");
  }
});

test("lọc danh sách theo phạm vi", () => {
  const rows = [{ id: "a", centerId: CS1 }, { id: "b", centerId: CS2 }, { id: "c", centerId: null }];
  assert.deepEqual(filterInScope([CS1], rows).map((r) => r.id), ["a"]);
  assert.deepEqual(filterInScope(null, rows).map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(filterInScope([], rows).map((r) => r.id), []);
  // Không sửa mảng gốc
  assert.equal(rows.length, 3);
});
