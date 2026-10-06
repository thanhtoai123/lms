import { test } from "node:test";
import assert from "node:assert/strict";
import { teacherTabOf, teacherMoreGroups, teacherSidebar, sidebarActiveHref, TEACHER_PRIMARY, buoiNoiBat, thoiLuongVi, dauTuan, phutTrongNgay, gioVietNam } from "./giaoVien.js";
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
  assert.equal(teacherTabOf("/teacher/lich?tuan=2026-09-28"), "schedule");
  assert.equal(teacherTabOf("/teacher/giao-an/abc"), "classes");
  assert.equal(teacherTabOf("/teacher/hoc-vien"), "classes");
  assert.equal(teacherTabOf("/teacher/anh-lop"), "classes");
  assert.equal(teacherTabOf("/assignments"), "more");
  assert.equal(teacherTabOf("/classesx"), "more");
  assert.equal(teacherTabOf("/teacherx"), "more");
});

test("mục chính: 5 mục, đường dẫn không trùng", () => {
  assert.equal(TEACHER_PRIMARY.length, 5);
  assert.equal(new Set(TEACHER_PRIMARY.map((t) => t.href)).size, 5);
});

test("Thêm của giáo viên: có bài tập, tin nhắn; không có Dashboard / Lớp học / Ca & công / Hồ sơ học tập (giáo viên không đủ quyền)", () => {
  const actor = { userId: "u", personId: null, assignments: [{ role: "TEACHER", centerId: "c1" }], extraPermissions: [] } as unknown as Actor;
  const nav = filterMenu(ADMIN_MENU, (p) => hasPermission(actor, p), (p) => { const c = centersWith(actor, p); return c === null || c.length > 0; });
  const hrefs = teacherMoreGroups(nav).flatMap((g) => g.items.map((i) => i.href));
  for (const h of ["/assignments", "/tin-nhan", "/huong-dan"]) assert.ok(hrefs.includes(h), h);
  for (const h of ["/dashboard", "/classes", "/cham-cong/lich-ca", "/ho-so-hoc-tap"]) assert.ok(!hrefs.includes(h), h);
  // Việc văn phòng / danh mục của bộ phận đào tạo không nằm trong "Thêm" của giáo viên; "Tài liệu lớp tôi" (dành riêng cho GV) vẫn còn
  for (const h of ["/viec-hom-nay", "/curriculums", "/courses", "/lo-trinh", "/documents"]) assert.ok(!hrefs.includes(h), h);
  assert.ok(hrefs.includes("/teaching-materials"));
});

const B = (id: string, date: string, start: string, end: string, status = "scheduled") => ({ id, date, startTime: start, endTime: end, status });

test("buoiNoiBat: đang trong giờ → đang dạy, còn bao nhiêu phút", () => {
  const r = buoiNoiBat([B("a", "2026-09-27", "09:45:00", "11:15:00")], "2026-09-27", phutTrongNgay("10:33"));
  assert.equal(r?.kind, "dang-day");
  assert.equal(r?.kind === "dang-day" && r.minutesLeft, 42);
});

test("buoiNoiBat: đã bấm Bắt đầu mà quá giờ → vẫn đang dạy, phút âm", () => {
  const r = buoiNoiBat([B("a", "2026-09-27", "09:45", "11:15", "in_progress")], "2026-09-27", phutTrongNgay("11:30"));
  assert.equal(r?.kind, "dang-day");
  assert.equal(r?.kind === "dang-day" && r.minutesLeft, -15);
});

test("buoiNoiBat: chưa tới giờ → sắp tới, đếm phút; ngày sau → null phút", () => {
  const list = [B("a", "2026-09-27", "18:00", "19:30"), B("b", "2026-09-30", "18:00", "19:30")];
  const r = buoiNoiBat(list, "2026-09-27", phutTrongNgay("17:00"));
  assert.equal(r?.kind === "sap-toi" && r.session.id, "a");
  assert.equal(r?.kind === "sap-toi" && r.minutesUntil, 60);
  const done = [B("a", "2026-09-27", "18:00", "19:30", "completed"), list[1]!];
  const r2 = buoiNoiBat(done, "2026-09-27", phutTrongNgay("20:00"));
  assert.equal(r2?.kind === "sap-toi" && r2.session.id, "b");
  assert.equal(r2?.kind === "sap-toi" && r2.minutesUntil, null);
});

