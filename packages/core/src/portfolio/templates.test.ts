import { test } from "node:test";
import assert from "node:assert/strict";
import { CRITERIA_TEMPLATE_SETS, criteriaTemplateById, newCriteriaOnly } from "./templates.js";
import { validateCriterion, CRITERIA_TEMPLATE_ROBOTICS } from "./standard.js";
import { pickSheetMedia, milestoneSessionsFromSheets, type SessionSheetView } from "./view.js";
import { RUBRIC_VERSION } from "./rubric.js";

test("mọi bộ mẫu theo chương trình đều hợp lệ: 4 mô tả mức, khác nhau, ngôn từ tích cực", () => {
  assert.ok(CRITERIA_TEMPLATE_SETS.length >= 4);
  const ids = CRITERIA_TEMPLATE_SETS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "mã bộ mẫu không trùng");
  for (const set of CRITERIA_TEMPLATE_SETS) {
    assert.ok(set.criteria.length >= 5 && set.criteria.length <= 10, `${set.id}: 5–10 tiêu chí`);
    const names = set.criteria.map((c) => c.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `${set.id}: tên tiêu chí không trùng`);
    for (const c of set.criteria) {
      assert.deepEqual(validateCriterion(c), [], `${set.id} / ${c.name}`);
      assert.equal(c.levelDescriptors.length, 4);
      assert.ok(c.groupName.length > 0);
    }
  }
});

test("bộ mẫu mặc định là robotics và tra theo mã", () => {
  assert.equal(criteriaTemplateById(null)?.criteria, CRITERIA_TEMPLATE_ROBOTICS);
  assert.equal(criteriaTemplateById("steam-nhi")?.id, "steam-nhi");
  assert.equal(criteriaTemplateById("khong-co"), null);
});

test("chỉ thêm tiêu chí chưa có — trùng tên (hoa thường, khoảng trắng) thì bỏ qua", () => {
  const add = newCriteriaOnly(["Hợp tác nhóm", "  tư duy   lập trình "], CRITERIA_TEMPLATE_ROBOTICS);
  assert.equal(add.length, CRITERIA_TEMPLATE_ROBOTICS.length - 2);
  assert.ok(!add.some((c) => c.name === "Hợp tác nhóm" || c.name === "Tư duy lập trình"));
  assert.equal(newCriteriaOnly(CRITERIA_TEMPLATE_ROBOTICS.map((c) => c.name), CRITERIA_TEMPLATE_ROBOTICS).length, 0);
  // Bộ nguồn có hai tiêu chí cùng tên → chỉ lấy một
  assert.equal(newCriteriaOnly([], [{ name: "A" }, { name: "a " }]).length, 1);
});

const m = (id: string, classWide: boolean) => ({ id, classWide });

test("chọn ảnh cho buổi: GV chọn tay thì đúng lựa chọn, không thì ưu tiên ảnh có thẻ bé rồi ảnh cả lớp, tối đa 4", () => {
  const own = [m("a", true), m("b", false), m("c", true), m("d", false), m("e", false), m("f", true)];
  assert.deepEqual(pickSheetMedia(own, null).map((x) => x.id), ["b", "d", "e", "a"]);
  assert.deepEqual(pickSheetMedia(own, []).map((x) => x.id), ["b", "d", "e", "a"]);
  assert.deepEqual(pickSheetMedia(own, ["c", "a"]).map((x) => x.id), ["a", "c"], "giữ thứ tự ảnh của buổi");
  assert.deepEqual(pickSheetMedia(own, ["x-khong-co"]).map((x) => x.id), [], "ảnh đã bị ẩn (rút đồng ý) thì không hiện");
  assert.equal(pickSheetMedia(own, null, 2).length, 2);
});

function sheet(seq: number, date: string, media: string[] = []): SessionSheetView {
  return {
    id: `s${seq}`, status: "published", revision: 1, publishedAt: `${date}T10:00:00Z`,
    snapshot: {
      version: RUBRIC_VERSION, scale: 4, criteria: [], takenAt: `${date}T10:00:00Z`,
      context: { date, startTime: null, sequenceNo: seq, label: `Buổi ${seq}`, makeup: false, lessonTitle: `Bài ${seq}`, lessonObjectives: null, teacherName: null, className: null, classCode: null, courseName: null, courseCode: null, centerName: null, studentName: "Bé A", studentCode: null },
    },
    objectiveResult: "achieved", highlights: [], productNote: null, remark: null,
    media: media.map((id) => ({ id, url: `/m/${id}`, caption: null, date: null, classWide: false })),
    average: 3, center: null,
  };
}

test("các buổi của một mốc: đúng khoảng số buổi, xếp theo ngày, mỗi buổi giữ ảnh của nó", () => {
  const sheets = [sheet(7, "2026-09-20", ["p7"]), sheet(5, "2026-09-06"), sheet(6, "2026-09-13", ["p6a", "p6b"]), sheet(12, "2026-10-25")];
  const out = milestoneSessionsFromSheets(sheets, { fromSeq: 6, toSeq: 11 });
  assert.deepEqual(out.map((s) => s.seq), [6, 7]);
  assert.deepEqual(out[0]!.media.map((x) => x.id), ["p6a", "p6b"]);
  assert.deepEqual(out[1]!.media.map((x) => x.id), ["p7"]);
  assert.equal(out[0]!.lessonTitle, "Bài 6");
  assert.deepEqual(milestoneSessionsFromSheets(sheets, { fromSeq: 20, toSeq: 30 }), []);
  // Buổi học bù có ngày sau buổi kế tiếp vẫn xếp theo ngày
  const mk = sheet(6, "2026-09-30"); mk.snapshot.context.makeup = true;
  const out2 = milestoneSessionsFromSheets([sheet(7, "2026-09-20"), mk], { fromSeq: 6, toSeq: 7 });
  assert.deepEqual(out2.map((s) => s.seq), [7, 6]);
  assert.equal(out2[1]!.makeup, true);
});
