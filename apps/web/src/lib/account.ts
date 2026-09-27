import type { Role } from "@satarobo/core";

/** Chỉ mang vai trò giáo viên / trợ giảng → trang chính là giao diện giáo viên (/teacher) */
export function laChiGiaoVien(roles: readonly Role[] | readonly string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "TEACHER" || r === "ASSISTANT_TEACHER");
}

