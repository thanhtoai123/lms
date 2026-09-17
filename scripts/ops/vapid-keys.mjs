// Tạo cặp khoá VAPID cho thông báo đẩy: node scripts/ops/vapid-keys.mjs
// Dán 2 dòng kết quả vào .env của máy chủ. Giữ nguyên khoá sau khi đã dùng (đổi khoá = mọi thiết bị phải bật lại thông báo).
import { generateKeyPairSync } from "node:crypto";
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${pub}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log("VAPID_SUBJECT=mailto:hotro@satarobo.vn");
