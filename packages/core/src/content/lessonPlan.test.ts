import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_STUCK_MINUTES, humanSize, planCoverage, planFileKind, planVersionState, validatePlanFile,
} from "./lessonPlan.js";

test("nhận .pdf và .zip, từ chối loại khác", () => {
  assert.equal(planFileKind("giao-an buoi 1.PDF"), "pdf");
  assert.equal(planFileKind("scorm-pack.zip"), "scorm");
  assert.equal(planFileKind("bai-giang.pptx"), null);
  assert.equal(validatePlanFile("a.pdf", 1024), null);
  assert.equal(validatePlanFile("a.pptx", 1024), "Chỉ nhận .pdf (slide) hoặc .zip (gói SCORM)");
  assert.equal(validatePlanFile("a.pdf", 0), "Tệp rỗng");
  assert.match(validatePlanFile("a.pdf", 200 * 1024 * 1024)!, /Slide PDF tối đa 100MB/);
  assert.match(validatePlanFile("a.zip", 300 * 1024 * 1024)!, /SCORM tối đa 200MB/);
});

test("bản đang xử lý quá 15 phút coi như kẹt và cho dọn", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const moi = planVersionState({ status: "processing", createdAt: new Date("2026-09-23T09:58:00Z") }, now);
  assert.equal(moi.state, "processing");
  assert.equal(moi.cleanable, false);

  const ket = planVersionState({ status: "processing", createdAt: new Date(now.getTime() - PLAN_STUCK_MINUTES * 60_000) }, now);
  assert.equal(ket.state, "stuck");
  assert.equal(ket.cleanable, true);
  assert.match(ket.message, /quá 15 phút/);

  const loi = planVersionState({ status: "failed", createdAt: now, errorText: "Thiếu imsmanifest.xml" }, now);
  assert.equal(loi.state, "failed");
  assert.equal(loi.message, "Thiếu imsmanifest.xml");
  assert.equal(loi.cleanable, true);

  const ok = planVersionState({ status: "ready", createdAt: now }, now);
  assert.equal(ok.state, "ready");
  assert.equal(ok.cleanable, false);
  assert.equal(ok.message, "");
});

test("kích thước và độ phủ hiển thị gọn", () => {
  assert.equal(humanSize(39_600_128), "37.8 MB");
  assert.equal(humanSize(4096), "4 KB");
  assert.equal(humanSize(0), "0 KB");
  assert.deepEqual(planCoverage([{ hasPlan: true }, { hasPlan: false }, { hasPlan: true }, { hasPlan: false }]), { done: 2, total: 4, percent: 50 });
  assert.deepEqual(planCoverage([]), { done: 0, total: 0, percent: 0 });
});
