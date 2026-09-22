import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ADMIN_MENU, LEGACY_REDIRECTS, MOVED_OUT_OF_SIDEBAR, REPORTS, activeNavItem, activeTab, allMenuHrefs, defaultOpenGroups,
  filterMenu, foldVi, menuManifest, navPrefixes, nextRedirects, pageAllowed, pagePermLabel, pathOf, queryOf, searchMenu,
} from "./menu.js";
import { centersWith, hasPermission, ROLES, STAFF_ROLES, type Actor, type Role } from "../policy/policy.js";

/** Ảnh chụp menu CŨ (120 mục, trước khi tái cấu trúc) — mọi đường dẫn phải còn chỗ đi tới */
const OLD_MENU_HREFS = [
  "/viec-hom-nay", "/dashboard", "/huong-dan", "/bao-mat", "/crm", "/leads", "/nhap-khach-hang", "/leads/import", "/leads/import/registered",
  "/leads/bulk-convert", "/quan-ly-chia-lead", "/quan-ly-chia-lead/lich-su", "/ban-giao-lead", "/lead-nguoi", "/leads/bao-cao-chuyen",
  "/affiliates", "/crm/messenger", "/lop-trial", "/lop-trial/buoi-le", "/students", "/students/tai-khoan", "/the-hoc-vien", "/enrollments",
  "/chuyen-lop", "/students/sap-het-khoa", "/hoan-thanh-khoa", "/hoc-ba", "/report-cards", "/ho-so-hoc-tap", "/satacoin", "/classes",
  "/class-groups", "/sessions", "/classes/kiem-tra-lich", "/lich", "/attendance", "/media", "/duyet-media", "/hoc-bu", "/centers", "/rooms",
  "/curriculums", "/de-xuat-giao-an", "/courses", "/course-packages", "/course-prerequisites", "/lo-trinh", "/documents", "/assignments",
  "/teaching-materials", "/scorm", "/tin-nhan", "/hoi-thoai", "/parent-requests", "/parent-feedback", "/evaluations", "/khao-sat",
  "/notifications", "/thong-bao", "/canh-bao-rui-ro", "/cham-soc-hv", "/sinh-nhat", "/teachers", "/nhan-su", "/nhan-su/vi-tri", "/cham-cong",
  "/cham-cong/phan-ca", "/cham-cong/ky-cong", "/cham-cong/danh-muc-ca", "/cham-cong/diem-cham", "/cham-cong/man-hinh", "/don-tu",
  "/cham-cong/lich-ca", "/jobs", "/kits", "/products", "/inventory/dashboard", "/inventory/audit", "/orders", "/payments", "/cong-no",
  "/thieu-hoc-phi", "/nhap-giao-dich-cu", "/bien-dong-so-du", "/hoan-tien", "/hoa-don", "/payment-methods", "/crm/commission", "/news",
  "/site-content", "/marketing", "/marketing/funnel", "/email-templates", "/email-logs", "/otp-logs", "/users", "/user-groups", "/roles",
  "/to-chuc", "/nhuong-quyen", "/bao-mat-he-thong", "/audit-log", "/compliance", "/crm/webhook-replay", "/tich-hop", "/chuyen-doi", "/go-live",
  "/van-hanh", "/cau-hinh-van-hanh", "/settings", "/bao-cao/lead", "/bao-cao/trial", "/bao-cao/dao-tao", "/bao-cao/trung-tam",
  "/bao-cao/hieu-suat-gv", "/bao-cao/cohort", "/bao-cao/churn", "/bao-cao/doanh-thu", "/bao-cao/sau-go-live", "/bao-cao/chat-pilot",
];

const actorOf = (role: Role): Actor => ({ userId: "u", personId: "p", assignments: [{ role, centerId: role.startsWith("HO_") || role === "SUPER_ADMIN" || role === "TRAINING" || role === "AUDITOR" ? null : "c1" }] });
const strictOf = (a: Actor) => (p: Parameters<typeof hasPermission>[1]) => { const c = centersWith(a, p); return c === null || c.length > 0; };
const menuFor = (role: Role) => { const a = actorOf(role); return filterMenu(ADMIN_MENU, (p) => hasPermission(a, p), strictOf(a)); };

