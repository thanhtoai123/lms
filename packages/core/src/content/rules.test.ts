import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fileExt, validateDocFile, safeFileName, validateDocument, docTransition, embedUrl, parseScormManifest, normalizeZipPath, scormStatusFromCmi, parseScormTime,
  mergeScormStatus, validateAssignment, submissionTransition, validateGrade, validateSubmission, assignmentStats, earnsCoin, proposalTransition, validateProposal,
  changedFields, proposalConflict,
} from "./rules.js";

test("tài liệu: tệp, tiêu đề, trạng thái", () => {
  assert.equal(fileExt("Bai 1.PPTX"), "pptx");
  assert.equal(fileExt("noext"), "");
  assert.equal(validateDocFile("a.pdf", 100, "file"), null);
  assert.ok(validateDocFile("a.exe", 100, "file"));
  assert.ok(validateDocFile("a.pdf", 60 * 1024 * 1024, "file"));
  assert.ok(validateDocFile("a.pdf", 10, "scorm"));
  assert.equal(validateDocFile("goi.zip", 10, "scorm"), null);
  assert.equal(safeFileName("Giáo án Bài 1 (bản cuối).pdf"), "Giao-an-Bai-1-ban-cuoi.pdf");
  assert.equal(safeFileName("đ.docx"), "d.docx");
  assert.deepEqual(validateDocument({ title: "Giáo án bài 1", kind: "file", courseId: "c" }), []);
  assert.ok(validateDocument({ title: "Vi", kind: "link", url: "http://x", courseId: null }).length === 3);
  assert.equal(docTransition("draft", "published", true), "published");
  assert.throws(() => docTransition("draft", "published", false));
  assert.throws(() => docTransition("archived", "draft", true));
  assert.equal(embedUrl("https://www.youtube.com/watch?v=abcDEF12345"), "https://www.youtube-nocookie.com/embed/abcDEF12345");
  assert.equal(embedUrl("https://drive.google.com/file/d/1AbCdEfGhIjK/view"), "https://drive.google.com/file/d/1AbCdEfGhIjK/preview");
  assert.equal(embedUrl("https://example.com"), null);
});

