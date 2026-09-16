import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize, visibleCenterIds, type Actor } from "./policy.js";

const superAdmin: Actor = { userId: "u0", assignments: [{ role: "SUPER_ADMIN", centerId: null }] };
const cs1Manager: Actor = { userId: "u1", assignments: [{ role: "CENTER_MANAGER", centerId: "cs1" }] };
const teacher: Actor = { userId: "u2", personId: "gv1", assignments: [{ role: "TEACHER", centerId: "cs1" }] };
const parent: Actor = { userId: "u3", personId: "ph1", assignments: [{ role: "PARENT", centerId: null }] };
const auditor: Actor = { userId: "u4", assignments: [{ role: "AUDITOR", centerId: null }] };

test("super admin làm được mọi thứ", () => {
  assert.equal(authorize(superAdmin, "finance:delete", { centerId: "cs2" }).allowed, true);
});

test("quản lý cơ sở chỉ thấy cơ sở mình", () => {
  assert.equal(authorize(cs1Manager, "class:update", { centerId: "cs1" }).allowed, true);
  assert.equal(authorize(cs1Manager, "class:update", { centerId: "cs2" }).allowed, false);
  assert.deepEqual(visibleCenterIds(cs1Manager), ["cs1"]);
  assert.equal(visibleCenterIds(superAdmin), null);
});

test("giáo viên chỉ điểm danh buổi của mình", () => {
  assert.equal(authorize(teacher, "attendance:write", { centerId: "cs1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(teacher, "attendance:write", { centerId: "cs1", ownerIds: ["gv9"] }).allowed, false);
  assert.equal(authorize(teacher, "finance:read", { centerId: "cs1" }).allowed, false);
});

test("phụ huynh chỉ đọc dữ liệu con mình", () => {
  assert.equal(authorize(parent, "student:read", { ownerIds: ["ph1", "ph2"] }).allowed, true);
  assert.equal(authorize(parent, "student:read", { ownerIds: ["ph2"] }).allowed, false);
  assert.equal(authorize(parent, "makeup:request_own", { ownerIds: ["ph1"] }).allowed, true);
});

test("auditor chỉ đọc", () => {
  assert.equal(authorize(auditor, "finance:read", { centerId: "cs2" }).allowed, true);
  assert.equal(authorize(auditor, "finance:update", { centerId: "cs2" }).allowed, false);
});