test("mọi href trong cây menu là duy nhất (mục + chip, trừ chip đầu trùng href mục)", () => {
  const seen = new Map<string, string>();
  for (const g of ADMIN_MENU) for (const i of g.items) {
    const own = new Set([i.href, ...(i.tabs ?? []).map((t) => t.href)]);
    assert.equal(own.size, 1 + (i.tabs?.length ?? 0) - (i.tabs?.some((t) => t.href === i.href) ? 1 : 0), `${i.label}: chip trùng nhau`);
    for (const h of own) {
      assert.ok(!seen.has(h), `${h} xuất hiện ở cả "${seen.get(h)}" và "${i.label}"`);
      seen.set(h, i.label);
    }
  }
});

test("mục trung tâm: href = chip đầu tiên, có ≥ 2 chip", () => {
  for (const g of ADMIN_MENU) for (const i of g.items) {
    if (!i.tabs) continue;
    assert.ok(i.tabs.length >= 2, `${i.label}: chỉ 1 chip thì không cần trang trung tâm`);
    assert.equal(i.href, i.tabs[0]!.href, `${i.label}: href phải là chip đầu`);
  }
});

test("mỗi nhóm ≤ 9 mục, khoá nhóm duy nhất, tối đa 2 cấp", () => {
  assert.equal(new Set(ADMIN_MENU.map((g) => g.key)).size, ADMIN_MENU.length);
  for (const g of ADMIN_MENU) {
    assert.ok(g.items.length >= 1 && g.items.length <= 9, `${g.label}: ${g.items.length} mục`);
    for (const r of g.roles) assert.ok(ROLES.includes(r), `${g.key}: vai trò lạ ${r}`);
  }
});

test("tiền tố đường dẫn không thuộc hai mục khác nhau", () => {
  const owner = new Map<string, string>();
  for (const g of ADMIN_MENU) for (const i of g.items) for (const p of navPrefixes(i)) {
    assert.ok(!owner.has(p) || owner.get(p) === i.label, `${p} thuộc cả "${owner.get(p)}" và "${i.label}"`);
    owner.set(p, i.label);
  }
});

test("mọi đường cũ trong bảng chuyển hướng trỏ tới một href tồn tại, và nguồn không còn trong menu", () => {
  const hrefs = allMenuHrefs(ADMIN_MENU);
  for (const r of LEGACY_REDIRECTS) {
    assert.ok(hrefs.includes(r.to), `${r.from} → ${r.to} không có trong menu`);
    assert.ok(!hrefs.some((h) => pathOf(h) === r.from), `${r.from} vừa chuyển hướng vừa còn trong menu`);
  }
  assert.deepEqual(nextRedirects().map((r) => r.source), LEGACY_REDIRECTS.map((r) => r.from));
  assert.ok(nextRedirects().every((r) => r.permanent));
});

test("không mất chức năng: mọi mục menu cũ còn trong cây mới, được chuyển hướng, hoặc có chỗ khác", () => {
  const hrefs = allMenuHrefs(ADMIN_MENU).map(pathOf);
  const moved = new Set([...LEGACY_REDIRECTS.map((r) => r.from), ...MOVED_OUT_OF_SIDEBAR.map((m) => m.href)]);
  assert.equal(OLD_MENU_HREFS.length, 120);
  for (const h of OLD_MENU_HREFS) assert.ok(hrefs.includes(h) || moved.has(h), `mất đường tới ${h}`);
});

test("học bạ: một mục menu duy nhất, 3 chế độ xem", () => {
  const items = ADMIN_MENU.flatMap((g) => g.items).filter((i) => /học bạ/i.test(i.label));
  assert.equal(items.length, 1);
  const hb = items[0]!;
  assert.equal(hb.href, "/ho-so-hoc-tap");
  assert.deepEqual(hb.tabs?.map((t) => t.href), ["/ho-so-hoc-tap", "/ho-so-hoc-tap?xem=hoc-ba-moc", "/ho-so-hoc-tap?xem=tra-cuu"]);
  assert.equal(activeNavItem("/report-cards/abc/5", ADMIN_MENU.flatMap((g) => g.items))?.label, hb.label);
  assert.equal(activeNavItem("/hoc-ba-moc/xyz", ADMIN_MENU.flatMap((g) => g.items))?.label, hb.label);
});

test("báo cáo: một mục menu, chỉ mục liệt kê đủ 8 báo cáo nghiệp vụ; 2 báo cáo tạm ở Công cụ kỹ thuật", () => {
  const items = ADMIN_MENU.flatMap((g) => g.items);
  assert.equal(items.filter((i) => i.href === "/bao-cao").length, 1);
  assert.equal(REPORTS.length, 8);
  const tools = ADMIN_MENU.find((g) => g.key === "tools")!;
  assert.ok(tools.tech);
  const toolHrefs = allMenuHrefs([tools]);
  assert.ok(toolHrefs.includes("/bao-cao/sau-go-live") && toolHrefs.includes("/bao-cao/chat-pilot"));
  assert.equal(activeNavItem("/bao-cao/sau-go-live", items)?.label, "Go-live");
  assert.equal(activeNavItem("/bao-cao/lead", items)?.label, "Báo cáo");
});

