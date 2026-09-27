import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caDangMo, caSapMo, khungCa, gioPhut, grantConHan, choDuyetConHan, trangThaiYeuCau, hanXem, loiLyDoXem, loiDuyetXem,
  PLAN_GRANT_MIN, PLAN_WINDOW_BEFORE_MIN, PLAN_WINDOW_AFTER_MIN,
} from "./planAccess.js";

const S = (id: string, date: string, start: string, end: string, status = "scheduled") => ({ id, date, startTime: start, endTime: end, status });
const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h! * 60 + mm!; };

test("khung ca: mở trước 30 phút, đóng sau giờ tan 15 phút", () => {
  assert.equal(PLAN_WINDOW_BEFORE_MIN, 30);
  assert.equal(PLAN_WINDOW_AFTER_MIN, 15);
  assert.deepEqual(khungCa({ startTime: "09:45:00", endTime: "11:15:00" }), { from: m("09:15"), to: m("11:30") });
  assert.equal(gioPhut(m("11:30")), "11:30");
});

test("caDangMo: trong khung → mở; ngoài khung / ngày khác / buổi huỷ → không", () => {
  const list = [S("a", "2026-09-27", "09:45", "11:15")];
  assert.equal(caDangMo(list, "2026-09-27", m("09:14")), null);
  assert.equal(caDangMo(list, "2026-09-27", m("09:15"))?.session.id, "a");
  assert.equal(caDangMo(list, "2026-09-27", m("11:29"))?.untilMin, m("11:30"));
  assert.equal(caDangMo(list, "2026-09-27", m("11:30")), null);
  assert.equal(caDangMo(list, "2026-09-28", m("10:00")), null);
  assert.equal(caDangMo([S("a", "2026-09-27", "09:45", "11:15", "cancelled")], "2026-09-27", m("10:00")), null);
  // Buổi đã hoàn tất vẫn mở tới hết khung
  assert.equal(caDangMo([S("a", "2026-09-27", "09:45", "11:15", "completed")], "2026-09-27", m("11:20"))?.session.id, "a");
});

test("caSapMo: ca gần nhất chưa mở", () => {
  const list = [S("b", "2026-09-30", "18:00", "19:30"), S("a", "2026-09-27", "18:00", "19:30")];
  assert.deepEqual(caSapMo(list, "2026-09-27", m("16:00")), { session: list[1], fromMin: m("17:30") });
  assert.equal(caSapMo(list, "2026-09-27", m("17:45"))?.session.id, "b");
  assert.equal(caSapMo([], "2026-09-27", 0), null);
});

test("hạn duyệt: 2 giờ; hết hạn → không còn quyền", () => {
  assert.equal(PLAN_GRANT_MIN, 120);
  const at = new Date("2026-09-27T08:00:00Z");
  const exp = hanXem(at);
  assert.equal(exp.toISOString(), "2026-09-27T10:00:00.000Z");
  assert.equal(grantConHan({ status: "approved", expiresAt: exp }, new Date("2026-09-27T09:59:00Z")), true);
  assert.equal(grantConHan({ status: "approved", expiresAt: exp }, new Date("2026-09-27T10:00:00Z")), false);
  assert.equal(grantConHan({ status: "revoked", expiresAt: exp }, new Date("2026-09-27T09:00:00Z")), false);
  assert.equal(grantConHan({ status: "pending", expiresAt: null }, at), false);
  assert.equal(trangThaiYeuCau({ status: "approved", expiresAt: exp, createdAt: at }, new Date("2026-09-27T11:00:00Z")), "expired");
});

test("yêu cầu chờ quá 24 giờ hết hiệu lực", () => {
  const c = new Date("2026-09-26T08:00:00Z");
  assert.equal(choDuyetConHan({ status: "pending", createdAt: c }, new Date("2026-09-27T07:59:00Z")), true);
  assert.equal(choDuyetConHan({ status: "pending", createdAt: c }, new Date("2026-09-27T08:00:00Z")), false);
  assert.equal(trangThaiYeuCau({ status: "pending", expiresAt: null, createdAt: c }, new Date("2026-09-27T09:00:00Z")), "expired");
});

test("lý do xin xem: bắt buộc 10–300 ký tự", () => {
  assert.ok(loiLyDoXem(""));
  assert.ok(loiLyDoXem("   ngắn   "));
  assert.equal(loiLyDoXem("Dạy thay lớp Sata4 chiều mai"), null);
  assert.ok(loiLyDoXem("x".repeat(301)));
});

test("duyệt: không tự duyệt; chỉ duyệt khi chờ; từ chối cần lý do; thu hồi khi còn hạn", () => {
  const now = new Date("2026-09-27T08:00:00Z");
  const r = { status: "pending", requestedBy: "gv", createdAt: new Date("2026-09-27T07:00:00Z"), expiresAt: null };
  assert.match(loiDuyetXem(r, "approve", "gv", null, now)!, /tự duyệt/);
  assert.equal(loiDuyetXem(r, "approve", "ql", null, now), null);
  assert.match(loiDuyetXem(r, "reject", "ql", "", now)!, /lý do/);
  assert.equal(loiDuyetXem(r, "reject", "ql", "Không đúng lớp dạy", now), null);
  assert.match(loiDuyetXem({ ...r, status: "approved", expiresAt: new Date("2026-09-27T09:00:00Z") }, "approve", "ql", null, now)!, /chờ duyệt/);
  assert.equal(loiDuyetXem({ ...r, status: "approved", expiresAt: new Date("2026-09-27T09:00:00Z") }, "revoke", "ql", null, now), null);
  assert.match(loiDuyetXem({ ...r, status: "approved", expiresAt: new Date("2026-09-27T07:30:00Z") }, "revoke", "ql", null, now)!, /còn hạn/);
  assert.match(loiDuyetXem({ ...r, createdAt: new Date("2026-09-26T07:00:00Z") }, "approve", "ql", null, now)!, /24 giờ/);
});
