import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_MENU, allMenuHrefs, filterMenu } from "./menu.js";
import { MODULES, applyModules, moduleUsage, normalizeModules } from "./modules.js";
import { hasPermission } from "../policy/policy.js";

const allow = () => true;

test("module: mặc định tắt 5 nhóm ít dùng, đọc dữ liệu lạ vẫn ra mặc định", () => {
  const d = normalizeModules(undefined);
  for (const m of MODULES) assert.equal(d[m.key], m.defaultOn);
  assert.deepEqual(normalizeModules({ satacoin: "yes", marketing: true, khongco: true }).satacoin, false);
  assert.equal(normalizeModules({ marketing: true }).marketing, true);
  assert.equal("khongco" in normalizeModules({ khongco: true }), false);
});

test("module: mọi khoá module trong menu đều có định nghĩa", () => {
  const known = new Set(MODULES.map((m) => m.key));
  for (const k of Object.keys(moduleUsage(ADMIN_MENU))) assert.ok(known.has(k), k);
  for (const m of MODULES) assert.ok((moduleUsage(ADMIN_MENU)[m.key] ?? []).length > 0, `${m.key} không gắn mục menu nào`);
});

test("module tắt: ẩn mục, chip và nhóm rỗng; bật lại thì đủ như cũ", () => {
  const full = filterMenu(ADMIN_MENU, allow);
  const off = applyModules(full, normalizeModules(undefined), ["SUPER_ADMIN"]);
  const hrefs = allMenuHrefs(off);
  for (const h of ["/satacoin", "/jobs", "/nhuong-quyen", "/marketing", "/go-live"]) assert.ok(!hrefs.includes(h), h);
  for (const h of ["/landing", "/news"]) assert.ok(hrefs.includes(h), `${h} luôn hiện dù tắt Marketing`);
  assert.ok(hrefs.includes("/to-chuc"), "Cây tổ chức còn dù tắt Nhượng quyền");
  const on = applyModules(full, Object.fromEntries(MODULES.map((m) => [m.key, true])), ["SUPER_ADMIN"]);
  assert.deepEqual(allMenuHrefs(on), allMenuHrefs(full));
});

test("module marketing: vai trò Marketing Hội sở vẫn thấy dù đang tắt", () => {
  const full = filterMenu(ADMIN_MENU, (p) => hasPermission({ userId: "u", assignments: [{ role: "HO_MARKETING", centerId: null }] } as never, p));
  const state = normalizeModules(undefined);
  assert.ok(allMenuHrefs(applyModules(full, state, ["HO_MARKETING"])).includes("/marketing"));
  assert.ok(!allMenuHrefs(applyModules(full, state, ["CENTER_MANAGER"])).includes("/marketing"));
});

test("module: không làm thay đổi cây gốc (hàng rào trang dùng cây đầy đủ)", () => {
  const before = JSON.stringify(ADMIN_MENU);
  applyModules(ADMIN_MENU, normalizeModules(undefined), []);
  assert.equal(JSON.stringify(ADMIN_MENU), before);
});
