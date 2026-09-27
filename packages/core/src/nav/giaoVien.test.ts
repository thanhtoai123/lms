import { test } from "node:test";
import assert from "node:assert/strict";
import { teacherTabOf, teacherMoreGroups, TEACHER_PRIMARY } from "./giaoVien.js";
import { ADMIN_MENU, filterMenu } from "./menu.js";
import { hasPermission, centersWith, type Actor } from "../policy/policy.js";

test("teacherTabOf: mỗi mục chính sáng đúng trang của nó", () => {
  assert.equal(teacherTabOf("/teacher"), "today");
  assert.equal(teacherTabOf("/teacher/sessions/abc/chuan-bi"), "today");
  assert.equal(teacherTabOf("/teacher/classes"), "classes");
  assert.equal(teacherTabOf("/teacher/classes/x/hoc-ba"), "classes");
  assert.equal(teacherTabOf("/classes/x"), "classes");
  assert.equal(teacherTabOf("/report-cards/e/5"), "classes");
  assert.equal(teacherTabOf("/cham-cong/lich-ca?period=2026-09"), "timesheet");
  assert.equal(teacherTabOf("/cham-cong/checkin"), "timesheet");
  assert.equal(teacherTabOf("/teacher/them"), "more");
  assert.equal(teacherTabOf("/assignments"), "more");
  assert.equal(teacherTabOf("/classesx"), "more");
  assert.equal(teacherTabOf("/teacherx"), "more");
});

test("mục chính: 4 mục, đường dẫn không trùng", () => {
  assert.equal(TEACHER_PRIMARY.length, 4);
  assert.equal(new Set(TEACHER_PRIMARY.map((t) => t.href)).size, 4);
});

test("Thêm của giáo viên: có học bạ, bài tập, tin nhắn; không có Dashboard / Lớp học / Ca & công", () => {
  const actor = { userId: "u", personId: null, assignments: [{ role: "TEACHER", centerId: "c1" }], extraPermissions: [] } as unknown as Actor;
  const nav = filterMenu(ADMIN_MENU, (p) => hasPermission(actor, p), (p) => { const c = centersWith(actor, p); return c === null || c.length > 0; });
  const hrefs = teacherMoreGroups(nav).flatMap((g) => g.items.map((i) => i.href));
  for (const h of ["/ho-so-hoc-tap", "/assignments", "/tin-nhan", "/huong-dan"]) assert.ok(hrefs.includes(h), h);
  for (const h of ["/dashboard", "/classes", "/cham-cong/lich-ca"]) assert.ok(!hrefs.includes(h), h);
});