test("tô sáng: khớp tiền tố dài nhất", () => {
  const items = ADMIN_MENU.flatMap((g) => g.items);
  assert.equal(activeNavItem("/leads", items)?.label, "Lead");
  assert.equal(activeNavItem("/leads/0000/edit", items)?.label, "Lead");
  assert.equal(activeNavItem("/leads/import/registered", items)?.label, "Nhập khách hàng");
  assert.equal(activeNavItem("/crm/messenger", items)?.label, "Tin nhắn");
  assert.equal(activeNavItem("/crm/webhook-replay", items)?.label, "Chạy lại webhook");
  assert.equal(activeNavItem("/cham-cong/checkin", items)?.label, "Ca & công của tôi");
  assert.equal(activeNavItem("/cham-cong/ky-cong", items)?.label, "Chấm công");
  assert.equal(activeNavItem("/khong-co", items), undefined);
});

test("chip đang chọn theo truy vấn xem=", () => {
  const hb = ADMIN_MENU.flatMap((g) => g.items).find((i) => i.href === "/ho-so-hoc-tap")!;
  const tabs = hb.tabs!;
  assert.equal(activeTab("/ho-so-hoc-tap", {}, tabs)?.label, "Tổng quan chuẩn hồ sơ");
  assert.equal(activeTab("/ho-so-hoc-tap", { xem: "hoc-ba-moc", class: "x" }, tabs)?.href, "/ho-so-hoc-tap?xem=hoc-ba-moc");
  assert.equal(activeTab("/ho-so-hoc-tap", { xem: "tra-cuu" }, tabs)?.href, "/ho-so-hoc-tap?xem=tra-cuu");
  assert.equal(activeTab("/ho-so-hoc-tap/abc", {}, tabs), undefined);
  assert.deepEqual(queryOf("/a?xem=b&c=d%20e#x"), { xem: "b", c: "d e" });
  assert.equal(pathOf("/a/b?x=1#y"), "/a/b");
});

test("lọc theo quyền: chip không được phép bị bỏ, href mục = chip đầu được phép", () => {
  const hr = menuFor("CENTER_HR");
  const staff = hr.flatMap((g) => g.items).find((i) => i.label === "Nhân sự & giáo viên");
  assert.ok(staff);
  const training = menuFor("TRAINING").flatMap((g) => g.items).find((i) => i.label === "Nhân sự & giáo viên");
  assert.equal(training?.href, "/teachers", "Đào tạo chỉ có teacher:read → vào thẳng Giáo viên");
  assert.equal(training?.tabs?.length, 1);
  const teacher = menuFor("TEACHER");
  const all = allMenuHrefs(teacher);
  assert.ok(!all.includes("/users") && !all.includes("/chuyen-doi") && !all.includes("/hoi-thoai"));
  assert.ok(all.includes("/teaching-materials") && all.includes("/ho-so-hoc-tap?xem=tra-cuu") && !all.includes("/ho-so-hoc-tap?xem=hoc-ba-moc"));
  const sa = menuFor("SUPER_ADMIN");
  assert.equal(allMenuHrefs(sa).length, allMenuHrefs(ADMIN_MENU).length, "quản trị tối cao thấy mọi mục");
});

test("mỗi vai trò nhân sự đều có Tổng quan và ít nhất một nhóm mở sẵn", () => {
  for (const r of STAFF_ROLES) {
    const open = defaultOpenGroups(ADMIN_MENU, [r]);
    assert.ok(open.includes("overview"), r);
    assert.ok(menuFor(r).length >= 1, r);
  }
  assert.deepEqual(defaultOpenGroups(ADMIN_MENU, ["SUPER_ADMIN"]), ["overview", "system", "tools"]);
  assert.ok(!defaultOpenGroups(ADMIN_MENU, ["TEACHER"]).includes("tools"));
});

