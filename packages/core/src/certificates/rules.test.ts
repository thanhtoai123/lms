import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pathProgress, validatePathCourses, normalizePathCode, PATH_CODE_RE,
  pathCertificateNumber, certificatePrefix, certificateCenterCode, nextCertificateSeq, PATH_CERTIFICATE_NO_RE, CERTIFICATE_NO_RE,
  CERTIFICATE_TOKEN_RE, certificateVerifyPath, validateRevokeReason,
  formatIssuedDate,
  defaultTemplateFields, validateTemplateField, validateTemplateFields, normalizeTemplateFields, fontSizeCqw,
  buildCertificateSnapshot, isCertificateSnapshot, sampleCertificateSnapshot, certificateFieldText,
  readImageSize, backgroundWarnings, CERTIFICATE_BG_KEY_RE, builtinBackgroundPath, CERTIFICATE_FIELD_KEYS,
  type TemplateField,
} from "./rules.js";
import { vnDateOf } from "../portfolio/standard.js";
import { certificateNumber } from "../reportcards/rules.js";

const PATH = [
  { courseId: "c4", seq: 2, required: true, code: "SATA4" },
  { courseId: "c1", seq: 1, required: true, code: "SATA1" },
  { courseId: "c6", seq: 3, required: false, code: "SATA6" },
];

test("pathProgress: chỉ hoàn thành ĐÃ DUYỆT, chưa thu hồi mới tính; đủ điều kiện khi đủ khoá bắt buộc", () => {
  const none = pathProgress(PATH, []);
  assert.equal(none.eligible, false);
  assert.equal(none.percent, 0);
  assert.deepEqual(none.courses.map((c) => c.code), ["SATA1", "SATA4", "SATA6"]);
  assert.ok(none.courses.every((c) => c.state === "not_started"));

  const half = pathProgress(PATH, [{ courseId: "c1", status: "approved" }, { courseId: "c4", status: "proposed" }], ["c4"]);
  assert.equal(half.requiredCompleted, 1);
  assert.equal(half.requiredTotal, 2);
  assert.equal(half.percent, 50);
  assert.equal(half.eligible, false);
  assert.equal(half.courses.find((c) => c.courseId === "c4")!.state, "in_progress");

  const revoked = pathProgress(PATH, [{ courseId: "c1", status: "approved" }, { courseId: "c4", status: "approved", revokedAt: new Date() }]);
  assert.equal(revoked.eligible, false);

  // khoá không bắt buộc không chặn điều kiện; hoàn thành ưu tiên hơn đang học
  const ok = pathProgress(PATH, [{ courseId: "c1", status: "approved" }, { courseId: "c4", status: "approved" }], ["c4"]);
  assert.equal(ok.eligible, true);
  assert.equal(ok.percent, 100);
  assert.equal(ok.completed, 2);
  assert.equal(ok.total, 3);
  assert.equal(ok.courses.find((c) => c.courseId === "c4")!.state, "completed");

  // lộ trình không đánh dấu khoá bắt buộc nào → cần mọi khoá; lộ trình rỗng không bao giờ đủ điều kiện
  const allOptional = [{ courseId: "a", seq: 1, required: false }, { courseId: "b", seq: 2, required: false }];
  assert.equal(pathProgress(allOptional, [{ courseId: "a", status: "approved" }]).eligible, false);
  assert.equal(pathProgress([], []).eligible, false);
});

test("kiểm tra danh sách khoá của lộ trình và mã lộ trình", () => {
  assert.deepEqual(validatePathCourses([{ courseId: "a", required: true }, { courseId: "b", required: false }]), []);
  assert.ok(validatePathCourses([]).length > 0);
  assert.ok(validatePathCourses([{ courseId: "a", required: true }, { courseId: "a", required: true }]).some((e) => e.includes("một lần")));
  assert.ok(validatePathCourses([{ courseId: "a", required: false }]).some((e) => e.includes("bắt buộc")));
  assert.equal(normalizePathCode(" lt robo nt "), "LT-ROBO-NT");
  assert.ok(PATH_CODE_RE.test("LT-ROBO-NT"));
  assert.ok(!PATH_CODE_RE.test("-X"));
});

test("số chứng nhận lộ trình CN-<mã cơ sở>-<yy>-<6 số>; số cũ SR- vẫn hợp lệ", () => {
  assert.equal(pathCertificateNumber("CS1", 2026, 12), "CN-CS1-26-000012");
  assert.equal(pathCertificateNumber("cs-đà nẵng", 2027, 1), "CN-CSDANANG-27-000001");
  assert.equal(certificateCenterCode(""), "SR");
  assert.equal(certificatePrefix("CS2", 2026), "CN-CS2-26-");
  assert.ok(PATH_CERTIFICATE_NO_RE.test("CN-CS1-26-000012"));
  assert.ok(CERTIFICATE_NO_RE.test("CN-CS1-26-000012"));
  assert.ok(CERTIFICATE_NO_RE.test(certificateNumber("SATA4", 2026, 7)));
  assert.ok(!CERTIFICATE_NO_RE.test("CN-CS1-26-12"));
  assert.throws(() => pathCertificateNumber("CS1", 2026, 0));
  assert.throws(() => pathCertificateNumber("CS1", 2026, 1_000_000));
  assert.equal(nextCertificateSeq(null, "CN-CS1-26-"), 1);
  assert.equal(nextCertificateSeq("CN-CS1-26-000041", "CN-CS1-26-"), 42);
  assert.equal(nextCertificateSeq("CN-CS2-26-000041", "CN-CS1-26-"), 1);
});

