import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStudentImport, parseEnrollmentImport, mapLegacyStudentStatus, reconcile, parseRemainingCsv, compareRemaining,
  parallelStreak, cutoverBlockers, compareParallelDay, CUTOVER_CHECKLIST,
} from "./rules.js";
import {
  validateDeliverySettings, DELIVERY_DEFAULTS, renderSms, smsSegments, buildZnsData, znsPhone, quietHours, failureRetryable, retryDelayMinutes,
  consentBlock, isMarketingEvent,
} from "./delivery.js";

test("nhập học viên", () => {
  const csv = [
    "Mã HV,Họ tên,Ngày sinh,Giới tính,Khối,Cơ sở,Trạng thái,Tên PH,SĐT PH,Email PH,SĐT PH 2",
    "hv001,Nguyễn Văn A,05/03/2017,Nam,3,CS1,Đang học,Chị Lan,0901234567,lan@example.test,",
    "HV001,Trần B,05/03/2017,Nữ,3,CS1,,Anh Minh,0901234568,,",
    "HV002,Lê C,40/03/2017,Khác,15,,Bí ẩn,,123,,",
    "HV003,Phạm D,,,,cs2,Bảo lưu,,0901234567,sai-email,0909999999",
    "HV004,Phạm E,01/01/2024,nữ,,CS2,nghỉ học,Chị Hoa,84901234567,,",
  ].join("\n");
  const r = parseStudentImport(csv, "2026-09-17");
  assert.deepEqual(r.headerErrors, []);
  assert.equal(r.rows.length, 5);
  assert.equal(r.rows[0]!.row?.legacyCode, "HV001");
  assert.equal(r.rows[0]!.row?.parentPhone, "84901234567");
  assert.equal(r.rows[0]!.row?.gender, "male");
  assert.ok(r.rows[1]!.errors.includes("Mã học viên bị lặp trong file"));
  const e2 = r.rows[2]!.errors.join("|");
  for (const s of ["Ngày sinh", "Giới tính", "Khối lớp", "Thiếu cơ sở", "Trạng thái", "SĐT phụ huynh"]) assert.ok(e2.includes(s), s);
  assert.equal(r.rows[3]!.row?.status, "paused");
  assert.equal(r.rows[3]!.row?.center, "CS2");
  assert.equal(r.rows[3]!.row?.parentEmail, null);
  assert.equal(r.rows[3]!.row?.parent2?.phone, "84909999999");
  assert.ok(r.rows[3]!.warnings.some((w) => w.includes("Thiếu tên phụ huynh")));
  assert.ok(r.rows[3]!.warnings.some((w) => w.includes("Cùng SĐT")));
  assert.equal(r.rows[4]!.row?.status, "withdrawn");
  assert.ok(r.rows[4]!.warnings.some((w) => w.includes("Tuổi 2")));
  assert.ok(parseStudentImport("ho_ten,sdt\nA,1", "2026-01-01").headerErrors.length >= 2);
  assert.equal(mapLegacyStudentStatus("Tốt nghiệp"), "alumni");
  assert.equal(mapLegacyStudentStatus("Học thử"), "trial");
});

test("nhập ghi danh", () => {
  const csv = [
    "ma_hv,ma_lop,so_buoi_goi,da_hoc,con_lai,trang_thai,ngay_ghi_danh,bao_luu_den",
    "HV001,cs1.sata4.26.001,48,10,38,Đang học,01/02/2026,",
    "HV001,CS1.SATA4.26.001,48,10,,Đang học,,",
    "HV002,CS1.SATA4.26.001,48,10,30,Đang học,,",
    "HV003,CS1.SATA4.26.001,24,,0,Đang học,,",
    "HV004,CS1.SATA4.26.001,24,,30,Bảo lưu,,",
    "HV005,,0,x,,Lạ,01/01/2030,",
    "HV006,CS2.X,12,3,,Bảo lưu,,",
  ].join("\n");
  const r = parseEnrollmentImport(csv, "2026-09-17");
  assert.deepEqual(r.headerErrors, []);
  assert.equal(r.rows[0]!.row?.usedSessions, 10);
  assert.equal(r.rows[0]!.row?.classCode, "CS1.SATA4.26.001");
  assert.equal(r.rows[0]!.row?.enrolledAt, "2026-02-01");
  assert.ok(r.rows[1]!.errors.some((e) => e.includes("lặp")));
  assert.ok(r.rows[2]!.errors.some((e) => e.includes("≠")));
  assert.equal(r.rows[3]!.row?.status, "completed");
  assert.equal(r.rows[3]!.row?.usedSessions, 24);
  assert.ok(r.rows[4]!.errors.includes("Số buổi đã học vượt gói"));
  assert.ok(r.rows[5]!.errors.length >= 4);
  assert.equal(r.rows[6]!.row?.status, "paused");
  assert.ok(r.rows[6]!.warnings.some((w) => w.includes("90 ngày")));
  assert.ok(parseEnrollmentImport("ma_hv,ma_lop,so_buoi_goi\nA,B,1", "2026-01-01").headerErrors[0]!.includes("da_hoc"));
});

