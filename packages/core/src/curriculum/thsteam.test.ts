import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TH_TRACKS, TH_PROGRAMS, TH_PRICING, TH_SESSIONS_PER_YEAR, thCourseSpecs, thPathSpecs, yearLessonPlan, examLessonPlan, parseSyllabus,
  programCriteria, sessionRole, gradeOfAge, programTitle, examCourseName, thProgram, TH_CRITERIA_ORDER,
  TH_YEAR_NAMING, yearCourseCode, yearCourseName, moduleTitle,
} from "./thsteam.js";
import { validateCriterion } from "../portfolio/standard.js";
import { reportCardMilestones } from "../reportcards/rules.js";
import { RUBRIC_SCALE } from "../portfolio/rubric.js";

test("danh mục: 4 chuyên ngành, 9 chương trình theo cấp học, mỗi chương trình thuộc đúng một chuyên ngành", () => {
  assert.deepEqual(TH_TRACKS.map((t) => t.code), ["ROBO", "AI", "DOHOA", "CODE"]);
  assert.equal(TH_PROGRAMS.length, 9);
  for (const t of TH_TRACKS) for (const c of t.programs) assert.equal(thProgram(c)?.track, t.code, c);
  assert.equal(new Set(TH_PROGRAMS.map((p) => p.code)).size, TH_PROGRAMS.length);
  assert.equal(programTitle(thProgram("ROBO-TH")!), "Lập trình Robotics AI · Tiểu học 8–10 tuổi");
});

test("mỗi năm học 3 học phần Basic → Advanced → Expert; thuật ngữ chuẩn (Tinkercad, đồ họa, khóa)", () => {
  const all = JSON.stringify(TH_PROGRAMS) + JSON.stringify(TH_TRACKS);
  assert.doesNotMatch(all, /TinkerCad|đồ hoạ|khoá/);
  for (const p of TH_PROGRAMS) {
    assert.ok(p.years.length >= 1 && p.years.length <= 2, p.code);
    for (const y of p.years) {
      assert.deepEqual(y.modules.map((m) => m.no), [1, 2, 3], `${p.code} năm ${y.no}`);
      assert.deepEqual(y.modules.map((m) => m.difficulty), ["basic", "advanced", "expert"], `${p.code} năm ${y.no}`);
      for (const m of y.modules) assert.ok(m.name && m.learn && m.product && m.canDo, `${p.code}/${y.no}/${m.no}`);
      assert.ok(y.ageFrom >= p.ageFrom && y.ageTo <= p.ageTo, `${p.code}: tuổi năm học nằm trong tuổi chương trình`);
    }
  }
});

test("khoá luyện thi: tên 'Luyện thi: …', tự chọn sau năm học có thật, số buổi 15 hoặc 30 đúng theo từng bộ", () => {
  const specs = thCourseSpecs().filter((c) => c.kind === "exam");
  assert.equal(specs.length, 10);
  for (const c of specs) {
    assert.match(c.name, /^Luyện thi: /);
    assert.ok([15, 30].includes(c.totalSessions), c.code);
    const p = thProgram(c.programCode)!;
    assert.ok(p.years.some((y) => y.no === c.yearNo), `${c.code}: sau năm học có trong chương trình`);
  }
  // Robotics / AI / Đồ họa 15 buổi; Lập trình 30 buổi (đúng như bộ slide)
  for (const c of specs) assert.equal(c.totalSessions, c.trackCode === "CODE" ? 30 : 15, c.code);
  assert.equal(examCourseName(thProgram("CODE-THPT")!, thProgram("CODE-THPT")!.contests[0]!), "Luyện thi: Tốt nghiệp THPT môn Tin học");
  assert.match(examCourseName(thProgram("CODE-TH")!, thProgram("CODE-TH")!.contests.find((c) => c.key === "HKICO")!), /\(Tiểu học 8–10\)/, "trùng cuộc thi ở hai cấp học thì ghi rõ cấp");
});

test("kế hoạch 45 buổi: buổi 5 ôn tập, 13–14 dự án, 15 báo cáo (mốc học bạ) ở mỗi học phần", () => {
  assert.deepEqual([1, 4, 5, 6, 12, 13, 14, 15].map(sessionRole), ["learn", "learn", "review", "learn", "learn", "project", "demo", "report"]);
  const plan = yearLessonPlan(thProgram("ROBO-TH")!.years[0]!);
  assert.equal(plan.length, TH_SESSIONS_PER_YEAR);
  assert.deepEqual(plan.map((l) => l.seq), Array.from({ length: 45 }, (_, i) => i + 1));
  assert.deepEqual(plan.filter((l) => l.milestone).map((l) => l.seq), [15, 30, 45]);
  assert.deepEqual(plan.filter((l) => l.milestone).map((l) => l.seq), reportCardMilestones(45), "trùng mốc học bạ của hệ thống");
  assert.deepEqual(plan.filter((l) => l.role === "review").map((l) => l.seq), [5, 20, 35]);
  const t = (seq: number) => plan[seq - 1]!.title;
  assert.equal(t(1), "HP1 · Dự án sáng tạo 1");
  assert.equal(t(4), "HP1 · Dự án sáng tạo 4");
  assert.equal(t(5), "HP1 · Ôn tập & kiểm tra");
  assert.equal(t(6), "HP1 · Dự án sáng tạo 5");
  assert.equal(t(12), "HP1 · Dự án sáng tạo 11");
  assert.equal(t(13), "HP1 · Dự án cuối khoá");
  assert.equal(t(14), "HP1 · Demo cuối khoá");
  assert.equal(t(15), "HP1 · Báo cáo cuối khoá");
  assert.equal(t(16), "HP2 · Dự án sáng tạo 1");
  assert.equal(t(45), "HP3 · Báo cáo cuối khoá");
  assert.match(plan[0]!.objectives, /^Làm quen robot ảo\./, "tên mô tả của học phần giữ làm nội dung");
  assert.equal(new Set(plan.map((l) => l.title)).size, 45, "tên buổi không trùng");
});

