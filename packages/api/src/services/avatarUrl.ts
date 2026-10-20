import { AVATAR_URL_TTL } from "@satarobo/core";
import { signedMediaUrl } from "../storage";

/** URL hiển thị ảnh đại diện học viên (có chữ ký, hết hạn sau AVATAR_URL_TTL) — null khi chưa có ảnh */
export function studentAvatarUrl(key: string | null | undefined): string | null {
  return key ? signedMediaUrl(key, AVATAR_URL_TTL) : null;
}
