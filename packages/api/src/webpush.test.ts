import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHmac, createDecipheriv, createPublicKey, verify, randomBytes } from "node:crypto";
import { encryptPayload, generateVapidKeys, vapidAuthorization } from "./webpush.js";

const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

/** Giải mã phía trình duyệt (RFC 8291) để kiểm tra vòng */
function decrypt(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const shared = ua.computeSecret(asPublic);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2);
  return plain.subarray(0, plain.length - 1).toString();
}

test("web push: mã hoá aes128gcm giải được", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const sub = { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
  const msg = JSON.stringify({ title: "Tin nhắn mới", body: "Chào chị, con học tốt" });
  const body = encryptPayload(sub, Buffer.from(msg));
  assert.equal(decrypt(body, ua, auth), msg);
  const other = randomBytes(16);
  assert.throws(() => decrypt(body, ua, other));
  assert.throws(() => encryptPayload({ ...sub, auth: "abc" }, Buffer.from("x")));
  assert.throws(() => encryptPayload(sub, Buffer.alloc(5000)));
});

test("web push: VAPID JWT ES256 hợp lệ", () => {
  const k = { ...generateVapidKeys(), subject: "mailto:test@example.test" };
  assert.equal(Buffer.from(k.publicKey, "base64url").length, 65);
  assert.equal(Buffer.from(k.privateKey, "base64url").length, 32);
  const h = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", k, Date.UTC(2026, 8, 17));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claims = JSON.parse(Buffer.from(m![2]!, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:test@example.test");
  assert.equal(claims.exp, Date.UTC(2026, 8, 17) / 1000 + 43200);
  const pub = Buffer.from(m![4]!, "base64url");
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(`${m![1]}.${m![2]}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(m![3]!, "base64url")));
});

test("web push: khớp ví dụ RFC 8291 mục 5", () => {
  const e = createECDH("prime256v1");
  e.setPrivateKey(Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url"));
  const out = encryptPayload(
    { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
    Buffer.from("When I grow up, I want to be a watermelon"),
    { ecdh: e, salt: Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url") },
  );
  assert.equal(out.toString("base64url"), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
});