test("tên gọi chuẩn: Năm N: <động từ> <phần mềm> · HP n: <phần mềm> Basic/Advanced/Expert", () => {
  const robo = thProgram("ROBO-TH")!;
  assert.equal(yearCourseName(robo, robo.years[0]!), "Năm 1: Lập trình RoboSim");
  assert.equal(yearCourseName(robo, robo.years[1]!), "Năm 2: Lập trình RoboVR");
  assert.deepEqual(robo.years[0]!.modules.map((m) => moduleTitle(robo, robo.years[0]!, m)), ["HP1: RoboSim Basic", "HP2: RoboSim Advanced", "HP3: RoboSim Expert"]);
  const dh = thProgram("DOHOA-TH")!;
  assert.equal(yearCourseName(dh, dh.years[0]!), "Năm 1: Thiết kế Tinkercad");
  for (const p of TH_PROGRAMS) for (const y of p.years) {
    assert.ok(TH_YEAR_NAMING[yearCourseCode(p, y.no)], `${p.code} năm ${y.no}: thiếu tên phần mềm`);
    assert.match(yearCourseName(p, y), /^Năm \d: \S/);
  }
  const specs = thCourseSpecs().filter((c) => c.kind === "year");
  assert.ok(specs.every((c) => /^Năm \d: /.test(c.name)), "khoá năm học dùng tên chuẩn");
});

test("kế hoạch khoá luyện thi đọc từ đề cương 'Buổi a–b: …', mốc mỗi 15 buổi", () => {
  assert.deepEqual(parseSyllabus(["Buổi 1–8: nắm thể lệ.", "Buổi 9–24: luyện đề", "Ghi chú"]), [{ from: 1, to: 8, text: "nắm thể lệ" }, { from: 9, to: 24, text: "luyện đề" }]);
  for (const p of TH_PROGRAMS) for (const c of p.contests) {
    const plan = examLessonPlan(c);
    assert.equal(plan.length, c.sessions);
    assert.ok(plan.every((l) => !/Luyện tập theo đề mùa thi$/.test(l.title)), `${p.code}/${c.key}: đề cương phủ hết các buổi`);
    assert.deepEqual(plan.filter((l) => l.milestone).map((l) => l.seq), reportCardMilestones(c.sessions));
  }
});

test("tiêu chí học bạ mỗi chương trình: 6 năng lực + 3 phẩm chất, 3 mức lấy từ bảng thay đổi, hợp lệ", () => {
  for (const p of TH_PROGRAMS) {
    const cs = programCriteria(p);
    assert.deepEqual(cs.map((c) => c.name), TH_CRITERIA_ORDER.map((x) => x.name), p.code);
    for (const c of cs) {
      assert.equal(c.levelDescriptors.length, RUBRIC_SCALE);
      assert.deepEqual(validateCriterion(c), [], `${p.code} / ${c.name}`);
      assert.ok(c.description.length > 5, `${p.code} / ${c.name}: có mô tả`);
    }
  }
  const robo = programCriteria(thProgram("ROBO-TH")!).find((c) => c.name === "Tư duy công nghệ")!;
  assert.deepEqual(robo.levelDescriptors, ["Làm theo hướng dẫn", "Chia bài toán thành các bước", "Lập chiến lược, tối ưu điểm và thời gian"]);
});

test("khoá học nạp vào hệ thống: mã duy nhất, lớp ở trường theo tuổi, gói học phí đúng bảng giá, lộ trình nối tiếp", () => {
  const specs = thCourseSpecs();
  assert.equal(specs.length, 24);
  assert.equal(new Set(specs.map((c) => c.code)).size, specs.length);
  assert.equal(gradeOfAge(8), 3);
  assert.equal(gradeOfAge(18), 12);
  const n1 = specs.find((c) => c.code === "ROBO-TH-N1")!;
  assert.equal(n1.nextCode, "ROBO-TH-N2");
  assert.equal(n1.totalSessions, 45);
  assert.deepEqual(n1.packages.map((p) => [p.sessions, p.listPrice, p.salePrice]), [[45, 7_500_000, 5_625_000], [45, 22_500_000, 19_125_000]]);
  assert.equal(TH_PRICING.year.group.list * (100 - TH_PRICING.year.group.discountPct) / 100, TH_PRICING.year.group.price);
  assert.equal(TH_PRICING.year.oneToOne.list, TH_PRICING.year.group.list * 3, "1:1 niêm yết bằng 3 lần lớp nhóm");
  const exam = specs.find((c) => c.code === "CODE-TH-THI-THT")!;
  assert.deepEqual(exam.packages.map((p) => [p.sessions, p.listPrice, p.salePrice]), [[30, 6_000_000, null], [30, 18_000_000, null]]);
  for (const c of specs) for (const pk of c.packages) assert.ok(pk.salePrice === null || pk.salePrice <= pk.listPrice, pk.code);
  const paths = thPathSpecs();
  assert.equal(paths.length, 9);
  const code1 = paths.find((p) => p.code === "CODE-THCS1")!;
  assert.deepEqual(code1.courses, [{ code: "CODE-THCS1-N1", required: true }, { code: "CODE-THCS1-N2", required: true }, { code: "CODE-THCS1-THI-KHKT", required: false }]);
  for (const p of paths) for (const c of p.courses) assert.ok(specs.some((s) => s.code === c.code), c.code);
});
