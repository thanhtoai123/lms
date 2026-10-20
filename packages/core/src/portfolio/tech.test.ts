import test from "node:test";
import assert from "node:assert/strict";
import { buildTechProfile, competencyProfile, techCourseView } from "./tech.js";
import type { MilestoneCardView, PortfolioCourseView, PortfolioView, SessionSheetView } from "./view.js";

const sheet = (seq: number, product: string | null = null): SessionSheetView => ({
  id: `s${seq}`, status: "published", revision: 1, publishedAt: `2026-09-${String(seq).padStart(2, "0")}T10:00:00Z`,
  snapshot: { version: "x", scale: 3, criteria: [], context: { date: `2026-09-${String(seq).padStart(2, "0")}`, startTime: null, sequenceNo: seq, label: `Buổi ${seq}`, makeup: false, lessonTitle: null, lessonObjectives: null, teacherName: null, className: null, classCode: null, courseName: null, courseCode: null, centerName: null, studentName: "Bé", studentCode: null } } as never,
  objectiveResult: null, highlights: [], productNote: product, remark: null, media: [], average: 2.5, center: null,
});
const card = (seq: number, publishedAt: string, scores: [string, number][], scale = 3): MilestoneCardView => ({
  id: `m${seq}`, milestoneSeq: seq, label: `Học bạ buổi ${seq}`, publishedAt, scale,
  scores: scores.map(([label, score]) => ({ label, score, comment: null, average: null, trend: null })),
  average: scores.reduce((a, [, s]) => a + s, 0) / scores.length, teacherComment: "Con tiến bộ rõ.", strengths: "Tự tin", improvements: null,
  aggregate: null, className: null, courseName: null, studentName: "Bé", authorName: "GV Minh (mẫu)",
});
const course = (over: Partial<PortfolioCourseView>): PortfolioCourseView => ({
  enrollmentId: "e1", courseCode: "ROBO-TH-N1", courseName: "Lập trình robot ảo với RoboSim", courseLevel: null, className: "Lớp", classCode: "ONL.ROBO-TH-N1.26.001",
  centerName: "TH STEAM Academy Online", status: "active", statusLabel: "Đang học", from: "2026-09-01", to: null,
  attendance: { present: 0, late: 0, makeup: 0, excused: 0, absent: 0, total: 0, rate: null }, sheets: [], milestones: [], certificate: null, radar: [], average: null, ...over,
});
const view = (courses: PortfolioCourseView[]): PortfolioView => ({
  student: { fullName: "Học viên mẫu 1", code: "ONL-26-000001", grade: 4, avatarUrl: null }, center: null, scopeLabel: "Toàn bộ", period: { from: null, to: null },
  generatedAt: "2026-10-20T00:00:00Z", courses, progress: [], attendance: { present: 0, late: 0, makeup: 0, excused: 0, absent: 0, total: 0, rate: null },
  certificates: [], gallery: [], totals: { sheets: 0, milestones: 0, courses: courses.length, average: null },
});

test("hồ sơ công nghệ: khoá năm học → chương trình, 3 học phần × 15 buổi, trạng thái theo học bạ buổi báo cáo", () => {
  const sheets = [...Array.from({ length: 15 }, (_, i) => sheet(i + 1)), sheet(16), sheet(17, "Robot ảo đi theo vạch")];
  const c = course({ sheets, milestones: [card(15, "2026-12-10T10:00:00Z", [["Tư duy công nghệ", 3], ["Chăm chỉ", 2]])] });
  const t = techCourseView(c);
  assert.equal(t.kind, "year");
  assert.equal(t.programCode, "ROBO-TH");
  assert.match(t.programTitle ?? "", /Robotics/);
  assert.equal(t.yearNo, 1);
  assert.equal(t.yearsTotal, 2);
  assert.equal(t.modules.length, 3);
  assert.deepEqual(t.modules.map((m) => [m.fromSeq, m.toSeq, m.sessionsDone, m.status]), [[1, 15, 15, "done"], [16, 30, 2, "in_progress"], [31, 45, 0, "upcoming"]]);
  assert.equal(t.modules[0]!.levelLabel, "Tốt"); // TB 2,5 → làm tròn mức 3
  assert.equal(t.sessionsTotal, 45);
  // khoá ngoài danh mục chuẩn vẫn hiện được
  const other = techCourseView(course({ courseCode: "KHAC-1", courseLevel: "Cơ bản" }));
  assert.equal(other.kind, "other");
  assert.equal(other.modules.length, 0);
  assert.equal(other.levelLabel, "Cơ bản");
  // học đủ 15 buổi mà chưa có học bạ → chờ học bạ báo cáo
  const w = techCourseView(course({ sheets: Array.from({ length: 15 }, (_, i) => sheet(i + 1)) }));
  assert.equal(w.modules[0]!.status, "waiting");
});

test("bức tranh năng lực: 6 năng lực + 3 phẩm chất theo học bạ mới nhất, mô tả mức theo chương trình", () => {
  const c = course({
    milestones: [
      card(15, "2026-12-10T10:00:00Z", [["Tư duy công nghệ", 1]]),
      card(30, "2027-03-10T10:00:00Z", [["Tư duy công nghệ", 3], ["Trung thực", 2], ["Kỹ năng vi tính", 4]], 4),
    ],
  });
  const p = competencyProfile(view([c]));
  assert.deepEqual(p.groups.map((g) => [g.name, g.kind, g.items.length]), [["Tư duy", "nang-luc", 2], ["Kỹ năng số", "nang-luc", 2], ["Bản lĩnh", "nang-luc", 2], ["Phẩm chất", "pham-chat", 3]]);
  const tdcn = p.groups[0]!.items[0]!;
  assert.equal(tdcn.levelLabel, "Đạt"); // học bạ thang 4 → quy về thang 3: 3/4 → 2,3 → Đạt
  assert.ok(tdcn.hint && tdcn.desc, "có mô tả mức và ý nghĩa năng lực");
  assert.equal(p.groups[1]!.items[0]!.levelLabel, "Tốt"); // 4/4 → 3
  assert.match(p.source ?? "", /Học bạ buổi 30/);
  assert.equal(p.counts.chuaCo, 6);
  // chưa có học bạ: dùng trung bình phiếu buổi
  const p2 = competencyProfile(view([course({ radar: [{ label: "Chăm chỉ", value: 2.6 }] })]));
  assert.match(p2.source ?? "", /Trung bình các phiếu buổi/);
  assert.equal(p2.groups[3]!.items[0]!.levelLabel, "Tốt");
});

test("hồ sơ công nghệ: sản phẩm mới nhất trước, nhận xét giáo viên của học bạ mới nhất, số liệu bìa", () => {
  const c = course({ sheets: [sheet(3, "Robot đi thẳng"), sheet(9, "Robot rẽ trái"), sheet(10, "  ")], milestones: [card(15, "2026-12-10T10:00:00Z", [["Chăm chỉ", 3]])] });
  const t = buildTechProfile(view([c]));
  assert.deepEqual(t.products.map((p) => p.text), ["Robot rẽ trái", "Robot đi thẳng"]);
  assert.equal(t.teacherNote?.comment, "Con tiến bộ rõ.");
  assert.equal(t.stats.modulesDone, 1);
  assert.equal(t.current?.courseCode, "ROBO-TH-N1");
});
