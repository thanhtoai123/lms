import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reactionPlan, validateReaction, reactionOf, reactionEditable, reactionCounts, isSessionReaction, REACTION_RATING, PARENT_CONCERN_TASK,
  pickLatestSheet, sheetGlance, shiftMonth, monthRange, monthLabel, normalizeMonth, monthGrid, weekGrid, sessionTone,
  completionPercent, buildJourney, pickChild, childShortName, type JourneyCourseInput,
} from "./family.js";
import { studentRisk, milestonesDue, prepNotes } from "./teacher.js";
import { feedbackPriority } from "../care/rules.js";

/* ---------------- Phản hồi sau buổi → việc chăm sóc ---------------- */

test("phản hồi: Rất vui / Ổn không mở việc, Cần trao đổi mở việc chăm sóc 24h", () => {
  const happy = reactionPlan("happy", "  Con kể về robot cả tối  ", { studentName: "An", sessionLabel: "buổi 5" });
  assert.equal(happy.rating, 5);
  assert.equal(happy.priority, "normal");
  assert.equal(happy.care, null);
  assert.equal(happy.comment, "Con kể về robot cả tối");
  const ok = reactionPlan("ok", "", { studentName: "An", sessionLabel: "buổi 5" });
  assert.equal(ok.rating, 4);
  assert.equal(ok.comment, null);
  assert.equal(ok.care, null);
  const c = reactionPlan("concern", null, { studentName: "An", sessionLabel: "buổi 5" });
  assert.equal(c.rating, 2);
  assert.equal(c.priority, "urgent");
  assert.ok(c.care);
  assert.equal(c.care!.code, PARENT_CONCERN_TASK);
  assert.equal(c.care!.hours, 24);
  assert.match(c.care!.title, /buổi 5 của An/);
});

test("phản hồi: điểm quy đổi khớp mức ưu tiên của bảng đánh giá sẵn có", () => {
  assert.equal(feedbackPriority(REACTION_RATING.happy), "normal");
  assert.equal(feedbackPriority(REACTION_RATING.ok), "normal");
  assert.equal(feedbackPriority(REACTION_RATING.concern), "urgent");
});

test("phản hồi: kiểm tra đầu vào, cửa sổ 14 ngày, buổi tương lai", () => {
  assert.deepEqual(validateReaction({ reaction: "happy" }, "2026-09-20", "2026-09-22"), []);
  assert.ok(validateReaction({ reaction: "wow" }, "2026-09-20", "2026-09-22").length);
  assert.ok(validateReaction({ reaction: "ok", note: "x".repeat(301) }, "2026-09-20", "2026-09-22").length);
  assert.ok(validateReaction({ reaction: "ok" }, "2026-09-23", "2026-09-22")[0]!.includes("chưa diễn ra"));
  assert.ok(validateReaction({ reaction: "ok" }, "2026-09-01", "2026-09-22").length);
  assert.deepEqual(validateReaction({ reaction: "ok" }, "2026-09-08", "2026-09-22"), []);
  assert.equal(isSessionReaction("concern"), true);
  assert.equal(isSessionReaction(null), false);
});

test("phản hồi: dòng cũ theo sao, quyền sửa, đếm", () => {
  assert.equal(reactionOf({ rating: 5 }), "happy");
  assert.equal(reactionOf({ rating: 3 }), "ok");
  assert.equal(reactionOf({ rating: 2 }), "concern");
  assert.equal(reactionOf({ reaction: "ok", rating: 1 }), "ok");
  assert.equal(reactionEditable(null), true);
  assert.equal(reactionEditable({ channel: "app", status: "new" }), true);
  assert.equal(reactionEditable({ channel: "zalo", status: "new" }), false);
  assert.equal(reactionEditable({ channel: "app", status: "acknowledged" }), false);
  assert.deepEqual(reactionCounts([{ reaction: "happy" }, { reaction: "happy" }, { reaction: "concern" }]), { happy: 2, ok: 0, concern: 1 });
});

/* ---------------- Phiếu gần nhất ---------------- */

