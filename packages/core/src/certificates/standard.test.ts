import { test } from "node:test";
import assert from "node:assert/strict";
import {
  courseCertificateAchievement, pathCertificateAchievement, standardTemplateFields, TH_CERTIFICATE_SIGNER,
} from "./standard.js";
import { buildCertificateSnapshot, certificateFieldText, validateTemplateFields, defaultTemplateFields } from "./rules.js";
import { thCourseSpecs, thPathSpecs } from "../curriculum/thsteam.js";

test("chứng nhận khoá chuẩn: tên khoá chuẩn + chuyên ngành, không lặp tên khoá", () => {
  const a = courseCertificateAchievement({ code: "ROBO-TH-N2", name: "Robot trong thế giới 3D với RoboVR", totalSessions: 45 });
  assert.equal(a.name, "Lập trình RoboVR");
  assert.equal(a.description, "Chuyên ngành Lập trình Robotics AI");
  assert.equal(a.criteriaText, "45 buổi học · 3 học phần: Basic – Advanced – Expert");
  assert.ok(!a.criteriaText.includes(a.name));

  // mọi khoá chuẩn: tên khoá danh mục bỏ "Năm N: ", chuyên ngành không kèm cấp học / độ tuổi
  for (const c of thCourseSpecs()) {
    const x = courseCertificateAchievement({ code: c.code, name: "tên cũ", totalSessions: c.totalSessions });
    if (c.kind === "year") assert.equal(x.name, c.name.replace(/^Năm \d+: /, ""), c.code);
    else assert.match(x.name, /^Luyện thi: [^()]+$/, c.code);
    // tên cuộc thi có thể chứa "THPT" (Tốt nghiệp THPT môn Tin học) — chỉ kiểm tên năm học và dòng chuyên ngành
    assert.ok(!/Năm \d|Tiểu học|THCS|THPT|tuổi/.test(`${c.kind === "year" ? x.name : ""} ${x.description}`), c.code);
    assert.equal(x.description, `Chuyên ngành ${c.programTitle.split(" · ")[0]}`, c.code);
    assert.match(x.criteriaText, new RegExp(`^${c.totalSessions} buổi học`), c.code);
  }

  const other = courseCertificateAchievement({ code: "SATA1", name: " Sata 1 ", totalSessions: 12 });
  assert.deepEqual(other, { name: "Sata 1", description: null, criteriaText: "12 buổi học" });
});

test("chứng nhận lộ trình chuẩn: tên chương trình, các năm học, tổng buổi", () => {
  const spec = thPathSpecs().find((p) => p.code === "ROBO-TH")!;
  const a = pathCertificateAchievement(spec);
  assert.equal(a.name, "Lập trình Robotics AI");
  assert.equal(a.description, "Lộ trình 2 năm học: Lập trình RoboSim → Lập trình RoboVR");
  assert.equal(a.criteriaText, "90 buổi học · 6 học phần");
  assert.equal(pathCertificateAchievement({ code: "X", name: "Lộ trình riêng", criteriaText: "" }).criteriaText, "Hoàn thành các khoá bắt buộc của Lộ trình riêng");
});

test("mẫu chuẩn: hợp lệ, KHÔNG in ngày sinh, tên khoá IN HOA, người ký & nơi cấp của trung tâm", () => {
  const fields = standardTemplateFields();
  assert.deepEqual(validateTemplateFields(fields), []);
  assert.deepEqual(validateTemplateFields(standardTemplateFields("portrait")), []);
  assert.equal(fields.find((f) => f.key === "studentDob")!.enabled, false);
  assert.ok(fields.find((f) => f.key === "pathName")!.uppercase);
  for (const k of ["studentName", "pathName", "description", "criteriaText", "grade", "issuedDate", "signerTitle", "signerName", "certificateNo", "qr"]) {
    assert.ok(fields.find((f) => f.key === k)?.enabled, k);
  }
  // các dòng giữa trang không chồng nhau (theo thứ tự từ trên xuống)
  const order = ["studentName", "pathName", "description", "criteriaText", "grade"].map((k) => fields.find((f) => f.key === k)!);
  for (let i = 1; i < order.length; i++) assert.ok(order[i]!.y >= order[i - 1]!.y + order[i - 1]!.h - 0.01, order[i]!.key);
  // tên học viên thấp hơn dòng in sẵn "Trân trọng chứng nhận" (37,6 %), vẫn trên đường kẻ (48,1 %)
  const nm = fields.find((f) => f.key === "studentName")!;
  assert.ok(nm.y >= 40.5 && nm.y + nm.h <= 48.1);

  const s = buildCertificateSnapshot({
    kind: "course", certificateNo: "SR-ROBO-TH-N2-2026-0901",
    student: { fullName: "Học viên mẫu 11", dateOfBirth: "2016-03-12" },
    achievement: courseCertificateAchievement({ code: "ROBO-TH-N2", name: "x", totalSessions: 45 }),
    issuedAt: new Date("2026-08-23T10:00:00Z"), grade: "Hoàn thành tốt",
    center: { name: "TH STEAM Academy Online" }, template: { fields },
  });
  const t = (k: string) => certificateFieldText(fields.find((f) => f.key === k)!, s);
  assert.equal(t("studentDob"), "Ngày sinh: 12/03/2016"); // có trong bản ghi, ô tắt nên không in
  assert.equal(t("pathName"), "LẬP TRÌNH ROBOVR");
  assert.equal(t("description"), "Chuyên ngành Lập trình Robotics AI");
  assert.equal(t("grade"), "Xếp loại: Hoàn thành tốt");
  assert.equal(t("issuedDate"), `${TH_CERTIFICATE_SIGNER.place}, ngày 23 tháng 8 năm 2026`);
  assert.equal(t("signerTitle"), "GIÁM ĐỐC TRUNG TÂM");
  assert.equal(t("signerName"), TH_CERTIFICATE_SIGNER.name);
  // không có ngày sinh → không in dòng ngày sinh
  assert.equal(certificateFieldText(fields.find((f) => f.key === "studentDob")!, { ...s, dateOfBirth: null }), "");
  assert.equal(buildCertificateSnapshot({ ...{ kind: "course" as const, certificateNo: "A", student: { fullName: "B", dateOfBirth: "rác" }, achievement: { name: "C" }, issuedAt: new Date(), center: { name: "D" } } }).dateOfBirth, null);
  // mẫu mặc định chung vẫn để trống tên người ký
  assert.equal(defaultTemplateFields().find((f) => f.key === "signerName")!.text, "");
});
