/**
 * Menu khu quản trị — cây menu nằm ở MỘT NƠI: `packages/core/src/nav/menu.ts` (có bộ kiểm thử
 * `menu.test.ts`). Tệp này chỉ giữ tên cũ cho các chỗ đang import từ "@/lib/admin-nav".
 * Kiến trúc, lý do gộp và bảng chuyển hướng: docs/KIEN-TRUC-MENU.md.
 */
import { ADMIN_MENU, activeNavItem, type NavGroup, type NavItem, type NavTab } from "@satarobo/core";

export type { NavGroup, NavItem, NavTab };

export const ADMIN_NAV: NavGroup[] = ADMIN_MENU;

export const ALL_NAV_ITEMS: (NavItem & { group: string })[] = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function findNavItem(pathname: string) {
  return activeNavItem(pathname, ALL_NAV_ITEMS);
}
