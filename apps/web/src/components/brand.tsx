"use client";
import { createContext, useContext } from "react";
import type { BrandInfo } from "@/lib/brand";

const Ctx = createContext<BrandInfo>({ primary: "#610b8a", accent: "#ff8f2d", name: "Sata Robo", logoUrl: "/icon.svg", hasLogo: false, version: 0 });

/** Đưa nhận diện thương hiệu xuống các thành phần phía trình duyệt (thanh bên, đăng nhập…) */
export function BrandProvider({ value, children }: { value: BrandInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBrand = () => useContext(Ctx);

/** Logo thương hiệu (ảnh đã tải lên, hoặc biểu tượng mặc định). Giữ khung vuông bo góc, ảnh co vừa khung không méo. */
export function BrandLogo({ size = 32, className = "", onColor = false, rounded = "rounded-lg" }: { size?: number; className?: string; /** Đặt trên nền màu thương hiệu: logo tải lên được lót nền trắng để luôn đọc rõ */ onColor?: boolean; rounded?: string }) {
  const b = useBrand();
  const tile = onColor ? (b.hasLogo ? "bg-white p-1" : "bg-white/10") : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 object-contain ${rounded} ${tile} ${className}`} />
  );
}

/** Tên thương hiệu (Cài đặt hệ thống → Tên thương hiệu) */
export function BrandName() {
  return <>{useBrand().name}</>;
}

/** Chữ thương hiệu cho thanh bên: có logo thì kèm logo; tên hai từ (mặc định "Sata Robo") giữ kiểu hai màu như trước */
export function BrandWordmark({ size = 32, textClass = "text-xl" }: { size?: number; textClass?: string }) {
  const b = useBrand();
  const m = /^(\S+)\s+(\S+)$/.exec(b.name);
  return (
    <span className="flex min-w-0 items-center gap-2">
      {b.hasLogo && <BrandLogo size={size} />}
      <span className={`truncate ${textClass} font-extrabold tracking-tight`}>
        {m ? <><span className="text-primary">{m[1]}</span><span className="text-foreground">{m[2]}</span></> : <span className="text-primary">{b.name}</span>}
      </span>
    </span>
  );
}