test("chọn phiếu gần nhất: theo ngày → số buổi → lúc phát hành", () => {
  assert.equal(pickLatestSheet([]), null);
  const a = { id: "a", date: "2026-09-10", sequenceNo: 3, publishedAt: "2026-09-10T12:00:00Z" };
  const b = { id: "b", date: "2026-09-17", sequenceNo: 4, publishedAt: "2026-09-17T12:00:00Z" };
  const c = { id: "c", date: "2026-09-17", sequenceNo: 5001, publishedAt: "2026-09-17T11:00:00Z" };
  const d = { id: "d", date: "2026-09-17", sequenceNo: 5001, publishedAt: "2026-09-18T08:00:00Z" };
  assert.equal(pickLatestSheet([b, a])!.id, "b");
  assert.equal(pickLatestSheet([a, c, b])!.id, "c");
  assert.equal(pickLatestSheet([d, c])!.id, "d");
});

test("tóm tắt phiếu: trung bình, số tiêu chí đạt, mạnh nhất, cần luyện", () => {
  const g = sheetGlance([{ label: "Lập trình", value: 4 }, { label: "Lắp ráp", value: 3 }, { label: "Trình bày", value: 2 }, { label: "Nhóm", value: null }]);
  assert.equal(g.average, 3);
  assert.equal(g.reached, 2);
  assert.equal(g.rated, 3);
  assert.equal(g.best, "Lập trình");
  assert.equal(g.practice, "Trình bày");
  const none = sheetGlance([{ label: "A", value: null }]);
  assert.equal(none.average, null);
  assert.equal(sheetGlance([{ label: "A", value: 2 }]).best, null);
});

/* ---------------- Lịch tháng ---------------- */

test("tháng: dịch tháng qua năm, khoảng ngày, nhãn, chuẩn hoá", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-09", -13), "2025-08");
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(monthLabel("2026-09"), "Tháng 9/2026");
  assert.equal(normalizeMonth("2026-13", "2026-09-22"), "2026-09");
  assert.equal(normalizeMonth("abc", "2026-09-22"), "2026-09");
  assert.equal(normalizeMonth("2031-01", "2026-09-22"), "2026-09");
  assert.equal(normalizeMonth("2026-10", "2026-09-22"), "2026-10");
});

test("lưới tháng: tuần bắt đầu Thứ Hai, phủ trọn tháng, xếp buổi theo giờ, đánh dấu nghỉ lễ", () => {
  // 09/2026: ngày 1 là Thứ Ba, ngày 30 là Thứ Tư
  const entries = [
    { date: "2026-09-20", start: "15:45", id: "chieu" },
    { date: "2026-09-20", start: "09:45", id: "sang" },
    { date: "2026-10-01", start: "18:00", id: "thang-sau" },
  ];
  const g = monthGrid("2026-09", entries, [{ date: "2026-09-02", name: "Quốc khánh" }], "2026-09-22");
  assert.equal(g.label, "Tháng 9/2026");
  assert.equal(g.weeks.length, 5);
  assert.ok(g.weeks.every((w) => w.length === 7));
  assert.equal(g.weeks[0]![0]!.date, "2026-08-31");
  assert.equal(g.weeks[0]![0]!.inMonth, false);
  assert.equal(g.weeks[0]![0]!.weekday, 1);
  assert.equal(g.weeks[4]![6]!.date, "2026-10-04");
  const all = g.weeks.flat();
  assert.deepEqual(all.find((d) => d.date === "2026-09-20")!.entries.map((e) => e.id), ["sang", "chieu"]);
  assert.equal(all.find((d) => d.date === "2026-09-02")!.holiday, "Quốc khánh");
  assert.equal(all.find((d) => d.date === "2026-09-22")!.isToday, true);
  // Buổi tháng sau vẫn hiện ở ô đệm cuối lưới (không mất khi PH nhìn tuần cuối)
  assert.equal(all.find((d) => d.date === "2026-10-01")!.entries.length, 1);
  assert.equal(all.find((d) => d.date === "2026-10-01")!.inMonth, false);
});

test("lưới tháng: tháng 2/2027 bắt đầu Thứ Hai → 4 tuần", () => {
  const g = monthGrid("2027-02", [], [], "2027-02-10");
  assert.equal(g.weeks.length, 4);
  assert.equal(g.weeks[0]![0]!.date, "2027-02-01");
});

