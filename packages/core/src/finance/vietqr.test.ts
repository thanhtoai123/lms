import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16Ccitt, parseVietQr, validateVietQr, vietQrDataUri, vietQrPayload, vietQrSafeText } from "./vietqr.js";
import { transferMemo } from "./rules.js";

test("CRC-16/CCITT-FALSE đúng giá trị kiểm chuẩn", () => {
  assert.equal(crc16Ccitt("123456789"), "29B1");
});

test("VietQR khớp chuỗi mẫu đã công bố (TPBank 970423, 50.000đ, 'test')", () => {
  assert.equal(
    vietQrPayload({ bankBin: "970423", accountNo: "mynamebvh", amount: 50000, memo: "test" }),
    "00020101021238530010A000000727012300069704230109mynamebvh0208QRIBFTTA53037045405500005802VN62080804test6304AB76",
  );
});

test("VietQR cho đơn TH STEAM: mã động, nội dung THSTEAM <mã đơn>, đọc ngược đúng", () => {
  const memo = transferMemo("DH26-000012");
  assert.equal(memo, "THSTEAM DH26000012");
  const s = vietQrPayload({ bankBin: "970422", accountNo: "0971 293 031", amount: 5_625_000, memo });
  assert.match(s, /^000201010212/);
  assert.deepEqual(parseVietQr(s), { bankBin: "970422", accountNo: "0971293031", amount: 5625000, memo: "THSTEAM DH26000012" });
  // sửa một ký tự → sai CRC
  assert.equal(parseVietQr(s.replace("5625000", "5625001")), null);
  // mã tĩnh: không có trường số tiền
  const st = vietQrPayload({ bankBin: "970422", accountNo: "123", amount: null });
  assert.match(st, /^000201010211/);
  assert.equal(parseVietQr(st)!.amount, null);
  assert.match(vietQrDataUri({ bankBin: "970422", accountNo: "123", amount: 10000, memo }), /^data:image\/svg\+xml;base64,/);
});

test("VietQR: kiểm dữ liệu và làm sạch nội dung", () => {
  assert.ok(validateVietQr({ bankBin: "97042", accountNo: "1" }).length > 0);
  assert.ok(validateVietQr({ bankBin: "970422", accountNo: "12-34" }).length > 0);
  assert.ok(validateVietQr({ bankBin: "970422", accountNo: "1", amount: 1.5 }).length > 0);
  assert.throws(() => vietQrPayload({ bankBin: "x", accountNo: "1" }));
  assert.equal(vietQrSafeText("Học phí  Đợt 1 — bé An!"), "Hoc phi Dot 1 be An");
  assert.equal(vietQrSafeText("a".repeat(80)).length, 50);
});
