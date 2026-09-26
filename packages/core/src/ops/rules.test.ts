import { test } from "node:test";
import assert from "node:assert/strict";
import { envChecks, envSummary, backupFreshness, heartbeatState, fmtBytes } from "./rules.js";

test("vận hành: kiểm tra biến môi trường", () => {
  const dev = envChecks({ DATABASE_URL: "postgres://postgres:postgres@localhost:5433/x", ALLOW_DEV_ACTOR: "1" }, false);
  const sDev = envSummary(dev);
  assert.equal(sDev.ready, true);
  assert.equal(dev.find((c) => c.key === "ALLOW_DEV_ACTOR")?.status, "weak");
  const prod = envChecks({ DATABASE_URL: "postgres://postgres:postgres@db.example:5432/x", ALLOW_DEV_ACTOR: "1", MEDIA_SIGNING_SECRET: "dev-only", CRON_SECRET: "x".repeat(30), STORAGE_DIR: "data" }, true);
  const s = envSummary(prod);
  assert.equal(s.ready, false);
  assert.equal(prod.find((c) => c.key === "ALLOW_DEV_ACTOR")?.status, "danger");
  assert.equal(prod.find((c) => c.key === "MEDIA_SIGNING_SECRET")?.status, "weak");
  assert.equal(prod.find((c) => c.key === "STORAGE_DIR")?.status, "weak");
  assert.ok(prod.some((c) => c.key === "DATABASE_URL (mật khẩu)"));
  assert.ok(prod.some((c) => c.key === "DATABASE_URL (SSL)"));
  // Chạy thật mà chưa khai kho đối tượng thì CHẶN: để nguyên đĩa cục bộ là mất tệp sau mỗi lần triển khai
  assert.equal(prod.find((c) => c.key === "S3_BUCKET")?.status, "missing");
  assert.equal(prod.find((c) => c.key === "S3_BUCKET")?.level, "required");

  const good = envChecks({
    DATABASE_URL: "postgres://app:Str0ng@db.example:5432/x?sslmode=require", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", SUPABASE_SERVICE_ROLE_KEY: "s", NEXT_PUBLIC_APP_URL: "https://admin.example",
    MEDIA_SIGNING_SECRET: "a".repeat(40), OTP_PEPPER: "b".repeat(20), CRON_SECRET: "c".repeat(30), STORAGE_DIR: "/srv/sata/uploads",
    S3_BUCKET: "satarobo", S3_ENDPOINT: "https://tk.r2.cloudflarestorage.com", S3_ACCESS_KEY_ID: "AKIA", S3_SECRET_ACCESS_KEY: "k".repeat(40),
  }, true);
  assert.equal(envSummary(good).ready, true);
  assert.ok(envSummary(good).warnings > 0);
  assert.ok(JSON.stringify(good).indexOf("Str0ng") === -1, "không lộ giá trị bí mật");
});

test("vận hành: sao lưu, nhịp worker, dung lượng", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  assert.equal(backupFreshness(null, now), "missing");
  assert.equal(backupFreshness(new Date("2026-09-16T20:00:00Z"), now), "ok");
  assert.equal(backupFreshness(new Date("2026-09-15T20:00:00Z"), now), "stale");
  assert.equal(heartbeatState(new Date("2026-09-17T09:57:00Z"), now), "ok");
  assert.equal(heartbeatState(new Date("2026-09-17T09:50:00Z"), now), "stale");
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(1536), "1.5 KB");
  assert.equal(fmtBytes(20 * 1024 * 1024), "20 MB");
});