test("lưới tuần: 7 ngày từ Thứ Hai của tuần chứa ngày neo", () => {
  const w = weekGrid("2026-09-24", [{ date: "2026-09-27", start: "09:45" }], [], "2026-09-22");
  assert.equal(w.length, 7);
  assert.equal(w[0]!.date, "2026-09-21");
  assert.equal(w[6]!.date, "2026-09-27");
  assert.equal(w[6]!.entries.length, 1);
  assert.equal(w[1]!.isToday, true);
});

test("trạng thái buổi trên lịch của con", () => {
  const base = { today: "2026-09-22", sessionStatus: "completed" };
  assert.equal(sessionTone({ ...base, date: "2026-09-20", attendance: "present" }).tone, "done");
  assert.equal(sessionTone({ ...base, date: "2026-09-20", attendance: "absent_excused" }).label, "Vắng có phép");
  assert.equal(sessionTone({ ...base, date: "2026-09-20", attendance: "makeup" }).tone, "makeup");
  assert.equal(sessionTone({ date: "2026-09-25", today: "2026-09-22", sessionStatus: "scheduled", attendance: null }).tone, "upcoming");
  assert.equal(sessionTone({ date: "2026-09-22", today: "2026-09-22", sessionStatus: "scheduled", attendance: null }).label, "Hôm nay");
  assert.equal(sessionTone({ date: "2026-09-25", today: "2026-09-22", sessionStatus: "scheduled", attendance: null, absenceRequested: true }).tone, "requested");
  assert.equal(sessionTone({ date: "2026-09-25", today: "2026-09-22", sessionStatus: "cancelled", attendance: null }).tone, "cancelled");
  assert.equal(sessionTone({ date: "2026-09-19", today: "2026-09-22", sessionStatus: "in_progress", attendance: null }).tone, "pending");
});

/* ---------------- Dòng thời gian lộ trình ---------------- */

const course = (over: Partial<JourneyCourseInput>): JourneyCourseInput => ({
  enrollmentId: "e1", courseName: "Sata4", courseCode: "SATA4", className: "Sata4 sáng CN", status: "active", statusLabel: "Đang học",
  from: "2026-08-25", to: null, sessionsDone: 6, sessionsTotal: 12, milestones: [], certificate: null, ...over,
});

test("% hoàn thành buổi", () => {
  assert.equal(completionPercent(6, 12), 50);
  assert.equal(completionPercent(13, 12), 100);
  assert.equal(completionPercent(1, 3), 33);
  assert.equal(completionPercent(3, 0), null);
});

test("dòng thời gian: gộp khoá, học bạ, chứng nhận khoá và lộ trình theo ngày", () => {
  const j = buildJourney([
    course({
      enrollmentId: "e1", courseName: "Sata1", status: "completed", statusLabel: "Hoàn thành", from: "2025-06-01", to: "2025-09-01", sessionsDone: 12, sessionsTotal: 12,
      milestones: [{ id: "r1", label: "buổi 5", date: "2025-07-05", average: 3.1 }],
      certificate: { number: "SR-1", issuedAt: "2025-09-05", verifyPath: "/cn/abc", certificateId: "c1" },
    }),
    course({ enrollmentId: "e2", courseName: "Sata4", from: "2026-08-25" }),
    course({ enrollmentId: "e3", courseName: "Sata6", status: "trial", from: null }),
  ], [{ number: "CN-CS2-26-000001", title: "Robotics nền tảng", issuedAt: "2026-01-10", verifyPath: "/cn/xyz", certificateId: "p1" }]);
  assert.deepEqual(j.map((x) => x.key), ["c:e1", "m:r1", "cc:SR-1", "cp:CN-CS2-26-000001", "c:e2", "c:e3"]);
  const first = j[0]!;
  assert.equal(first.kind, "course");
  if (first.kind === "course") {
    assert.equal(first.state, "done");
    assert.equal(first.percent, 100);
  }
  const cert = j.find((x) => x.kind === "certificate" && x.path);
  assert.ok(cert && cert.kind === "certificate" && cert.verifyPath === "/cn/xyz");
  const last = j[j.length - 1]!;
  assert.equal(last.kind === "course" && last.state, "active");
});

