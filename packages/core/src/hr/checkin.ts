/**
 * Điểm chấm công & mã QR quầy.
 *
 * Mã QR **cố định** (in dán ở quầy / chiếu trên màn hình): ảnh chụp lại vẫn quét được —
 * thứ chặn người ở xa là **định vị**. Mã mang chữ ký HMAC để không ai tự chế được
 * đường dẫn chấm công; "đời khoá" (keyVersion) cho phép in lại mã mới, mã cũ hết hiệu lực.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { haversineM } from "./rules.js";

export const CHECKIN_PREFIX = "SRC1";

const hex32 = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
const unhex32 = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

/** Chữ ký của điểm chấm công (16 hex đầu của HMAC-SHA256) */
export function checkinSig(secret: string, pointId: string, keyVersion: number): string {
  return createHmac("sha256", secret).update(`checkin|${hex32(pointId)}|${keyVersion}`).digest("hex").slice(0, 16);
}

/** Chuỗi trong mã QR: SRC1.<id 32 hex>.<đời khoá>.<chữ ký 16 hex> */
export function checkinPayload(pointId: string, keyVersion: number, sig: string): string {
  return `${CHECKIN_PREFIX}.${hex32(pointId)}.${keyVersion}.${sig}`;
}

export function checkinToken(secret: string, pointId: string, keyVersion: number): string {
  return checkinPayload(pointId, keyVersion, checkinSig(secret, pointId, keyVersion));
}

export function parseCheckinPayload(code: string): { pointId: string; keyVersion: number; sig: string } | null {
  const m = /^SRC1\.([0-9a-f]{32})\.(\d{1,4})\.([0-9a-f]{16})$/.exec(code.trim());
  if (!m) return null;
  return { pointId: unhex32(m[1]!), keyVersion: Number(m[2]), sig: m[3]! };
}

/** Đường dẫn quét: /cham-cong/checkin?t=<mã> */
export function checkinUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/cham-cong/checkin?t=${encodeURIComponent(token)}`;
}

export interface CheckinPointLite {
  id: string;
  keyVersion: number;
  isActive: boolean;
}

export type CheckinVerify =
  | { ok: true; pointId: string; keyVersion: number }
  | { ok: false; reason: string; pointId: string | null };

/**
 * Kiểm tra mã quét: đúng định dạng → đúng chữ ký → đúng đời khoá → điểm còn dùng.
 * `point` là bản ghi đọc từ CSDL theo pointId trong mã (null = không tìm thấy).
 */
export function verifyCheckinToken(secret: string, code: string, point: CheckinPointLite | null): CheckinVerify {
  const p = parseCheckinPayload(code);
  if (!p) return { ok: false, reason: "Mã không phải mã chấm công Sata Robo", pointId: null };
  const expect = checkinSig(secret, p.pointId, p.keyVersion);
  if (expect.length !== p.sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(p.sig))) {
    return { ok: false, reason: "Mã chấm công không hợp lệ (sai chữ ký)", pointId: p.pointId };
  }
  if (!point) return { ok: false, reason: "Không tìm thấy điểm chấm công", pointId: p.pointId };
  if (point.keyVersion !== p.keyVersion) return { ok: false, reason: "Mã cũ đã được thay — quét mã mới dán tại quầy", pointId: p.pointId };
  if (!point.isActive) return { ok: false, reason: "Điểm chấm công đã ngưng sử dụng", pointId: p.pointId };
  return { ok: true, pointId: p.pointId, keyVersion: p.keyVersion };
}

export const CHECKIN_MAX_ACCURACY_M = 200;
export const CHECKIN_RADIUS_RANGE = { min: 20, max: 2000 } as const;

export interface CheckinPointGeo {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  geofenceEnabled: boolean;
}

export interface CheckinPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/**
 * Kiểm định vị tại điểm chấm công. Điểm đã khai toạ độ + bật kiểm → bắt buộc trong bán kính.
 * Sai số GPS được cộng bù tối đa 50m để không chặn oan người đứng ngay cửa.
 */
export function checkPointGeofence(point: CheckinPointGeo, pos: CheckinPosition | null): { ok: boolean; distanceM: number | null; reason: string | null; checked: boolean; flags: string[] } {
  if (!point.geofenceEnabled || point.lat == null || point.lng == null) {
    return { ok: true, distanceM: null, reason: null, checked: false, flags: point.geofenceEnabled ? ["no_geo_point"] : [] };
  }
  if (!pos) return { ok: false, distanceM: null, reason: "Cần bật định vị để chấm công", checked: true, flags: ["no_gps"] };
  if (pos.accuracy != null && pos.accuracy > CHECKIN_MAX_ACCURACY_M) {
    return { ok: false, distanceM: null, reason: `GPS sai số ${Math.round(pos.accuracy)}m — ra chỗ thoáng và thử lại`, checked: true, flags: ["poor_gps"] };
  }
  const d = haversineM({ lat: point.lat, lng: point.lng }, pos);
  const slack = Math.min(pos.accuracy ?? 0, 50);
  if (d > point.radiusM + slack) {
    return { ok: false, distanceM: d, reason: `Bạn đang cách điểm chấm công ${d}m (cho phép ${point.radiusM}m)`, checked: true, flags: ["outside_geofence"] };
  }
  return { ok: true, distanceM: d, reason: null, checked: true, flags: [] };
}

/** Kiểm tra khai báo điểm chấm công */
export function validateCheckinPoint(p: { name: string; lat: number | null; lng: number | null; radiusM: number; geofenceEnabled: boolean }): string[] {
  const e: string[] = [];
  if (p.name.trim().length < 2) e.push("Tên điểm tối thiểu 2 ký tự");
  if ((p.lat == null) !== (p.lng == null)) e.push("Nhập đủ vĩ độ và kinh độ, hoặc để trống cả hai");
  if (p.lat != null && (Math.abs(p.lat) > 90 || Math.abs(p.lng!) > 180)) e.push("Toạ độ không hợp lệ");
  if (p.radiusM < CHECKIN_RADIUS_RANGE.min || p.radiusM > CHECKIN_RADIUS_RANGE.max) e.push(`Bán kính ${CHECKIN_RADIUS_RANGE.min}–${CHECKIN_RADIUS_RANGE.max}m`);
  if (p.geofenceEnabled && p.lat == null) e.push("Bật kiểm định vị thì phải khai toạ độ");
  return e;
}
