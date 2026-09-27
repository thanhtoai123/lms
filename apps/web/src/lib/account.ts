import type { Role } from "@satarobo/core";

/** Chỉ mang vai trò giáo viên / trợ giảng → trang chính là giao diện giáo viên (/teacher) */
export function laChiGiaoVien(roles: readonly Role[] | readonly string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "TEACHER" || r === "ASSISTANT_TEACHER");
}

/** Trang "về nhà" hợp vai trò — dùng cho nút quay lại ở các trang tài khoản đứng riêng */
export function trangChinh(roles: readonly Role[] | readonly string[]): { href: string; label: string } {
  return laChiGiaoVien(roles) ? { href: "/teacher", label: "Giao diện giáo viên" } : { href: "/viec-hom-nay", label: "Quản trị" };
}
