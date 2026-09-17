import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conversionGate, summarizeLeadOrders, CONVERSION_GATE_MESSAGE, checkScholarshipReason, isValidIdNumber,
  normalizePersonName, mergeIntake, appendNote, viDate, isFacebookUrl, PLACEHOLDER_PARENT_NAME,
  parseNoteTokens, formatNoteTokens,
  parseLeadImportTable, checkLeadImportRow, groupLeadImport, collapseByPhone, mapLeadImportHeader, emptyImportRow,
} from "./intake.js";

test("chặn chốt: chưa có đơn / có đơn nhưng chưa ghi nhận khoản nào", () => {
  assert.equal(conversionGate({ orders: 0, total: 0, recorded: 0, confirmed: 0 }), CONVERSION_GATE_MESSAGE);
  assert.equal(conversionGate({ orders: 1, total: 5_000_000, recorded: 0, confirmed: 0 }), CONVERSION_GATE_MESSAGE);
  assert.equal(conversionGate({ orders: 1, total: 5_000_000, recorded: 1_000_000, confirmed: 0 }), null);
  assert.equal(conversionGate({ orders: 1, total: 5_000_000, recorded: 0, confirmed: 500_000 }), null);
  // đơn 0đ (học bổng toàn phần) cho qua
  assert.equal(conversionGate({ orders: 1, total: 0, recorded: 0, confirmed: 0 }), null);
});

test("tổng hợp đơn của lead bỏ đơn huỷ / đã hoàn; đã nộp = ghi nhận + xác nhận", () => {
  const s = summarizeLeadOrders([
    { status: "partially_paid", total: 6_000_000, confirmed: 2_000_000, recorded: 1_000_000 },
    { status: "cancelled", total: 3_000_000, confirmed: 0, recorded: 0 },
    { status: "pending_payment", total: 1_000_000, confirmed: 0, recorded: 0 },
  ]);
  assert.deepEqual(s, { count: 2, total: 7_000_000, confirmed: 2_000_000, recorded: 1_000_000, paid: 3_000_000, outstanding: 4_000_000 });
  assert.equal(summarizeLeadOrders([]).count, 0);
  assert.equal(summarizeLeadOrders([{ status: "paid", total: 100, confirmed: 150, recorded: 0 }]).outstanding, 0);
});

test("học bổng cần lý do; CCCD 9 hoặc 12 số; link Facebook", () => {
  assert.ok(checkScholarshipReason("abc"));
  assert.equal(checkScholarshipReason("Con giáo viên"), null);
  assert.ok(isValidIdNumber("123456789"));
  assert.ok(isValidIdNumber("0012 3456 7890"));
  assert.ok(!isValidIdNumber("12345678901"));
  assert.ok(isFacebookUrl("https://www.facebook.com/abc.def"));
  assert.ok(isFacebookUrl("m.me/abc"));
  assert.ok(!isFacebookUrl("https://evil.com/facebook.com/x"));
});

test("chuẩn hoá tên: bỏ dấu, thường, gộp khoảng trắng", () => {
  assert.equal(normalizePersonName("  Nguyễn   Đức  Anh "), "nguyen duc anh");
  assert.equal(normalizePersonName("NGUYỄN ĐỨC ANH"), normalizePersonName("nguyen duc anh"));
  assert.equal(viDate("2026-09-17"), "17/09/2026");
  assert.equal(appendNote("a", "b"), "a\nb");
  assert.equal(appendNote("a\nb", "b"), "a\nb");
  assert.equal(appendNote(null, " "), null);
});

