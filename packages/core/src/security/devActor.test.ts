import test from "node:test";
import assert from "node:assert/strict";
import { devActorAllowed, isProductionEnv, normalizeDevActor, DEV_ACTOR_HEADER } from "./devActor.js";

test("tài khoản mẫu bị tắt tuyệt đối ở production", () => {
  // Trước đây ALLOW_DEV_ACTOR_IN_PRODUCTION mở lại được cửa hậu này
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: "production" }), false);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: "PRODUCTION" }), false);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: " production " }), false);
  // Kể cả khi có thêm biến môi trường lạ
  const env = { ALLOW_DEV_ACTOR: "1", NODE_ENV: "production", ALLOW_DEV_ACTOR_IN_PRODUCTION: "1" } as Record<string, string>;
  assert.equal(devActorAllowed(env), false);
});

test("tài khoản mẫu chỉ bật khi đúng ALLOW_DEV_ACTOR=1 ngoài production", () => {
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: "development" }), true);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: undefined }), true);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "1", NODE_ENV: "test" }), true);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "0", NODE_ENV: "development" }), false);
  assert.equal(devActorAllowed({ ALLOW_DEV_ACTOR: "true", NODE_ENV: "development" }), false);
  assert.equal(devActorAllowed({ NODE_ENV: "development" }), false);
  assert.equal(devActorAllowed({}), false);
});

test("nhận diện môi trường chạy thật", () => {
  assert.equal(isProductionEnv({ NODE_ENV: "production" }), true);
  assert.equal(isProductionEnv({ NODE_ENV: "Production" }), true);
  assert.equal(isProductionEnv({ NODE_ENV: "staging" }), false);
  assert.equal(isProductionEnv({}), false);
});

test("email tài khoản mẫu phải hợp lệ mới được dùng", () => {
  assert.equal(normalizeDevActor("Superadmin@Example.Test"), "superadmin@example.test");
  assert.equal(normalizeDevActor("  teacher1@satarobo.vn "), "teacher1@satarobo.vn");
  assert.equal(normalizeDevActor("khong-phai-email"), null);
  assert.equal(normalizeDevActor(""), null);
  assert.equal(normalizeDevActor(null), null);
  assert.equal(normalizeDevActor("a@b.c" + "x".repeat(300)), null);
  // Không cho chèn khoảng trắng / xuống dòng (chống nhét header)
  assert.equal(normalizeDevActor("a@b.co\nx-admin: 1"), null);
});

test("tên header tài khoản mẫu cố định", () => {
  assert.equal(DEV_ACTOR_HEADER, "x-dev-actor");
});
