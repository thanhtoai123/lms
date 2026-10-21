import test from "node:test";
import assert from "node:assert/strict";
import { fbcFromUrl, metaCapiLeadEvent, normalizeVnPhoneE164Digits, sha256Hex } from "./capi.js";

test("CAPI: chuẩn hoá số Việt Nam trước khi băm", () => {
  assert.equal(normalizeVnPhoneE164Digits("0971 29 30 31"), "84971293031");
  assert.equal(normalizeVnPhoneE164Digits("+84 971.293.031"), "84971293031");
  assert.equal(normalizeVnPhoneE164Digits("123"), "");
});

test("CAPI: SHA-256 đúng chuẩn (vector công khai)", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("CAPI: sự kiện Lead có event_id trùng Pixel, không chứa số điện thoại gốc", async () => {
  const e = await metaCapiLeadEvent({ eventId: "lp-abc", eventTimeSec: 1792569600.7, url: "https://thsteam.edu.vn/?nganh=ai", ip: "1.2.3.4", userAgent: "UA", fbp: "fb.1.1700000000000.123456", fbc: "bad value", phone: "0971293031", interest: "Trí tuệ nhân tạo AI" });
  assert.equal(e.event_name, "Lead");
  assert.equal(e.event_id, "lp-abc");
  assert.equal(e.event_time, 1792569600);
  const u = e.user_data as Record<string, unknown>;
  assert.equal((u.ph as string[])[0], await sha256Hex("84971293031"));
  assert.equal(u.fbp, "fb.1.1700000000000.123456");
  assert.equal(u.fbc, undefined, "fbc sai định dạng bị bỏ");
  assert.doesNotMatch(JSON.stringify(e), /0971293031|84971293031/);
});

test("CAPI: fbc dựng từ fbclid", () => {
  assert.equal(fbcFromUrl("https://x.vn/?fbclid=IwAR0abcDEF123", 1700000000000), "fb.1.1700000000000.IwAR0abcDEF123");
  assert.equal(fbcFromUrl("https://x.vn/", 1), null);
});
