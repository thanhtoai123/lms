"use client";
import { createContext, useContext } from "react";
import type { BrandInfo } from "@/lib/brand";

const Ctx = createContext<BrandInfo>({ primary: "#1d4ed8", accent: "#f59e0b", name: "TH STEAM Academy", logoUrl: "/icon.svg", hasLogo: false, version: 0, lockup: "/thsteam/logo-ngang.svg", lockupOnDark: "/thsteam/logo-ngang-trang.svg" });

/** Đưa nhận diện thương hiệu xuống các thành phần phía trình duyệt (thanh bên, đăng nhập…) */
export function BrandProvider({ value, children }: { value: BrandInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBrand = () => useContext(Ctx);

/** Logo thương hiệu (ảnh đã tải lên, hoặc biểu tượng mặc định). Giữ khung vuông bo góc, ảnh co vừa khung không méo. */
export function BrandLogo({ size = 32, className = "", onColor = false, rounded = "rounded-lg" }: { size?: number; className?: string; /** Đặt trên nền màu thương hiệu: logo tải lên được lót nền trắng để luôn đọc rõ */ onColor?: boolean; rounded?: string }) {
  const b = useBrand();
  // Trên nền màu (xanh thương hiệu) biểu tượng TH màu xanh sẽ chìm → luôn lót nền trắng (bộ nhận diện: không đặt logo màu trên nền rối)
  const tile = onColor ? "bg-white p-1" : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 object-contain ${rounded} ${tile} ${className}`} />
  );
}

/** Tên thương hiệu (Cài đặt hệ thống → Tên thương hiệu) */
export function BrandName() {
  return <>{useBrand().name}</>;
}

/**
 * LOGO NGANG CHÍNH THỨC (biểu tượng TH + "TH STEAM ACADEMY" + tagline) — dùng ở mọi đầu trang / thanh bên.
 * `onDark`: đặt trên nền Midnight Navy → bản chữ trắng, tagline vàng (bộ nhận diện: không đặt logo màu trên nền xanh).
 * Trung tâm đã tải logo riêng (Cài đặt hệ thống → Nhận diện) thì hiện logo đó kèm tên thương hiệu.
 */
export function BrandLockup({ height = 32, onDark = false, vertical = false, className = "" }: { height?: number; onDark?: boolean; /** Logo đứng (biểu tượng trên, chữ dưới) */ vertical?: boolean; className?: string }) {
  const b = useBrand();
  const h = onDark ? b.lockupOnDark : b.lockup;
  const src = h && vertical ? (onDark ? "/thsteam/logo-dung-trang.svg" : "/thsteam/logo-dung.svg") : h;
  if (src) {
    // Tỉ lệ logo ngang ≈ 7,13 : 1, logo đứng 2 : 1 — đặt sẵn width để không nhảy bố cục khi ảnh tải
    const w = Math.round(height * (vertical ? 1.9994 : 7.127));
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={b.name} width={w} height={height} style={{ height, width: "auto", maxWidth: "100%" }} className={`block shrink-0 ${className}`} />
    );
  }
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <BrandLogo size={height} rounded="rounded-md" onColor={onDark} />
      <span className={`truncate text-[15px] font-extrabold tracking-tight ${onDark ? "text-white" : "text-foreground"}`}>{b.name}</span>
    </span>
  );
}

/**
 * Chữ thương hiệu cho thanh bên: biểu tượng (logo tải lên hoặc biểu tượng TH mặc định) + tên.
 * Tên nhiều từ (vd "TH STEAM Academy") viết IN HOA màu navy như wordmark của bộ nhận diện; tên hai từ giữ kiểu hai màu.
 */
export function BrandWordmark({ size = 32, textClass = "text-xl" }: { size?: number; textClass?: string }) {
  const b = useBrand();
  if (b.lockup) return <BrandLockup height={size} />;
  const m = /^(\S+)\s+(\S+)$/.exec(b.name);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <BrandLogo size={size} rounded="rounded-md" />
      <span className={`truncate ${textClass} font-extrabold tracking-tight`}>
        {m ? <><span className="text-primary">{m[1]}</span><span className="text-foreground">{m[2]}</span></> : <span className="uppercase text-foreground">{b.name}</span>}
      </span>
    </span>
  );
}