test("đối soát tổng + từng học viên", () => {
  const cur = { activeStudents: 100, openEnrollments: 110, runningClasses: 12, remainingSessions: 2000, debtTotal: 5_000_400, collectedMonth: 90_000_000 };
  const a = reconcile({ activeStudents: 100, debtTotal: 5_000_000, remainingSessions: null }, cur);
  assert.equal(a.ok, true);
  assert.equal(a.compared, 2);
  const b = reconcile({ activeStudents: 99, collectedMonth: 89_990_000 }, cur);
  assert.equal(b.ok, false);
  assert.equal(b.rows.find((x) => x.metric === "activeStudents")!.diff, 1);
  assert.equal(b.rows.find((x) => x.metric === "collectedMonth")!.ok, false);
  assert.equal(reconcile({}, cur).ok, false);
  const f = parseRemainingCsv("ma_hv,ma_lop,con_lai,cong_no\nHV1,L1,10,0\nHV2,,5,1.000.000\nHV3,L1,3,\nHV4,L9,2,\n,,x,");
  assert.equal(f.rows.length, 5);
  assert.equal(f.rows[4]!.errors.length, 2);
  const diffs = compareRemaining(f.rows.filter((x) => x.row).map((x) => x.row!), [
    { studentCode: "HV1", classCode: "L1", remaining: 10 },
    { studentCode: "HV2", classCode: "L1", remaining: 3 },
    { studentCode: "HV2", classCode: "L2", remaining: 1 },
    { studentCode: "HV4", classCode: "L1", remaining: 2 },
  ], new Map([["HV2", 1_000_500]]));
  assert.deepEqual(diffs.map((d) => `${d.studentCode}:${d.kind}`), ["HV2:remaining", "HV3:missing", "HV4:missing"]);
});

test("go-live theo cơ sở", () => {
  assert.equal(parallelStreak([{ date: "2026-09-10", ok: true }, { date: "2026-09-12", ok: true }, { date: "2026-09-11", ok: false }]), 1);
  assert.equal(parallelStreak([]), 0);
  const all = Object.fromEntries(CUTOVER_CHECKLIST.map((c) => [c.key, true]));
  const base = { stage: "parallel" as const, checklist: all, streak: 5, parallelDays: 7, openIssues: 0 };
  assert.deepEqual(cutoverBlockers(base, "live"), []);
  assert.ok(cutoverBlockers({ ...base, streak: 4 }, "live")[0]!.includes("5 ngày"));
  assert.ok(cutoverBlockers({ ...base, checklist: { ...all, staff_trained: false } }, "live")[0]!.includes("hướng dẫn"));
  assert.ok(cutoverBlockers({ ...base, stage: "preparing" }, "live")[0]!.includes("Chạy song song"));
  assert.ok(cutoverBlockers({ ...base, stage: "preparing", checklist: {} }, "parallel").length === 1);
  assert.deepEqual(cutoverBlockers({ ...base, stage: "live" }, "parallel"), []);
  assert.ok(cutoverBlockers({ ...base, stage: "legacy_readonly" }, "live")[0]!.includes("không quay lại"));
  assert.ok(cutoverBlockers({ ...base, stage: "live", openIssues: 2 }, "legacy_readonly").length === 1);
  const d = compareParallelDay({ attendance: 40, collected: 5_000_000, newEnrollments: 1, openEnrollments: 90 }, { attendance: 40, collected: 5_000_500, newEnrollments: 1, openEnrollments: 91 });
  assert.equal(d.ok, false);
  assert.deepEqual(d.diffs.filter((x) => !x.ok).map((x) => x.metric), ["openEnrollments"]);
});

