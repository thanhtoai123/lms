import { connection } from "next/server";
import { getDb } from "@satarobo/db";
import { publicBrand } from "@satarobo/api";
import { BRAND_DEFAULT_COLORS, TH_BRAND } from "@satarobo/core";

export interface BrandInfo {
  primary: string; accent: string; name: string; logoUrl: string; hasLogo: boolean; version: number;
  /** Logo ngang chính thức (biểu tượng + chữ + tagline) cho nền sáng / nền Midnight Navy. null khi trung tâm đã tải logo riêng */
  lockup: string | null; lockupOnDark: string | null;
}

const LOCKUP = { lockup: TH_BRAND.logo.horizontal, lockupOnDark: TH_BRAND.logo.horizontalOnDark };
const FALLBACK: BrandInfo = { ...BRAND_DEFAULT_COLORS, name: TH_BRAND.name, logoUrl: TH_BRAND.logo.favicon, hasLogo: false, version: 0, ...LOCKUP };

/** Thông tin nhận diện hiện hành (màu, tên, logo) cho trang máy chủ. Lỗi CSDL thì dùng mặc định — không làm sập trang. */
export async function loadBrand(): Promise<BrandInfo> {
  // Đọc CSDL theo từng yêu cầu: không để Next dựng sẵn (và đóng băng) màu / logo lúc build
  await connection();
  try {
    const b = await publicBrand(getDb());
    return {
      primary: b.primary, accent: b.accent, name: b.name, hasLogo: b.hasLogo, version: b.version,
      logoUrl: b.hasLogo ? `/api/public/brand/logo?v=${b.version}` : TH_BRAND.logo.favicon,
      ...(b.hasLogo ? { lockup: null, lockupOnDark: null } : LOCKUP),
    };
  } catch {
    return FALLBACK;
  }
}

export const BRAND_FALLBACK = FALLBACK;