test("gộp phiếu trùng: chỉ điền ô trống, giá trị khác ghi chú kèm ngày, con mới được thêm", () => {
  const existing = {
    parentName: "Chị Lan", email: null, centerId: "cs1", source: "ads", facebookUrl: null, childName: "Bé An", notes: "Gọi buổi tối",
    children: [{ id: "k1", fullName: "Nguyễn An", grade: null, birthYear: 2017, school: null, interestedCourseId: "c1" }],
  };
  const incoming = {
    parentName: "Lan Nguyễn", email: "lan@x.vn", centerId: "", source: "ADS", facebookUrl: "fb.com/lan",
    notes: "Muốn học T7",
    children: [
      { fullName: "nguyen  an", grade: 3, birthYear: 2016, school: "TH Lê Lợi" },
      { fullName: "Nguyễn Bình", grade: 1 },
      { fullName: "  " },
    ],
  };
  const r = mergeIntake(existing, incoming, { today: "2026-09-17" });
  assert.deepEqual(r.patch, { email: "lan@x.vn", facebookUrl: "fb.com/lan" });
  assert.deepEqual(r.childrenToAdd.map((c) => c.fullName), ["Nguyễn Bình"]);
  assert.deepEqual(r.childPatches, [{ id: "k1", patch: { grade: 3, school: "TH Lê Lợi" } }]);
  assert.ok(r.noteAppend!.startsWith("[17/09/2026] Nhập lại: "));
  assert.match(r.noteAppend!, /Tên PH khác: "Lan Nguyễn" \(đang giữ "Chị Lan"\)/);
  assert.match(r.noteAppend!, /năm sinh khác: "2016"/);
  assert.match(r.noteAppend!, /Ghi chú: Muốn học T7/);
  assert.ok(!/Nguồn/.test(r.noteAppend!), "khác hoa/thường không tính là khác");
  assert.equal(r.changed, true);
  assert.equal(existing.parentName, "Chị Lan", "không sửa đối tượng đầu vào ở cấp lead");
});

test("gộp phiếu có Đè: lấy dữ liệu file, giá trị cũ vào ghi chú; ô trống không xoá", () => {
  const r = mergeIntake(
    { parentName: "Chị Lan", email: "old@x.vn", source: "ads", children: [{ id: "k1", fullName: "An", grade: 2 }] },
    { parentName: "Nguyễn Thị Lan", email: "", source: null, children: [{ fullName: "An", grade: 3 }] },
    { today: "2026-09-17", overwrite: true },
  );
  assert.deepEqual(r.patch, { parentName: "Nguyễn Thị Lan" });
  assert.deepEqual(r.childPatches, [{ id: "k1", patch: { grade: 3 } }]);
  assert.match(r.noteAppend!, /Tên PH cũ: "Chị Lan"/);
  assert.equal(r.conflicts.filter((c) => c.overwritten).length, 2);
});

test("gộp phiếu: tên tạm được thay; phiếu không có gì mới thì không đổi", () => {
  const r = mergeIntake({ parentName: PLACEHOLDER_PARENT_NAME, children: [] }, { parentName: "Anh Tuấn", children: [] }, { today: "2026-09-17" });
  assert.deepEqual(r.patch, { parentName: "Anh Tuấn" });
  assert.equal(r.noteAppend, null);
  const same = mergeIntake({ parentName: "A", notes: "x y", children: [{ id: "1", fullName: "B" }] }, { parentName: PLACEHOLDER_PARENT_NAME, notes: "x y", children: [{ fullName: "b" }] }, { today: "2026-09-17" });
  assert.equal(same.changed, false);
  const shown = mergeIntake({ centerId: "id-1", children: [] }, { centerId: "id-2", children: [] }, { today: "2026-09-17", display: (f, v) => (f === "centerId" ? `CS-${v}` : v) });
  assert.match(shown.noteAppend!, /Cơ sở khác: "CS-id-2" \(đang giữ "CS-id-1"\)/);
});

test("token ghi chú ĐãĐóng= / HạnĐợt2=", () => {
  assert.deepEqual(parseNoteTokens("Chuyển khoản. ĐãĐóng=3.500.000 HạnĐợt2=15/10/2026"), { paid: 3_500_000, dueDate2: "2026-10-15" });
  assert.deepEqual(parseNoteTokens("dadong=1200000đ"), { paid: 1_200_000 });
  // dạng tổ hợp (NFD) vẫn đọc được
  assert.deepEqual(parseNoteTokens("ĐãĐóng=500000".normalize("NFD")), { paid: 500_000 });
  assert.deepEqual(parseNoteTokens("không có gì"), {});
  assert.deepEqual(parseNoteTokens(null), {});
  assert.equal(formatNoteTokens({ paid: 2_000_000, dueDate2: "2026-10-01" }), "ĐãĐóng=2000000 HạnĐợt2=2026-10-01");
  assert.deepEqual(parseNoteTokens(formatNoteTokens({ paid: 2_000_000, dueDate2: "2026-10-01" })), { paid: 2_000_000, dueDate2: "2026-10-01" });
});

