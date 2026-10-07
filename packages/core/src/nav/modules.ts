/**
 * MODULE BẬT / TẮT — để người dùng không bị "ngợp": các nhóm ít dùng được ẨN KHỎI MENU mặc định,
 * quản trị bật lại ở Cài đặt → "Bật / tắt module" khi trung tâm cần.
 *
 * Chỉ là lọc HIỂN THỊ: không xoá dữ liệu, không đổi quyền; trang vẫn mở được bằng đường dẫn (bookmark, liên kết
 * trong thông báo) và quyền vẫn do `perm` + service kiểm. Mục / chip gắn module qua trường `module` trong `menu.ts`.
 * Cấu hình lưu một dòng `app_settings` khoá "modules".
 */
import type { Role } from "../policy/policy.js";
import type { NavGroup, NavItem, NavTab } from "./menu.js";

export interface ModuleDef {
  key: string;
  label: string;
  desc: string;
  /** Bật sẵn khi chưa ai cấu hình? */
  defaultOn: boolean;
  /** Vai trò luôn thấy module này trong menu dù đang tắt (người "sở hữu" nghiệp vụ) */
  ownerRoles?: readonly Role[];
}

export const MODULES: readonly ModuleDef[] = [
  { key: "marketing", label: "Website & marketing", desc: "Tin tức, nội dung website, theo dõi nguồn khách (tracking, funnel).", defaultOn: false, ownerRoles: ["HO_MARKETING"] },
  { key: "franchise", label: "Nhượng quyền", desc: "Quản lý đối tác nhượng quyền (nhiều pháp nhân). Một pháp nhân duy nhất thì không cần.", defaultOn: false },
  { key: "recruitment", label: "Tuyển dụng", desc: "Tin tuyển dụng, ứng viên, phỏng vấn.", defaultOn: false },
  { key: "satacoin", label: "SataCoin", desc: "Sổ xu thưởng cho học viên. Bật khi trung tâm chạy chương trình thưởng.", defaultOn: false },
  { key: "golive", label: "Go-live & đo pilot", desc: "Công cụ chuyển hệ và đo giai đoạn đầu. Tắt sau khi chạy ổn định.", defaultOn: false },
];

export type ModuleState = Record<string, boolean>;

/** Đọc cấu hình lưu (dữ liệu lạ / thiếu → dùng mặc định); khoá không còn trong MODULES bị bỏ */
export function normalizeModules(raw: unknown): ModuleState {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: ModuleState = {};
  for (const m of MODULES) out[m.key] = typeof src[m.key] === "boolean" ? (src[m.key] as boolean) : m.defaultOn;
  return out;
}

/**
 * Bỏ mục / chip thuộc module đang tắt (trừ vai trò sở hữu). Mục hết chip thì bỏ; nhóm hết mục thì bỏ.
 * href của mục trung tâm = chip đầu còn lại.
 */
export function applyModules(menu: readonly NavGroup[], state: ModuleState, roles: readonly Role[] = []): NavGroup[] {
  const off = (key: string | undefined): boolean => {
    if (!key) return false;
    const def = MODULES.find((m) => m.key === key);
    if (!def) return false;
    if (state[key] ?? def.defaultOn) return false;
    return !(def.ownerRoles ?? []).some((r) => roles.includes(r));
  };
  const out: NavGroup[] = [];
  for (const g of menu) {
    const items: NavItem[] = [];
    for (const i of g.items) {
      if (off(i.module)) continue;
      if (i.tabs) {
        const tabs: NavTab[] = i.tabs.filter((t) => !off(t.module));
        const first = tabs[0];
        if (!first) continue;
        items.push(tabs.length === i.tabs.length ? i : { ...i, href: first.href, tabs });
      } else items.push(i);
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}

/** Số mục / chip của menu gắn với từng module (hiển thị ở màn bật / tắt: "ảnh hưởng N mục menu") */
export function moduleUsage(menu: readonly NavGroup[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (k: string | undefined, label: string) => { if (k) (out[k] ??= []).push(label); };
  for (const g of menu) for (const i of g.items) {
    add(i.module, i.label);
    for (const t of i.tabs ?? []) if (t.module && t.module !== i.module) add(t.module, `${i.label} › ${t.label}`);
  }
  return out;
}
