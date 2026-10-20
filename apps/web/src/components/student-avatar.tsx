import { avatarInitial, avatarTone } from "@satarobo/core";

/**
 * ẢNH ĐẠI DIỆN HỌC VIÊN — ảnh đã tải lên, hoặc chữ cái đầu tên gọi trên nền màu thương hiệu (cố định theo `seed`).
 * Không hook → dùng được ở trang máy chủ, trang phụ huynh, bản in hồ sơ.
 */
export function StudentAvatar({
  src, name, nickname, seed, size = 48, className = "", rounded = "rounded-full", ring = false, eager = false,
}: { /** Tải ngay (ảnh ở đầu trang / bản in PDF) thay vì tải lười */ eager?: boolean; src?: string | null; name: string; nickname?: string | null; seed?: string | null; size?: number; className?: string; rounded?: string; ring?: boolean }) {
  const style = { width: size, height: size };
  const ringCls = ring ? "ring-4 ring-white shadow-md" : "";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`Ảnh của ${name}`} width={size} height={size} style={style} loading={eager ? "eager" : "lazy"} className={`shrink-0 object-cover ${rounded} ${ringCls} ${className}`} />
    );
  }
  const t = avatarTone(seed || name);
  return (
    <span role="img" aria-label={`Ảnh của ${name} (chưa có)`} style={{ ...style, background: t.bg, color: t.fg, fontSize: Math.round(size * 0.42) }}
      className={`inline-grid shrink-0 select-none place-items-center font-extrabold ${rounded} ${ringCls} ${className}`}>
      {avatarInitial({ fullName: name, nickname })}
    </span>
  );
}
