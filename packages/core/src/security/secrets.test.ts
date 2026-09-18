import test from "node:test";
import assert from "node:assert/strict";
import { resolveSecret, MissingSecretError, WEAK_SECRETS } from "./secrets.js";

const strong = "x".repeat(48);

test("ngoài production được phép rơi về khoá dev", () => {
  assert.equal(resolveSecret({}, ["MEDIA_SIGNING_SECRET"], { devFallback: "dev-only-media-secret" }, false), "dev-only-media-secret");
});

test("production thiếu khoá thì nổ ngay", () => {
  assert.throws(
    () => resolveSecret({}, ["MEDIA_SIGNING_SECRET"], { devFallback: "dev-only-media-secret" }, true),
    (e: unknown) => e instanceof MissingSecretError && /MEDIA_SIGNING_SECRET/.test((e as Error).message),
  );
});

test("production không nhận khoá mẫu công khai trong mã nguồn", () => {
  // Đúng giá trị mẫu nằm trong mã nguồn → chặn kể cả khi bỏ qua ràng buộc độ dài
  for (const weak of WEAK_SECRETS) {
    assert.throws(
      () => resolveSecret({ K: weak }, ["K"], { devFallback: "x", minLength: 1 }, true),
      MissingSecretError,
      `khoá mẫu "${weak}" phải bị từ chối ở production`,
    );
    // không phân biệt hoa thường
    assert.throws(() => resolveSecret({ K: weak.toUpperCase() }, ["K"], { devFallback: "x", minLength: 1 }, true), MissingSecretError);
  }
});

test("production từ chối khoá quá ngắn", () => {
  assert.throws(() => resolveSecret({ K: "abc" }, ["K"], { devFallback: "x", minLength: 32 }, true), MissingSecretError);
  assert.equal(resolveSecret({ K: strong }, ["K"], { devFallback: "x", minLength: 32 }, true), strong);
});

test("lấy theo thứ tự ưu tiên, bỏ qua biến rỗng", () => {
  const env = { PII_ENCRYPTION_KEY: "  ", MEDIA_SIGNING_SECRET: strong };
  assert.equal(resolveSecret(env, ["PII_ENCRYPTION_KEY", "MEDIA_SIGNING_SECRET"], { devFallback: "d" }, true), strong);
  const env2 = { PII_ENCRYPTION_KEY: "y".repeat(40), MEDIA_SIGNING_SECRET: strong };
  assert.equal(resolveSecret(env2, ["PII_ENCRYPTION_KEY", "MEDIA_SIGNING_SECRET"], { devFallback: "d" }, true), "y".repeat(40));
});

test("khoảng trắng thừa được cắt bỏ", () => {
  assert.equal(resolveSecret({ K: `  ${strong}  ` }, ["K"], { devFallback: "d" }, true), strong);
});
