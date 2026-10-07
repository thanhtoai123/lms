import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appSettings, users } from "@satarobo/db";
import { MODULES, hasRole, normalizeModules, moduleUsage, ADMIN_MENU, type ModuleState } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"] | import("@satarobo/db").Database;

/**
 * Module bật / tắt (nav/modules.ts): chỉ ẩn / hiện MENU, không xoá dữ liệu, không đổi quyền.
 * Lưu một dòng `app_settings` khoá "modules".
 */
export async function getModules(db: Db): Promise<ModuleState> {
  const r = await (db as ProtectedContext["db"]).query.appSettings.findFirst({ where: eq(appSettings.key, "modules") });
  return normalizeModules(r?.value);
}

/** Màn Cài đặt → Bật / tắt module */
export async function modulesForAdmin(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const [state, row] = await Promise.all([
    getModules(ctx.db),
    ctx.db.select({ s: appSettings, byName: users.fullName }).from(appSettings).leftJoin(users, eq(users.id, appSettings.updatedBy)).where(eq(appSettings.key, "modules")),
  ]);
  const usage = moduleUsage(ADMIN_MENU);
  return {
    modules: MODULES.map((m) => ({ key: m.key, label: m.label, desc: m.desc, on: state[m.key] ?? m.defaultOn, defaultOn: m.defaultOn, affects: usage[m.key] ?? [] })),
    updatedAt: row[0]?.s.updatedAt ?? null,
    updatedBy: row[0]?.byName ?? null,
    canEdit: hasRole(ctx.actor, "SUPER_ADMIN"),
  };
}

export async function saveModules(ctx: ProtectedContext, input: { state: Record<string, boolean> }) {
  requirePermission(ctx, "system:update");
  if (!hasRole(ctx.actor, "SUPER_ADMIN")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Quản trị hệ thống được bật / tắt module" });
  const known = new Set(MODULES.map((m) => m.key));
  for (const k of Object.keys(input.state)) if (!known.has(k)) throw new TRPCError({ code: "BAD_REQUEST", message: `Module không tồn tại: ${k}` });
  const before = await getModules(ctx.db);
  const next = normalizeModules({ ...before, ...input.state });
  const changed = MODULES.filter((m) => before[m.key] !== next[m.key]).map((m) => m.key);
  if (!changed.length) return { ok: true, changed: [] as string[] };
  await ctx.db.insert(appSettings).values({ key: "modules", value: next, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "modules", entityId: null, before, after: next, ip: ctx.ip });
  return { ok: true, changed };
}