test("token QR và đường dẫn xác thực; lý do thu hồi", () => {
  assert.ok(CERTIFICATE_TOKEN_RE.test("a".repeat(43)));
  assert.ok(!CERTIFICATE_TOKEN_RE.test("CN-CS1-26-000012"));
  assert.ok(!CERTIFICATE_TOKEN_RE.test("abc/../" + "a".repeat(40)));
  assert.equal(certificateVerifyPath("tok"), "/cn/tok");
  assert.equal(validateRevokeReason("   "), "Nhập lý do thu hồi (tối thiểu 5 ký tự)");
  assert.equal(validateRevokeReason("Cấp nhầm học viên"), null);
});

test("ngày cấp: dd/mm/yyyy và 'ngày … tháng … năm …' theo thể thức NĐ 30/2020", () => {
  assert.equal(formatIssuedDate("2026-09-22", "dmy"), "22/09/2026");
  assert.equal(formatIssuedDate("2026-09-22", "long"), "ngày 22 tháng 9 năm 2026");
  assert.equal(formatIssuedDate("2026-01-05", "long"), "ngày 05 tháng 01 năm 2026");
  assert.equal(formatIssuedDate("2026-02-10", "long"), "ngày 10 tháng 02 năm 2026");
  assert.equal(formatIssuedDate("2026-12-31", "long", "Đà Nẵng"), "Đà Nẵng, ngày 31 tháng 12 năm 2026");
  assert.equal(formatIssuedDate("2026-03-07T10:00:00Z", "dmy"), "07/03/2026");
  assert.equal(formatIssuedDate("khong-phai-ngay", "dmy"), "");
  // 23:30 UTC ngày 21 = 06:30 ngày 22 giờ Việt Nam
  assert.equal(vnDateOf(new Date("2026-09-21T23:30:00Z")), "2026-09-22");
});

test("toạ độ trường mẫu: 0–100 %, không tràn khung; chuẩn hoá kẹp về khung", () => {
  const defs = defaultTemplateFields("landscape");
  assert.deepEqual(validateTemplateFields(defs), []);
  assert.deepEqual(validateTemplateFields(defaultTemplateFields("portrait")), []);
  assert.deepEqual(defs.map((f) => f.key).sort(), [...CERTIFICATE_FIELD_KEYS].sort());

  const name = defs.find((f) => f.key === "studentName")!;
  assert.ok(validateTemplateField({ ...name, x: -1 }).some((e) => e.includes("0–100")));
  assert.ok(validateTemplateField({ ...name, y: 120 }).length > 0);
  assert.ok(validateTemplateField({ ...name, x: 60, w: 50 }).some((e) => e.includes("mép phải")));
  assert.ok(validateTemplateField({ ...name, fontSize: 3 }).some((e) => e.includes("cỡ chữ")));
  assert.ok(validateTemplateField({ ...name, color: "red" }).some((e) => e.includes("màu")));
  assert.ok(validateTemplateField({ ...name, x: Number.NaN }).length > 0);
  assert.ok(validateTemplateFields(defs.map((f) => (f.key === "studentName" ? { ...f, enabled: false } : f))).some((e) => e.includes("tên học viên")));
  assert.ok(validateTemplateFields([...defs, name]).some((e) => e.includes("một lần")));

  const norm = normalizeTemplateFields([
    { key: "studentName", x: 95.123, y: 150, w: 30, h: 5, fontSize: 500, color: "#ABCDEF", align: "justify", font: "comic" },
    { key: "khong-ton-tai", x: 1 },
    { key: "issuedDate", dateFormat: "dmy", place: "Hà Nội" },
  ]);
  assert.equal(norm.length, CERTIFICATE_FIELD_KEYS.length);
  const n = norm.find((f) => f.key === "studentName")!;
  assert.equal(n.w, 30);
  assert.equal(n.x, 70); // kẹp để x + w ≤ 100
  assert.equal(n.y, 99);
  assert.equal(n.fontSize, 144);
  assert.equal(n.color, "#abcdef");
  assert.equal(n.align, "center");
  assert.equal(n.font, "be-vietnam");
  assert.deepEqual(validateTemplateFields(norm), []);
  // trường thiếu trong dữ liệu cũ → thêm vào nhưng tắt
  assert.equal(norm.find((f) => f.key === "qr")!.enabled, false);
  const d = norm.find((f) => f.key === "issuedDate")!;
  assert.equal(d.dateFormat, "dmy");
  assert.equal(d.place, "Hà Nội");
  assert.deepEqual(normalizeTemplateFields("rác").filter((f) => f.enabled), []);
  // 1 cqw ở A4 ngang ≈ 8,42 pt
  assert.equal(fontSizeCqw(8.4189, "landscape"), 1);
  assert.ok(fontSizeCqw(12, "portrait") > fontSizeCqw(12, "landscape"));
});