test("dòng thời gian: cùng ngày thì khoá → học bạ → chứng nhận", () => {
  const j = buildJourney([course({ from: "2026-09-01", milestones: [{ id: "m", label: "buổi 5", date: "2026-09-01", average: null }], certificate: { number: "N", issuedAt: "2026-09-01", verifyPath: null, certificateId: null } })]);
  assert.deepEqual(j.map((x) => x.kind), ["course", "milestone", "certificate"]);
});

test("nhiều con: chọn đúng con, không thuộc danh sách thì con đầu; tên chip", () => {
  const kids = [{ id: "a", fullName: "Nguyễn Văn An" }, { id: "b", fullName: "Nguyễn Thị Minh Anh" }];
  assert.equal(pickChild(kids, "b")!.id, "b");
  assert.equal(pickChild(kids, "zzz")!.id, "a");
  assert.equal(pickChild(kids, null)!.id, "a");
  assert.equal(pickChild([], "a"), null);
  assert.equal(childShortName({ fullName: "Nguyễn Thị Minh Anh" }), "Minh Anh");
  assert.equal(childShortName({ fullName: "Học viên mẫu 11" }), "Học viên mẫu 11");
  assert.equal(childShortName({ fullName: "Nguyễn Văn An", nickname: " Bin " }), "Bin");
});

/* ---------------- App giáo viên ---------------- */

test("nguy cơ: vắng liên tiếp / vắng nhiều / mức giảm", () => {
  assert.deepEqual(studentRisk({ recent: ["present", "present", "late"], averages: [3, 3, 3] }), { level: null, reasons: [] });
  const streak = studentRisk({ recent: ["present", "absent_excused", "absent_unexcused"], averages: [] });
  assert.equal(streak.level, "high");
  assert.match(streak.reasons[0]!, /2 buổi liên tiếp/);
  const many = studentRisk({ recent: ["absent_excused", "present", "absent_unexcused", "present", "absent_excused", "present"], averages: [] });
  assert.equal(many.level, "high");
  assert.match(many.reasons[0]!, /3\/6/);
  assert.equal(studentRisk({ recent: ["absent_excused", "present", "absent_excused", "present", null], averages: [] }).level, "watch");
  // Chỉ xét 6 buổi gần nhất
  assert.equal(studentRisk({ recent: ["absent_excused", "absent_excused", "absent_excused", "present", "present", "present", "present", "present", "present"], averages: [] }).level, null);
  const drop = studentRisk({ recent: [], averages: [3.5, 3.5, 3.4, 2.8, 2.8, 2.9] });
  assert.equal(drop.level, "high");
  assert.match(drop.reasons[0]!, /giảm rõ/);
  assert.equal(studentRisk({ recent: [], averages: [3.4, 3.4, 3.4, 3.0, 3.1, 3.1] }).level, "watch");
  assert.equal(studentRisk({ recent: [], averages: [1.5, 1.8] }).level, "watch");
});

test("học bạ mốc: đã tới hạn chưa viết / sắp tới", () => {
  assert.deepEqual(milestonesDue({ done: 6, milestones: [5, 12, 17, 24], written: [] }), [{ seq: 5, state: "due", left: 0 }]);
  assert.deepEqual(milestonesDue({ done: 6, milestones: [5, 12], written: [5] }), []);
  assert.deepEqual(milestonesDue({ done: 10, milestones: [5, 12], written: [5] }), [{ seq: 12, state: "soon", left: 2 }]);
  assert.deepEqual(milestonesDue({ done: 10, milestones: [12, 5, 12], written: [5], window: 1 }), []);
});

test("ghi chú chuẩn bị: sức khoẻ trước, rồi vắng, PH, học thử, khen", () => {
  const n = prepNotes({ healthNotes: " Dị ứng đậu phộng ", allergies: ["tôm"], lastStatus: "absent_excused", parentConcern: true, trial: true, highlights: ["Sáng tạo", "Sáng tạo", "Kiên trì"] });
  assert.deepEqual(n.map((x) => x.tone), ["danger", "danger", "warn", "warn", "info", "good"]);
  assert.equal(n[0]!.text, "Dị ứng: tôm");
  assert.equal(n[5]!.text, "Nổi bật gần đây: Sáng tạo, Kiên trì");
  assert.deepEqual(prepNotes({ lastStatus: "present" }), []);
});
