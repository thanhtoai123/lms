import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize, authorizeGlobal, centersWith, visibleCenterIds, hasPermission, ROLE_LABEL_VI, ROLES, STAFF_ROLES, type Actor } from "./policy.js";

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

test("hasPermission dùng cho menu: bỏ qua phạm vi và quyền sở hữu", () => {
  const teacher: Actor = { userId: "t", assignments: [{ role: "TEACHER", centerId: "cs1" }] };
  assert.equal(hasPermission(teacher, "class:read"), true); // có class:read_own → thấy menu Lớp của tôi
  assert.equal(hasPermission(teacher, "finance:read"), false);
  assert.equal(hasPermission(cs1Manager, "lead:read"), true);
  assert.equal(hasPermission(cs1Manager, "system:read"), false);
  assert.equal(hasPermission(superAdmin, "system:read"), true);
  assert.equal(ROLES.every((r) => !!ROLE_LABEL_VI[r]), true);
  assert.equal(STAFF_ROLES.includes("PARENT"), false);
});

test("kho & SataCoin: phân quyền", () => {
  const mgr = { userId: "m", assignments: [{ role: "CENTER_MANAGER" as const, centerId: "c1" }] };
  const gv = { userId: "t", personId: "gv1", assignments: [{ role: "TEACHER" as const, centerId: "c1" }] };
  const csm = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM" as const, centerId: "c1" }] };
  const kt = { userId: "k", assignments: [{ role: "CENTER_ACCOUNTANT" as const, centerId: "c1" }] };
  assert.equal(authorize(mgr, "inventory:approve", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(mgr, "inventory:update", { centerId: "c2" }).allowed, false);
  assert.equal(authorize(mgr, "coin:adjust", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gv, "coin:award_own", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "coin:award_own", { centerId: "c1", ownerIds: ["gv2"] }).allowed, false);
  assert.equal(authorize(gv, "coin:award", { centerId: "c1" }).allowed, false);
  assert.equal(hasPermission(gv, "coin:read"), true);
  assert.equal(authorize(csm, "coin:redeem", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "coin:approve", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(csm, "inventory:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "inventory:update", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(kt, "inventory:read", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(kt, "inventory:update", { centerId: "c1" }).allowed, false);
});

test("học liệu & bài tập: phân quyền", () => {
  const gv = { userId: "t", personId: "gv1", assignments: [{ role: "TEACHER" as const, centerId: "c1" }] };
  const dt = { userId: "d", assignments: [{ role: "TRAINING" as const, centerId: null }] };
  const gvu = { userId: "g", assignments: [{ role: "CENTER_CLASS_MANAGER" as const, centerId: "c1" }] };
  assert.equal(authorize(gv, "assignment:create", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "assignment:create", { centerId: "c1", ownerIds: ["gv2"] }).allowed, false);
  assert.equal(authorize(gv, "document:read", { ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "document:create", {}).allowed, false);
  assert.equal(authorize(gv, "curriculum:propose", {}).allowed, true);
  assert.equal(authorize(dt, "document:create", {}).allowed, true);
  assert.equal(authorize(dt, "curriculum:approve", {}).allowed, true);
  assert.equal(authorize(dt, "assignment:grade", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(gvu, "assignment:grade", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gvu, "assignment:grade", { centerId: "c2" }).allowed, false);
});

test("tuân thủ / marketing: phân quyền", () => {
  const mk = { userId: "m", assignments: [{ role: "HO_MARKETING" as const, centerId: null }] };
  const qc = { userId: "q", assignments: [{ role: "CENTER_MANAGER" as const, centerId: "c1" }] };
  const csm = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM" as const, centerId: "c1" }] };
  const au = { userId: "a", assignments: [{ role: "AUDITOR" as const, centerId: null }] };
  assert.equal(authorize(mk, "site:update", {}).allowed, true);
  assert.equal(authorize(mk, "marketing:configure", {}).allowed, true);
  assert.equal(authorize(mk, "compliance:read", {}).allowed, false);
  assert.equal(authorize(qc, "compliance:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(qc, "compliance:update", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(qc, "marketing:read", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "compliance:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "site:update", {}).allowed, false);
  assert.equal(authorize(au, "compliance:read", {}).allowed, true);
  assert.equal(authorize(au, "compliance:update", {}).allowed, false);
});

test("hoàn thành khoá: GV chỉ đề xuất lớp mình, quản lý mới duyệt", () => {
  const gv = { userId: "t", personId: "gv1", assignments: [{ role: "TEACHER" as const, centerId: "c1" }] };
  const gvu = { userId: "g", assignments: [{ role: "CENTER_CLASS_MANAGER" as const, centerId: "c1" }] };
  const qc = { userId: "q", assignments: [{ role: "CENTER_MANAGER" as const, centerId: "c1" }] };
  const csm = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM" as const, centerId: "c1" }] };
  const dt = { userId: "d", assignments: [{ role: "TRAINING" as const, centerId: null }] };
  assert.equal(authorize(gv, "completion:propose", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "completion:propose", { centerId: "c1", ownerIds: ["gv2"] }).allowed, false);
  assert.equal(authorize(gv, "completion:approve", { centerId: "c1", ownerIds: ["gv1"] }).allowed, false);
  assert.equal(authorize(gvu, "completion:approve", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gvu, "completion:approve", { centerId: "c2" }).allowed, false);
  assert.equal(authorize(qc, "completion:approve", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(dt, "completion:approve", {}).allowed, true);
  // tư vấn / CSKH sửa được ghi danh nhưng không cấp chứng chỉ
  assert.equal(authorize(csm, "enrollment:update", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "completion:approve", { centerId: "c1" }).allowed, false);
  assert.equal(hasPermission(gv, "completion:propose"), true);
  assert.equal(hasPermission(csm, "completion:approve"), false);
});

test("5F: tuyển dụng / tin nhắn / giới thiệu + quyền toàn hệ thống", () => {
  const hr = { userId: "h", assignments: [{ role: "CENTER_HR" as const, centerId: "c1" }] };
  const qc = { userId: "q", assignments: [{ role: "CENTER_MANAGER" as const, centerId: "c1" }] };
  const gv = { userId: "t", personId: "gv1", assignments: [{ role: "TEACHER" as const, centerId: "c1" }] };
  const kt = { userId: "k", assignments: [{ role: "CENTER_ACCOUNTANT" as const, centerId: "c1" }] };
  const csm = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM" as const, centerId: "c1" }] };
  const sa = { userId: "a", assignments: [{ role: "SUPER_ADMIN" as const, centerId: null }] };
  assert.equal(authorize(hr, "recruit:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(hr, "recruit:create", { centerId: "c2" }).allowed, false);
  assert.equal(authorize(qc, "recruit:create", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(qc, "recruit:interview", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gv, "recruit:interview", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "message:create", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "message:create", { centerId: "c1", ownerIds: ["gv2"] }).allowed, false);
  assert.equal(authorize(csm, "message:update", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "message:audit", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(qc, "message:audit", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(kt, "affiliate:pay", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(kt, "affiliate:approve", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(csm, "affiliate:approve", { centerId: "c1" }).allowed, false);
  assert.equal(authorizeGlobal(qc, "compliance:read"), false);
  assert.equal(authorize(qc, "compliance:read", {}).allowed, true);
  assert.equal(authorizeGlobal(sa, "compliance:update"), true);
  assert.deepEqual(centersWith(hr, "recruit:read"), ["c1"]);
  assert.deepEqual(centersWith(gv, "recruit:interview"), []);
  assert.equal(centersWith(sa, "recruit:read"), null);
});

test("lớp trải nghiệm: xem / quản lý / điểm danh / xếp GV / vượt sĩ số", () => {
  const mgr: Actor = { userId: "m", assignments: [{ role: "CENTER_MANAGER", centerId: "c1" }] };
  const gvu: Actor = { userId: "g", assignments: [{ role: "CENTER_CLASS_MANAGER", centerId: "c1" }] };
  const csm: Actor = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM", centerId: "c1" }] };
  const gv: Actor = { userId: "t", personId: "gv1", assignments: [{ role: "TEACHER", centerId: "c1" }] };
  // Quản lý cơ sở có đủ, kể cả vượt sĩ số — và chỉ trong cơ sở mình
  assert.equal(authorize(mgr, "trials:manage", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(mgr, "trials:override-capacity", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(mgr, "trials:manage", { centerId: "c2" }).allowed, false);
  // Giáo vụ / tư vấn quản lý được lớp nhưng không được vượt sĩ số
  assert.equal(authorize(gvu, "trials:manage", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gvu, "trials:assign-teacher", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gvu, "trials:override-capacity", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(csm, "trials:manage", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(csm, "trials:override-capacity", { centerId: "c1" }).allowed, false);
  // Giáo viên chỉ xem / điểm danh buổi của mình
  assert.equal(authorize(gv, "trials:attendance", { centerId: "c1", ownerIds: ["gv1"] }).allowed, true);
  assert.equal(authorize(gv, "trials:attendance", { centerId: "c1", ownerIds: ["gv9"] }).allowed, false);
  assert.equal(authorize(gv, "trials:manage", { centerId: "c1" }).allowed, false);
  assert.equal(hasPermission(gv, "trials:view"), true);
});