test("bản chụp chứng nhận: chụp mọi chữ đã in, kể cả người ký của mẫu lúc cấp", () => {
  const fields: TemplateField[] = defaultTemplateFields().map((f) =>
    f.key === "signerName" ? { ...f, text: "Trần Văn Mẫu" } : f.key === "customText" ? { ...f, text: "Chúc mừng em!" } : f,
  );
  const s = buildCertificateSnapshot({
    kind: "path", certificateNo: "CN-CS1-26-000001",
    student: { fullName: "  Học viên mẫu 11 ", code: "HV-11" },
    achievement: { name: "Lộ trình Robotics nền tảng", criteriaText: "" },
    courses: [{ code: "SATA1", name: "Sata1" }],
    issuedAt: new Date("2026-09-21T20:00:00Z"),
    grade: "Giỏi",
    center: { name: "Cơ sở 1", address: "12 Đường Mẫu", phone: "0900000000" },
    template: { fields },
  });
  assert.equal(s.studentName, "Học viên mẫu 11");
  assert.equal(s.issuedDate, "2026-09-22");
  assert.equal(s.signerName, "Trần Văn Mẫu");
  assert.equal(s.signerTitle, "Giám đốc trung tâm");
  assert.equal(s.customText, "Chúc mừng em!");
  assert.equal(s.issuerName, "Sata Robo");
  assert.match(s.criteriaText, /Lộ trình Robotics nền tảng/);
  assert.ok(isCertificateSnapshot(s));
  assert.ok(!isCertificateSnapshot({ v: 2 }));
  assert.ok(!isCertificateSnapshot(null));

  // bản chụp giữ nguyên dù mẫu đổi người ký sau này
  const later = fields.map((f) => (f.key === "signerName" ? { ...f, text: "Người khác" } : f));
  const signer = later.find((f) => f.key === "signerName")!;
  assert.equal(certificateFieldText(signer, s), "Trần Văn Mẫu");

  const byKey = (k: string) => fields.find((f) => f.key === k)!;
  assert.equal(certificateFieldText(byKey("studentName"), s), "HỌC VIÊN MẪU 11");
  assert.equal(certificateFieldText(byKey("certificateNo"), s), "Số: CN-CS1-26-000001");
  assert.equal(certificateFieldText(byKey("issuedDate"), s), "ngày 22 tháng 9 năm 2026");
  assert.equal(certificateFieldText({ ...byKey("grade"), enabled: true }, s), "Xếp loại: Giỏi");
  assert.equal(certificateFieldText(byKey("grade"), { ...s, grade: null }), "");
  assert.equal(certificateFieldText(byKey("qr"), s), "");

  const sample = sampleCertificateSnapshot(fields, new Date("2026-05-01T03:00:00Z"));
  assert.equal(sample.certificateNo, "CN-CS1-26-000012");
  assert.equal(sample.signerName, "Trần Văn Mẫu");
});

test("ảnh nền: đọc kích thước PNG / JPEG, cảnh báo lệch khổ A4, khoá tệp hợp lệ", () => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  png.set([0, 0, 0x0d, 0xb4, 0, 0, 0x09, 0xb0], 16); // 3508 × 2480
  assert.deepEqual(readImageSize(png), { width: 3508, height: 2480 });
  // JPEG: SOI, APP0 (độ dài 16), SOF0 cao 2480 rộng 3508
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x09, 0xb0, 0x0d, 0xb4, 0x03, 0, 0, 0]);
  assert.deepEqual(readImageSize(jpg), { width: 3508, height: 2480 });
  assert.equal(readImageSize(new Uint8Array([1, 2, 3])), null);

  assert.deepEqual(backgroundWarnings({ width: 3508, height: 2480 }, "landscape"), []);
  assert.ok(backgroundWarnings({ width: 2480, height: 3508 }, "landscape").some((w) => w.includes("dọc")));
  assert.ok(backgroundWarnings({ width: 1600, height: 900 }, "landscape").some((w) => w.includes("kéo giãn")));
  assert.ok(backgroundWarnings({ width: 1123, height: 794 }, "landscape").some((w) => w.includes("dpi")));

  assert.ok(CERTIFICATE_BG_KEY_RE.test("certificates/t1/abc/0f.png"));
  assert.ok(CERTIFICATE_BG_KEY_RE.test("builtin/sata-mac-dinh.svg"));
  assert.ok(!CERTIFICATE_BG_KEY_RE.test("certificates/x.svg"));
  assert.ok(!CERTIFICATE_BG_KEY_RE.test("builtin/../x.svg"));
  assert.equal(builtinBackgroundPath("builtin/sata-mac-dinh.svg"), "/mau-chung-nhan/sata-mac-dinh.svg");
  assert.equal(builtinBackgroundPath("certificates/a.png"), null);
});