test("kênh gửi ZNS / SMS", () => {
  const env = { production: false, znsToken: false, smsApi: false, allowSandbox: false };
  assert.deepEqual(validateDeliverySettings(DELIVERY_DEFAULTS, env), []);
  const bad = {
    ...DELIVERY_DEFAULTS, quietStart: "25:00",
    zns: { mode: "live" as const, templates: { OTP: { templateId: "abc", params: { code: "ten_hv" } } } },
    sms: { ...DELIVERY_DEFAULTS.sms, mode: "sandbox" as const, brandname: "", templates: { OTP: "Ma {ma}" } },
  };
  const e = validateDeliverySettings(bad, { ...env, production: true }).join("|");
  for (const s of ["HH:MM", "ZALO_ZNS_TOKEN", "template_id", "biến \"ten_hv\"", "phải có tham số mã otp", "brandname", "{ma}", "{otp}", "giả lập"]) assert.ok(e.includes(s), s);
  const r = renderSms("Hoc phi be {ten_hv}: {so_tien} - {han}", { ten_hv: "Nguyễn Đức", so_tien: "1.000.000đ" });
  assert.equal(r.text, "Hoc phi be Nguyen Duc: 1.000.000d -");
  assert.deepEqual(r.missing, ["han"]);
  assert.deepEqual(smsSegments("a".repeat(160)), { length: 160, unicode: false, segments: 1 });
  assert.equal(smsSegments("a".repeat(161)).segments, 2);
  assert.equal(smsSegments("ă".repeat(71)).segments, 2);
  const z = buildZnsData({ templateId: "123", params: { customer_name: "ten_ph", otp: "otp" } }, { otp: "123456", ten_ph: "x".repeat(150) });
  assert.equal(z.data.customer_name!.length, 100);
  assert.deepEqual(buildZnsData({ templateId: "1", params: { a: "han" } }, {}).missing, ["han"]);
  assert.equal(znsPhone("0901 234 567"), "84901234567");
  assert.equal(znsPhone("12345"), null);
  const q = quietHours(new Date("2026-09-17T15:30:00Z"), "21:00", "07:00"); // 22:30 VN
  assert.equal(q.quiet, true);
  assert.equal(q.resumeAt!.toISOString(), "2026-09-18T00:00:00.000Z");
  assert.equal(quietHours(new Date("2026-09-17T03:00:00Z"), "21:00", "07:00").quiet, false);
  assert.equal(quietHours(new Date("2026-09-17T23:59:00Z"), "21:00", "07:00").quiet, true); // 06:59 VN
  assert.equal(failureRetryable({ kind: "http", status: 503 }), true);
  assert.equal(failureRetryable({ kind: "http", status: 400 }), false);
  assert.equal(failureRetryable({ kind: "provider", code: -118 }), false);
  assert.equal(retryDelayMinutes(2), 30);
});

test("đồng ý nhận tin: từ chối tiếp thị chặn thông báo chung, không chặn tin dịch vụ", () => {
  // Phụ huynh tắt nhận tin tiếp thị
  const tuChoi = { optOut: true, restricted: false };
  assert.ok(consentBlock("BROADCAST", tuChoi)?.includes("tiếp thị"));
  for (const ev of ["OTP", "TUITION_DUE", "SESSION_REMINDER", "SESSION_SUMMARY", "INVOICE_ISSUED", "REPORT_CARD"] as const) {
    assert.equal(consentBlock(ev, tuChoi), null, `${ev} là tin dịch vụ, không được chặn vì từ chối tiếp thị`);
  }
  // Hạn chế xử lý dữ liệu thì chặn tất, kể cả OTP
  const hanChe = { optOut: false, restricted: true };
  for (const ev of ["OTP", "BROADCAST", "TUITION_DUE"] as const) {
    assert.ok(consentBlock(ev, hanChe)?.includes("hạn chế xử lý"));
  }
  assert.equal(consentBlock("BROADCAST", { optOut: false, restricted: false }), null);
  assert.equal(isMarketingEvent("BROADCAST"), true);
  assert.equal(isMarketingEvent("TUITION_DUE"), false);
});
