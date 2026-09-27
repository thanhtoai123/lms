import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scormNguon, dungMienHocLieu, mienHocLieuHopLe, nonceAnToan, docTinScorm, scriptCauNoiScorm, chenCauNoi } from "./scormNguon.js";

describe("miền học liệu SCORM", () => {
  it("chuẩn hoá SCORM_ORIGIN về origin, bỏ đường dẫn", () => {
    assert.equal(scormNguon({ SCORM_ORIGIN: "https://hoc-lieu.satarobo.vn/abc/" }), "https://hoc-lieu.satarobo.vn");
    assert.equal(scormNguon({}), null);
    assert.equal(scormNguon({ SCORM_ORIGIN: "javascript:alert(1)" }), null);
    assert.equal(scormNguon({ SCORM_ORIGIN: "khong phai url" }), null);
  });
  it("chỉ phát trên đúng host của miền học liệu", () => {
    assert.equal(dungMienHocLieu("https://hoc-lieu.satarobo.vn", "hoc-lieu.satarobo.vn"), true);
    assert.equal(dungMienHocLieu("https://hoc-lieu.satarobo.vn", "admin.satarobo.vn"), false);
    assert.equal(dungMienHocLieu("https://hoc-lieu.satarobo.vn", null), false);
  });
  it("miền học liệu trùng miền quản trị là cấu hình sai", () => {
    assert.equal(mienHocLieuHopLe("https://admin.satarobo.vn", "https://admin.satarobo.vn"), false);
    assert.equal(mienHocLieuHopLe("https://hoc-lieu.satarobo.vn", "https://admin.satarobo.vn"), true);
  });
  it("nonce lạ không được chèn vào thẻ script", () => {
    assert.equal(nonceAnToan('abc"><script>alert(1)</script>'), null);
    assert.equal(nonceAnToan("R2VtYWlsTm9uY2U9PQ=="), "R2VtYWlsTm9uY2U9PQ==");
  });
});

describe("tin nhắn từ khung bài giảng", () => {
  it("nhận đúng hình dạng", () => {
    assert.deepEqual(docTinScorm({ sr: "scorm", op: "commit", cmi: { "cmi.core.lesson_status": "completed", "cmi.core.score.raw": 90 } }),
      { op: "commit", cmi: { "cmi.core.lesson_status": "completed", "cmi.core.score.raw": "90" } });
  });
  it("gói không được đổi mã / tên người học", () => {
    const t = docTinScorm({ sr: "scorm", op: "set", cmi: { "cmi.core.student_id": "khac", "cmi.learner_name": "X", "cmi.location": "3" } });
    assert.deepEqual(t?.cmi, { "cmi.location": "3" });
  });
  it("bỏ khoá không phải cmi.* và giá trị kiểu lạ", () => {
    const t = docTinScorm({ sr: "scorm", op: "set", cmi: { "__proto__x": "1", "cmi.a": { x: 1 }, "cmi.b": "2" } });
    assert.deepEqual(t?.cmi, { "cmi.b": "2" });
  });
  it("từ chối tin sai hình dạng hoặc quá lớn", () => {
    assert.equal(docTinScorm(null), null);
    assert.equal(docTinScorm({ sr: "scorm", op: "xoa", cmi: {} }), null);
    assert.equal(docTinScorm({ sr: "khac", op: "set", cmi: {} }), null);
    assert.equal(docTinScorm({ sr: "scorm", op: "set", cmi: [] }), null);
    assert.equal(docTinScorm({ sr: "scorm", op: "set", cmi: { "cmi.suspend_data": "x".repeat(300 * 1024) } }), null);
  });
});

describe("cầu nối nhúng vào trang gói", () => {
  it("chèn ngay sau <head> để chạy trước script của gói", () => {
    const out = chenCauNoi("<html><head><script src=a.js></script></head></html>", "<script>X</script>");
    assert.ok(out.indexOf("<script>X</script>") < out.indexOf("a.js"));
  });
  it("gửi tin tới đúng miền quản trị, không dùng '*'", () => {
    const s = scriptCauNoiScorm("https://admin.satarobo.vn", null);
    assert.ok(s.includes('"https://admin.satarobo.vn"'));
    assert.ok(!s.includes('"*"'));
  });
  it("miền có ký tự lạ không phá được thẻ script", () => {
    const s = scriptCauNoiScorm("https://a.vn</script><script>alert(1)//", null);
    assert.ok(!s.slice(0, -"</script>".length).includes("</script>"));
  });
});