test("tìm menu không dấu", () => {
  assert.equal(foldVi("Học bạ & HỒ SƠ đường"), "hoc ba & ho so duong");
  const hits = searchMenu(ADMIN_MENU, "hoc ba");
  assert.equal(hits[0]?.item.href, "/ho-so-hoc-tap");
  assert.ok(searchMenu(ADMIN_MENU, "duyet anh").some((h) => h.href === "/duyet-media"));
  assert.ok(searchMenu(ADMIN_MENU, "otp").some((h) => h.href === "/otp-logs"));
  assert.deepEqual(searchMenu(ADMIN_MENU, "   "), []);
});

test("mọi đường dẫn trong menu có trang thật trong apps/web", () => {
  const root = fileURLToPath(new URL("../../../../apps/web/src/app/", import.meta.url));
  for (const h of [...allMenuHrefs(ADMIN_MENU), ...MOVED_OUT_OF_SIDEBAR.map((m) => m.href)]) {
    const p = pathOf(h);
    const ok = existsSync(`${root}(admin)${p}/page.tsx`) || existsSync(`${root}${p.slice(1)}/page.tsx`);
    assert.ok(ok, `thiếu trang cho ${h}`);
  }
  for (const r of LEGACY_REDIRECTS) assert.ok(!existsSync(`${root}(admin)${r.from}/page.tsx`), `${r.from} đã chuyển hướng — bỏ page.tsx cũ`);
});

test("bản kê cho kiểm thử PowerShell khớp cây menu (CAP_NHAT_MENU=1 để ghi lại)", () => {
  const file = fileURLToPath(new URL("../../../../scripts/kiem-thu/menu-manifest.json", import.meta.url));
  const want = JSON.stringify(menuManifest(), null, 2) + "\n";
  if (process.env.CAP_NHAT_MENU === "1") writeFileSync(file, want, "utf8");
  assert.ok(existsSync(file), "chưa có scripts/kiem-thu/menu-manifest.json — chạy test với CAP_NHAT_MENU=1");
  assert.equal(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), want, "menu-manifest.json cũ — chạy test với CAP_NHAT_MENU=1");
});

test("hàng rào trang: URL của mục bị ẩn → không vào được; mục hiện → vào được; trang ngoài menu → không áp", () => {
  const can = (role: Role) => { const a = actorOf(role); return (p: Parameters<typeof hasPermission>[1]) => hasPermission(a, p); };
  for (const role of STAFF_ROLES) {
    const shown = new Set(allMenuHrefs(menuFor(role)).map(pathOf));
    for (const href of allMenuHrefs(ADMIN_MENU)) {
      const path = pathOf(href);
      const ok = pageAllowed(ADMIN_MENU, path, can(role), strictOf(actorOf(role)));
      // Hiện trên menu ⇒ phải vào được (không bao giờ chặn nhầm thứ menu đưa tới)
      if (shown.has(path)) assert.equal(ok, true, `${role}: ${path} hiện trên menu nhưng hàng rào chặn`);
    }
  }
  assert.equal(pageAllowed(ADMIN_MENU, "/leads", can("CENTER_ACCOUNTANT")), false);
  assert.equal(pageAllowed(ADMIN_MENU, "/leads", can("SUPER_ADMIN")), true);
  assert.equal(pageAllowed(ADMIN_MENU, "/leads/00000000-0000-0000-0000-000000000000", can("CENTER_ACCOUNTANT")), null, "trang chi tiết tự kiểm quyền");
  assert.equal(pageAllowed(ADMIN_MENU, "/khong-co-trong-menu", can("TEACHER")), null);
  // menuOnly: trang tự kiểm quyền rộng hơn một cách có chủ ý
  assert.equal(pageAllowed(ADMIN_MENU, "/bao-cao/sau-go-live", can("CENTER_ACCOUNTANT")), true);
  assert.ok(pagePermLabel(ADMIN_MENU, "/leads").length > 0);
});

test("mục strict: người chỉ có quyền _own (giáo viên) không thấy trang danh sách / lịch tổng gọi service không kèm chủ sở hữu", () => {
  const hrefs = allMenuHrefs(menuFor("TEACHER"));
  for (const h of ["/lich", "/sessions", "/students", "/lop-trial", "/rooms", "/class-groups", "/classes/kiem-tra-lich", "/ho-so-hoc-tap?xem=hoc-ba-moc"]) {
    assert.ok(!hrefs.includes(h), `giáo viên không nên thấy ${h}`);
  }
  assert.ok(hrefs.includes("/classes"), "giáo viên vẫn thấy Lớp học (trang tự lọc lớp của mình)");
  assert.ok(allMenuHrefs(menuFor("CENTER_MANAGER")).includes("/lich"));
});