test("đọc file lead: cột cố định, tiêu đề có chú thích, dán từ Excel (tab)", () => {
  assert.deepEqual(mapLeadImportHeader(["Tên phụ huynh", "SĐT", "Cơ sở (mã CS, để trống)", "Sale phụ trách (email hoặc mã NV)", "Khác"]), { parentName: 0, phone: 1, centerCode: 2, sale: 3 });
  const tsv = "Tên phụ huynh\tSĐT\tEmail\tTên con\tTuổi con\tCơ sở\tKhoá quan tâm\tNguồn\tGhi chú\tSale phụ trách\nChị Lan\t0905 123 456\t\tAn\t8\tCS1\tSATA3\tads\tgọi tối\tsale1@x.vn\n";
  const p = parseLeadImportTable(tsv);
  assert.deepEqual(p.headerErrors, []);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0]!.line, 2);
  assert.equal(p.rows[0]!.phone, "0905 123 456");
  assert.equal(p.rows[0]!.centerCode, "CS1");
  assert.equal(p.rows[0]!.sale, "sale1@x.vn");
  assert.deepEqual(parseLeadImportTable("Tên phụ huynh,Email\nA,b@c.vn").headerErrors, ["Thiếu cột SĐT"]);
  const big = "SĐT\n" + Array.from({ length: 6 }, (_, i) => `090000000${i}`).join("\n");
  assert.deepEqual(parseLeadImportTable(big, 5).headerErrors, ["File quá lớn (6 dòng). Tối đa 5."]);
});

test("kiểm tra dòng: SĐT bắt buộc, tuổi 3–18, số tiền / ngày", () => {
  const ok = checkLeadImportRow({ ...emptyImportRow(2), phone: "+84 905123456", childName: "An", childAge: "8", paid: "1.500.000", dueDate2: "01/10/2026", registeredAt: "2026-09-01" }, "2026-09-17");
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.phoneNormalized, "84905123456");
  assert.equal(ok.birthYear, 2018);
  assert.equal(ok.paid, 1_500_000);
  assert.equal(ok.dueDate2, "2026-10-01");
  assert.deepEqual(ok.warnings, ["Không có tên phụ huynh"]);
  const bad = checkLeadImportRow({ ...emptyImportRow(3), parentName: "A", phone: "12", email: "x@", childAge: "2", paid: "abc", registeredAt: "2026-12-01" }, "2026-09-17");
  assert.deepEqual(bad.errors, [
    "SĐT thiếu hoặc không hợp lệ (09xx / +84)", "Email không hợp lệ", "Tuổi con phải là số nguyên 3–18 hoặc để trống",
    "Số tiền đã đóng không hợp lệ", "Ngày đăng ký ở tương lai",
  ]);
  assert.equal(checkLeadImportRow({ ...emptyImportRow(4), phone: "0905123456", paid: "0" }, "2026-09-17").paid, null);
});

test("chia nhóm Mới / Trùng / Lỗi; trùng trong file gộp vào dòng đầu", () => {
  const rows = [
    { line: 2, phone: "0905123456", phoneNormalized: "84905123456", errors: [] },
    { line: 3, phone: "0905 123 456", phoneNormalized: "84905123456", errors: [] },
    { line: 4, phone: "0911000000", phoneNormalized: "84911000000", errors: [] },
    { line: 5, phone: "x", phoneNormalized: null, errors: ["SĐT thiếu hoặc không hợp lệ (09xx / +84)"] },
  ];
  const g = groupLeadImport(rows, new Set(["84911000000"]));
  assert.equal(g.get(2)!.group, "new");
  assert.equal(g.get(3)!.group, "dup");
  assert.equal(g.get(3)!.firstLine, 2);
  assert.match(g.get(3)!.messages[0]!, /Trùng 0905 123 456 với dòng 2 trong file/);
  assert.equal(g.get(4)!.group, "dup");
  assert.equal(g.get(4)!.existing, true);
  assert.equal(g.get(5)!.group, "error");
  const c = collapseByPhone(rows);
  assert.deepEqual(c.map((x) => [x.phone, x.rows.map((r) => r.line)]), [["84905123456", [2, 3]], ["84911000000", [4]]]);
});
