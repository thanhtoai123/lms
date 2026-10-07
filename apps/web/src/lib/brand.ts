import { connection } from "next/server";
import { getDb } from "@satarobo/db";
import { publicBrand } from "@satarobo/api";
import { BRAND_DEFAULT_COLORS } from "@satarobo/core";

export interface BrandInfo { primary: string; accent: string; name: string; logoUrl: string; hasLogo: boolean; version: number }

const FALLBACK: BrandInfo = { ...BRAND_DEFAULT_COLORS, name: "Sata Robo", logoUrl: "/icon.svg", hasLogo: false, version: 0 };

/** Thông tin nhận diện hiện hành (màu, tên, logo) cho trang máy chủ. Lỗi CSDL thì dùng mặc định — không làm sập trang. */
export async function loadBrand(): Promise<BrandInfo> {
  // Đọc CSDL theo từng yêu cầu: không để Next dựng sẵn (và đóng băng) màu / logo lúc build
  await connection();
  try {
    const b = await publicBrand(getDb());
    return { primary: b.primary, accent: b.accent, name: b.name, hasLogo: b.hasLogo, version: b.version, logoUrl: b.hasLogo ? `/api/public/brand/logo?v=${b.version}` : "/icon.svg" };
  } catch {
    return FALLBACK;
  }
}

export const BRAND_FALLBACK = FALLBACK;