test("buoiNoiBat: bỏ buổi huỷ / đã xong; không còn buổi → null", () => {
  const list = [B("a", "2026-09-27", "09:00", "10:00", "cancelled"), B("b", "2026-09-27", "09:00", "10:00", "completed")];
  assert.equal(buoiNoiBat(list, "2026-09-27", phutTrongNgay("09:30")), null);
});

test("thoiLuongVi, dauTuan", () => {
  assert.equal(thoiLuongVi(42), "42 phút");
  assert.equal(thoiLuongVi(65), "1 giờ 5 phút");
  assert.equal(thoiLuongVi(120), "2 giờ");
  assert.equal(dauTuan("2026-09-27"), "2026-09-21"); // CN → T2 trước đó
  assert.equal(dauTuan("2026-09-28"), "2026-09-28"); // T2
  assert.equal(dauTuan("2026-10-01"), "2026-09-28");
});

test("gioVietNam: 17:30 UTC = 00:30 hôm sau ở Việt Nam", () => {
  assert.deepEqual(gioVietNam(new Date("2026-09-27T17:30:00Z")), { today: "2026-09-28", nowMin: 30 });
});

test("buoiNoiBat: buổi hôm nay hết giờ chưa chốt → cần chốt; nhưng buổi sắp dạy trong 60 phút được ưu tiên", () => {
  const xong = B("a", "2026-09-27", "09:45", "11:15");
  const chieu = B("b", "2026-09-27", "18:00", "19:30");
  const r = buoiNoiBat([xong, chieu], "2026-09-27", phutTrongNgay("16:00"));
  assert.equal(r?.kind, "can-chot");
  assert.equal(r?.kind === "can-chot" && r.minutesAgo, 285);
  const r2 = buoiNoiBat([xong, chieu], "2026-09-27", phutTrongNgay("17:15"));
  assert.equal(r2?.kind === "sap-toi" && r2.session.id, "b");
  const r3 = buoiNoiBat([B("a", "2026-09-27", "09:45", "11:15", "completed")], "2026-09-27", phutTrongNgay("16:00"));
  assert.equal(r3, null);
});

test("sidebar giáo viên: mục chung chỉ hiện khi có quyền, nhóm rỗng bị bỏ", () => {
  const none = teacherSidebar([]);
  const labels = (g: ReturnType<typeof teacherSidebar>) => g.flatMap((x) => x.items.map((i) => i.label));
  assert.deepEqual(labels(none), ["Tổng quan", "Lớp của tôi", "Lịch làm việc", "Giáo án", "Học viên", "Ảnh lớp", "Chấm công", "Thêm chức năng"]);
  assert.ok(!none.some((g) => g.label === "Học thử"), "không có quyền học thử thì không có nhóm Học thử");
  const withPerm = teacherSidebar([{ key: "x", label: "x", roles: [], items: [{ label: "Bài tập về nhà", href: "/assignments" }, { label: "Học bù", href: "/hoc-bu" }] }]);
  assert.ok(labels(withPerm).includes("Bài tập") && labels(withPerm).includes("Học bù"));
  assert.ok(withPerm.some((g) => g.label === "Học thử"));
});

test("sidebarActiveHref: khớp tiền tố dài nhất, Tổng quan chỉ đúng trang chủ + buổi dạy", () => {
  const g = teacherSidebar([]);
  assert.equal(sidebarActiveHref("/teacher", g), "/teacher");
  assert.equal(sidebarActiveHref("/teacher/sessions/abc/quet", g), "/teacher");
  assert.equal(sidebarActiveHref("/teacher/classes", g), "/teacher/classes");
  assert.equal(sidebarActiveHref("/classes/xyz", g), "/teacher/classes");
  assert.equal(sidebarActiveHref("/teacher/hoc-vien", g), "/teacher/hoc-vien");
  assert.equal(sidebarActiveHref("/teacher/anh-lop", g), "/teacher/anh-lop");
  assert.equal(sidebarActiveHref("/cham-cong/lich-ca?period=2026-09", g), "/cham-cong/lich-ca");
  assert.equal(sidebarActiveHref("/teacher/them", g), "/teacher/them");
  assert.equal(sidebarActiveHref("/dashboard", g), null);
});