test("SCORM: manifest, đường dẫn, CMI", () => {
  const x12 = `<?xml version="1.0"?><manifest identifier="SATA_L1" version="1.0"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="O1"><organization identifier="O1"><title>Robot &amp; cảm biến</title><item identifier="I1" identifierref="R1"><title>Bài 1</title></item></organization></organizations>
  <resources><resource identifier="R0" type="webcontent" href="other.html"/><resource identifier="R1" type="webcontent" adlcp:scormtype="sco" href="content/index.html?x=1"/></resources></manifest>`;
  assert.deepEqual(parseScormManifest(x12), { version: "1.2", title: "Robot & cảm biến", launch: "content/index.html", identifier: "SATA_L1" });
  const x04 = `<manifest identifier="M"><metadata><schemaversion>2004 4th Edition</schemaversion></metadata><organizations/><resources><resource identifier="R" adlcp:scormType="sco" xml:base="sco/" href="start.html"/></resources></manifest>`;
  assert.deepEqual(parseScormManifest(x04), { version: "2004", title: "M", launch: "sco/start.html", identifier: "M" });
  assert.throws(() => parseScormManifest("<html/>"));
  assert.throws(() => parseScormManifest(`<manifest identifier="a"><resources><resource identifier="r"/></resources></manifest>`));
  assert.throws(() => parseScormManifest(`<manifest identifier="a"><resources><resource identifier="r" href="../x.html"/></resources></manifest>`));
  assert.equal(normalizeZipPath("./a/b/../c.html"), "");
  assert.equal(normalizeZipPath("a//b/./c.html"), "a/b/c.html");
  assert.equal(normalizeZipPath("/etc/passwd"), "");
  assert.equal(normalizeZipPath("C:/x"), "");
  assert.equal(normalizeZipPath("a\\b.js"), "a/b.js");
  assert.equal(parseScormTime("0001:02:03.50"), 3723);
  assert.equal(parseScormTime("PT1H2M3.5S"), 3724);
  assert.equal(parseScormTime("P1D"), 86400);
  assert.equal(parseScormTime("rác"), 0);
  assert.deepEqual(scormStatusFromCmi({ "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "85", "cmi.core.session_time": "00:10:00", "cmi.suspend_data": "abc" }), { status: "passed", score: 85, location: null, suspend: "abc", seconds: 600 });
  assert.equal(scormStatusFromCmi({ "cmi.completion_status": "completed", "cmi.success_status": "unknown", "cmi.score.scaled": "0.5" }).score, 50);
  assert.equal(scormStatusFromCmi({ "cmi.completion_status": "completed" }).status, "completed");
  assert.equal(scormStatusFromCmi({ "cmi.core.lesson_status": "incomplete", "cmi.core.score.raw": "150" }).score, 100);
  assert.equal(scormStatusFromCmi({}).status, "incomplete");
  assert.equal(mergeScormStatus("completed", "incomplete"), "completed");
  assert.equal(mergeScormStatus("failed", "passed"), "passed");
});

test("bài tập: tạo, nộp, chấm", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const ok = { title: "Lắp xe", instructions: "Lắp xe theo hình và chụp ảnh", dueAt: new Date("2026-09-20T10:00:00Z"), maxScore: 10, submissionType: "file" as const, coinReward: 5, now, isNew: true };
  assert.deepEqual(validateAssignment(ok), []);
  assert.ok(validateAssignment({ ...ok, dueAt: new Date("2026-09-17T10:30:00Z") }).length);
  assert.ok(validateAssignment({ ...ok, dueAt: new Date("2026-12-30T10:00:00Z") }).length);
  assert.ok(validateAssignment({ ...ok, maxScore: 5, coinReward: 50 }).length === 2);
  const c = { assignmentStatus: "published" as const, allowLate: true, late: false };
  assert.equal(submissionTransition("assigned", "submit", c), "submitted");
  assert.equal(submissionTransition("returned", "submit", c), "submitted");
  assert.throws(() => submissionTransition("submitted", "submit", c), /chờ giáo viên chấm/);
  assert.throws(() => submissionTransition("assigned", "submit", { ...c, late: true, allowLate: false }), /quá hạn/);
  assert.throws(() => submissionTransition("assigned", "submit", { ...c, assignmentStatus: "closed" }));
  assert.throws(() => submissionTransition("assigned", "submit", { ...c, assignmentStatus: "draft" }));
  assert.equal(submissionTransition("submitted", "grade", c), "graded");
  assert.equal(submissionTransition("assigned", "grade", c), "graded");
  assert.throws(() => submissionTransition("excused", "grade", c));
  assert.equal(submissionTransition("graded", "return", c), "returned");
  assert.throws(() => submissionTransition("graded", "return", { ...c, assignmentStatus: "closed" }));
  assert.equal(submissionTransition("assigned", "excuse", c), "excused");
  assert.throws(() => submissionTransition("graded", "excuse", c));
  assert.equal(submissionTransition("missing", "reopen", c), "assigned");
  assert.equal(submissionTransition("assigned", "mark_missing", c), "missing");
  assert.throws(() => submissionTransition("submitted", "mark_missing", c));
  assert.deepEqual(validateGrade(8.5, 10, null), []);
  assert.ok(validateGrade(11, 10, null).length);
  assert.ok(validateGrade(8.55, 10, null).length);
  assert.ok(validateGrade(3, 10, "kém").length);
  assert.deepEqual(validateGrade(3, 10, "Chưa hoàn thành phần lập trình"), []);
  assert.deepEqual(validateSubmission({ type: "file", files: [{ mime: "image/png", size: 100 }] }), []);
  assert.ok(validateSubmission({ type: "file", files: [] }).length);
  assert.ok(validateSubmission({ type: "file", files: [{ mime: "application/zip", size: 100 }] }).length);
  assert.ok(validateSubmission({ type: "link", link: "scratch", files: [] }).length);
  assert.deepEqual(validateSubmission({ type: "link", link: "https://scratch.mit.edu/projects/1", files: [] }), []);
  assert.ok(validateSubmission({ type: "offline", files: [] }).length);
  const st = assignmentStats([
    { status: "graded", score: 9, late: false }, { status: "graded", score: 6, late: true }, { status: "submitted", score: null, late: false },
    { status: "assigned", score: null, late: false }, { status: "missing", score: null, late: false }, { status: "excused", score: null, late: false },
  ], 10);
  assert.deepEqual(st, { total: 5, turnedIn: 3, graded: 2, late: 1, missing: 1, pending: 1, rate: 60, avg: 7.5, avgPct: 75 });
  assert.equal(earnsCoin(8, 10, 5), true);
  assert.equal(earnsCoin(7.9, 10, 5), false);
  assert.equal(earnsCoin(10, 10, 0), false);
});

test("đề xuất giáo án", () => {
  assert.equal(proposalTransition("submitted", "review"), "in_review");
  assert.equal(proposalTransition("in_review", "approve"), "approved");
  assert.equal(proposalTransition("approved", "apply"), "applied");
  assert.throws(() => proposalTransition("approved", "withdraw"));
  assert.throws(() => proposalTransition("applied", "reject"));
  const cur = { title: "Bài 1", objectives: "Biết lắp", materials: null };
  assert.deepEqual(changedFields({ title: "Bài 1 ", objectives: "Biết lắp và lập trình", materials: "" }, cur), ["objectives"]);
  assert.deepEqual(validateProposal({ type: "objectives", reason: "Học sinh lớp 3 cần thêm phần lập trình cơ bản", patch: { objectives: "Mới" }, current: cur }), []);
  assert.ok(validateProposal({ type: "objectives", reason: "ngắn", patch: {}, current: cur }).length === 2);
  assert.deepEqual(validateProposal({ type: "timing", reason: "Bài này cần 2 buổi mới dạy hết nội dung", patch: {}, current: cur }), []);
  assert.deepEqual(proposalConflict(cur, { ...cur, objectives: "Đã sửa" }, ["objectives", "title"]), ["objectives"]);
});
