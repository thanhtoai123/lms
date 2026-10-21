import test from "node:test";
import assert from "node:assert/strict";
import {
  safeEqual, metaSignature, metaSignatureOk, zaloSignature, zaloSignatureOk, timestampFresh, WEBHOOK_MAX_SKEW_MS,
} from "./webhook.js";
import { checkApiKey, parseSepayPayload } from "../finance/bank.js";
import { createHmac } from "node:crypto";
import { sepaySignatureOk } from "./webhook.js";

const RAW = '{"object":"page","entry":[{"messaging":[{"message":{"text":"chao"}}]}]}';
const SECRET = "app-secret-rat-dai-va-bi-mat-0123456789";

test("so chuỗi an toàn thời gian", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

test("Meta: sinh và so khớp chữ ký", () => {
  const sig = metaSignature(RAW, SECRET);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.equal(metaSignatureOk(RAW, sig, SECRET), true);
});

test("Meta: từ chối chữ ký sai, thiếu, sai tiền tố, sai khoá", () => {
  const sig = metaSignature(RAW, SECRET);
  assert.equal(metaSignatureOk(RAW, null, SECRET), false);
  assert.equal(metaSignatureOk(RAW, undefined, SECRET), false);
  assert.equal(metaSignatureOk(RAW, sig, undefined), false, "thiếu khoá thì luôn từ chối");
  assert.equal(metaSignatureOk(RAW, sig.replace("sha256=", ""), SECRET), false, "thiếu tiền tố");
  assert.equal(metaSignatureOk(RAW, metaSignature(RAW, "khoa-khac"), SECRET), false);
  // Body bị sửa một ký tự → chữ ký hỏng
  assert.equal(metaSignatureOk(RAW.replace("chao", "chaa"), sig, SECRET), false);
});

test("Zalo: sinh và so khớp chữ ký kèm dấu thời gian", () => {
  const now = 1_800_000_000_000;
  const ts = String(now);
  const sig = zaloSignature(RAW, "appid123", ts, SECRET);
  assert.match(sig, /^mac=[0-9a-f]{64}$/);
  assert.equal(zaloSignatureOk(RAW, sig, "appid123", SECRET, ts, now), true);
  assert.equal(zaloSignatureOk(RAW, sig, "appid-khac", SECRET, ts, now), false);
  assert.equal(zaloSignatureOk(RAW, sig, "appid123", "khoa-khac", ts, now), false);
  assert.equal(zaloSignatureOk(RAW, sig, "appid123", SECRET, null, now), false);
  assert.equal(zaloSignatureOk(RAW, null, "appid123", SECRET, ts, now), false);
});

test("Zalo: chặn phát lại gói tin cũ (replay)", () => {
  const t = 1_800_000_000_000;
  const ts = String(t);
  const sig = zaloSignature(RAW, "appid123", ts, SECRET);
  // Chữ ký vẫn đúng nhưng gói tin đã cũ 10 phút → từ chối
  assert.equal(zaloSignatureOk(RAW, sig, "appid123", SECRET, ts, t + 10 * 60_000), false);
  assert.equal(zaloSignatureOk(RAW, sig, "appid123", SECRET, ts, t + WEBHOOK_MAX_SKEW_MS - 1), true);
});

test("dấu thời gian: nhận cả giây và mili-giây, từ chối rác", () => {
  const nowMs = 1_800_000_000_000;
  assert.equal(timestampFresh(nowMs, nowMs), true);
  assert.equal(timestampFresh(String(nowMs), nowMs), true);
  assert.equal(timestampFresh(Math.floor(nowMs / 1000), nowMs), true, "giây");
  assert.equal(timestampFresh(nowMs - 10 * 60_000, nowMs), false, "quá cũ");
  assert.equal(timestampFresh(nowMs + 10 * 60_000, nowMs), false, "ở tương lai quá xa");
  assert.equal(timestampFresh("khong-phai-so", nowMs), false);
  assert.equal(timestampFresh("", nowMs), false);
  assert.equal(timestampFresh(null, nowMs), false);
  assert.equal(timestampFresh(undefined, nowMs), false);
  assert.equal(timestampFresh(0, nowMs), false);
  assert.equal(timestampFresh(-5, nowMs), false);
});

test("SePay: so khoá API không lệ thuộc thời gian", () => {
  const key = "sepay-key-rat-dai-0123456789abcdef";
  assert.equal(checkApiKey(`Apikey ${key}`, key), true);
  assert.equal(checkApiKey(`apikey ${key}`, key), true, "không phân biệt hoa thường ở tiền tố");
  assert.equal(checkApiKey(`Apikey  ${key} `, key), true);
  assert.equal(checkApiKey(`Apikey ${key}x`, key), false);
  assert.equal(checkApiKey(`Bearer ${key}`, key), false, "sai kiểu xác thực");
  assert.equal(checkApiKey(key, key), false, "thiếu tiền tố");
  assert.equal(checkApiKey(null, key), false);
  assert.equal(checkApiKey(`Apikey ${key}`, undefined), false, "chưa cấu hình khoá thì luôn từ chối");
  assert.equal(checkApiKey(`Apikey ${key}`, ""), false);
});

test("SePay HMAC-SHA256: ký trên đúng body thô + dấu thời gian, cửa sổ 60 phút", () => {
  const secret = "sepay-secret-0123456789";
  const raw = '{"id":10482,"gateway":"MBBank","transferAmount":250000}';
  const now = Date.UTC(2026, 9, 21, 3, 0, 0);
  const ts = String(Math.floor(now / 1000));
  const sig = `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;
  assert.equal(sepaySignatureOk(raw, sig, ts, secret, now), true);
  assert.equal(sepaySignatureOk(raw, sig.toUpperCase().replace("SHA256=", "sha256="), ts, secret, now), true, "hex in hoa vẫn nhận");
  assert.equal(sepaySignatureOk(raw.replace("250000", "250001"), sig, ts, secret, now), false, "body bị sửa");
  assert.equal(sepaySignatureOk(JSON.stringify(JSON.parse(raw), null, 1), sig, ts, secret, now), false, "parse rồi stringify lại là sai");
  assert.equal(sepaySignatureOk(raw, sig, ts, "khoa-khac-0123456789", now), false);
  assert.equal(sepaySignatureOk(raw, sig, ts, secret, now + 59 * 60_000), true, "SePay gửi lại trong ~33 phút");
  assert.equal(sepaySignatureOk(raw, sig, ts, secret, now + 61 * 60_000), false, "quá cũ");
  assert.equal(sepaySignatureOk(raw, sig, null, secret, now), false);
  assert.equal(sepaySignatureOk(raw, null, ts, secret, now), false);
  assert.equal(sepaySignatureOk(raw, sig, ts, undefined, now), false);
});

test("SePay payload: tài khoản chính + tài khoản ảo, nối mã thanh toán vào nội dung", () => {
  const r = parseSepayPayload({
    id: 92704, gateway: "MBBank", transactionDate: "2026-10-21 09:30:00", accountNumber: "0971 293 031", subAccount: "TKP THS01",
    code: "DH26000012", content: "THSTEAM DH26000012 FT26294", transferType: "in", description: "", transferAmount: 5625000, accumulated: 0, referenceCode: "FT26294",
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.tx.accountNo, "0971293031");
  assert.equal(r.tx.subAccount, "TKPTHS01");
  assert.equal(r.tx.occurredAt, "2026-10-21T09:30:00+07:00");
  assert.match(r.tx.content, /THSTEAM DH26000012/);
  // gửi thử từ SePay (id = 0) vẫn đọc được — chống trùng theo id
  assert.ok(parseSepayPayload({ id: 0, transactionDate: "2026-10-21 09:30:00", accountNumber: "1", transferType: "in", transferAmount: 1, content: "x" }).ok);
  assert.equal(parseSepayPayload({ id: 1, transactionDate: "2026-10-21 09:30:00", accountNumber: "1", transferType: "in", transferAmount: 1.5, content: "x" }).ok, false);
});
