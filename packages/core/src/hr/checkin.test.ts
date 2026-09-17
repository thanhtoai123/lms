import { test } from "node:test";
import assert from "node:assert/strict";
import { checkinToken, checkinPayload, parseCheckinPayload, checkinSig, verifyCheckinToken, checkinUrl, checkPointGeofence, validateCheckinPoint } from "./checkin.js";

const SECRET = "test-secret-cham-cong";
const POINT = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

test("mã QR điểm chấm công: ký, đọc, kiểm", () => {
  const token = checkinToken(SECRET, POINT, 1);
  assert.match(token, /^SRC1\.[0-9a-f]{32}\.1\.[0-9a-f]{16}$/);
  const p = parseCheckinPayload(token);
  assert.equal(p?.pointId, POINT);
  assert.equal(p?.keyVersion, 1);
  assert.equal(parseCheckinPayload("rác"), null);
  assert.equal(parseCheckinPayload("SR1.abc"), null);
  assert.equal(checkinUrl("https://admin.satarobo.vn/", token), `https://admin.satarobo.vn/cham-cong/checkin?t=${encodeURIComponent(token)}`);

  const point = { id: POINT, keyVersion: 1, isActive: true };
  const ok = verifyCheckinToken(SECRET, token, point);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.pointId, POINT);

  // sai chữ ký (mã tự chế)
  const forged = checkinPayload(POINT, 1, "0".repeat(16));
  const bad = verifyCheckinToken(SECRET, forged, point);
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.reason.includes("chữ ký"));

  // ký bằng khoá khác cũng không qua
  assert.equal(verifyCheckinToken(SECRET, checkinToken("khoá-khác", POINT, 1), point).ok, false);

  // đổi đời khoá → mã cũ hết hiệu lực
  const old = verifyCheckinToken(SECRET, token, { ...point, keyVersion: 2 });
  assert.equal(old.ok, false);
  assert.ok(!old.ok && old.reason.includes("Mã cũ"));
  assert.equal(verifyCheckinToken(SECRET, checkinToken(SECRET, POINT, 2), { ...point, keyVersion: 2 }).ok, true);

  // điểm đã ngưng / không tìm thấy
  assert.equal(verifyCheckinToken(SECRET, token, { ...point, isActive: false }).ok, false);
  assert.equal(verifyCheckinToken(SECRET, token, null).ok, false);
  assert.equal(verifyCheckinToken(SECRET, "SR1.x", null).ok, false);

  // chữ ký ổn định
  assert.equal(checkinSig(SECRET, POINT, 1), checkinSig(SECRET, POINT, 1));
  assert.notEqual(checkinSig(SECRET, POINT, 1), checkinSig(SECRET, POINT, 2));
});

test("định vị tại điểm chấm công", () => {
  const point = { lat: 16.0336, lng: 108.2212, radiusM: 100, geofenceEnabled: true };
  assert.equal(checkPointGeofence(point, { lat: 16.0337, lng: 108.2212, accuracy: 12 }).ok, true);
  const far = checkPointGeofence(point, { lat: 16.0436, lng: 108.2212, accuracy: 12 });
  assert.equal(far.ok, false);
  assert.ok(far.flags.includes("outside_geofence"));
  assert.ok((far.distanceM ?? 0) > 1000);
  const noGps = checkPointGeofence(point, null);
  assert.equal(noGps.ok, false);
  assert.ok(noGps.flags.includes("no_gps"));
  const poor = checkPointGeofence(point, { lat: 16.0337, lng: 108.2212, accuracy: 900 });
  assert.equal(poor.ok, false);
  assert.ok(poor.flags.includes("poor_gps"));
  // chưa khai toạ độ → cho qua, ghi cờ
  const noCoord = checkPointGeofence({ lat: null, lng: null, radiusM: 100, geofenceEnabled: true }, null);
  assert.equal(noCoord.ok, true);
  assert.deepEqual(noCoord.flags, ["no_geo_point"]);
  assert.deepEqual(checkPointGeofence({ lat: 16.0336, lng: 108.2212, radiusM: 100, geofenceEnabled: false }, null).flags, []);

  assert.deepEqual(validateCheckinPoint({ name: "Quầy lễ tân", lat: 16.0336, lng: 108.2212, radiusM: 100, geofenceEnabled: true }), []);
  assert.ok(validateCheckinPoint({ name: "Q", lat: null, lng: null, radiusM: 100, geofenceEnabled: false }).length > 0);
  assert.ok(validateCheckinPoint({ name: "Quầy", lat: 16, lng: null, radiusM: 100, geofenceEnabled: false }).some((x) => x.includes("đủ vĩ độ")));
  assert.ok(validateCheckinPoint({ name: "Quầy", lat: 95, lng: 108, radiusM: 100, geofenceEnabled: false }).some((x) => x.includes("Toạ độ")));
  assert.ok(validateCheckinPoint({ name: "Quầy", lat: 16, lng: 108, radiusM: 5, geofenceEnabled: true }).some((x) => x.includes("Bán kính")));
  assert.ok(validateCheckinPoint({ name: "Quầy", lat: null, lng: null, radiusM: 100, geofenceEnabled: true }).some((x) => x.includes("khai toạ độ")));
});
