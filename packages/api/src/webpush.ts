/**
 * Web Push không cần thư viện ngoài:
 * - Mã hoá nội dung theo RFC 8291 (aes128gcm, RFC 8188).
 * - Xác thực máy chủ VAPID theo RFC 8292 (JWT ES256).
 */
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign, generateKeyPairSync, type KeyObject } from "node:crypto";

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** HKDF (RFC 5869) rút gọn cho độ dài ≤ 32 byte */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);
}

export interface PushSubscriptionKeys { endpoint: string; p256dh: string; auth: string }

/** Mã hoá payload → thân request (header salt|rs|idlen|keyid + ciphertext) */
export function encryptPayload(sub: { p256dh: string; auth: string }, payload: Buffer, opts: { salt?: Buffer; ecdh?: ReturnType<typeof createECDH> } = {}): Buffer {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh không hợp lệ");
  if (authSecret.length !== 16) throw new Error("auth không hợp lệ");
  const ecdh = opts.ecdh ?? createECDH("prime256v1");
  if (!opts.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const salt = opts.salt ?? randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const rs = 4096;
  if (payload.length + 1 + 16 > rs - 86) throw new Error("Nội dung thông báo quá dài");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ct]);
}

export interface VapidKeys { publicKey: string; privateKey: string; subject: string }

export function vapidKeysFromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:hotro@satarobo.vn" };
}

/** Tạo cặp khoá VAPID (base64url: public 65 byte, private 32 byte) */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as { x: string; y: string; d: string };
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])), privateKey: jwk.d };
}

function vapidPrivateKey(k: VapidKeys): KeyObject {
  const pub = fromB64u(k.publicKey);
  if (pub.length !== 65) throw new Error("VAPID_PUBLIC_KEY không hợp lệ");
  return createPrivateKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: k.privateKey }, format: "jwk" });
}

export function vapidAuthorization(endpoint: string, k: VapidKeys, now = Date.now()): string {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: k.subject })));
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(k), dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${k.publicKey}`;
}

export async function sendWebPush(sub: PushSubscriptionKeys, payload: object, k: VapidKeys, opts: { ttl?: number; urgency?: "normal" | "high" } = {}): Promise<{ status: number } | null> {
  const body = encryptPayload(sub, Buffer.from(JSON.stringify(payload)));
  try {
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: { Authorization: vapidAuthorization(sub.endpoint, k), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(opts.ttl ?? 86_400), Urgency: opts.urgency ?? "normal" },
      body,
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    return { status: r.status };
  } catch {
    return null;
  }
}
