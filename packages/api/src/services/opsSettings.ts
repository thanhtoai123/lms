import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appSettings, centers, type Database } from "@satarobo/db";
import { authorize, authorizeGlobal, hasPermission, resolveOps, validateOps, OPS_GROUPS, OPS_DEFAULTS, type OpsGroup, type OpsSettings, type OpsField } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const keyOf = (centerId: string | null) => (centerId ? `ops:${centerId}` : "ops");

/** Tham số vận hành hiệu lực (mặc định ← toàn hệ thống ← cơ sở) */
export async function getOps(db: Db | Database, centerId: string | null = null): Promise<OpsSettings> {
  const d = db as unknown as Db;
  const keys = centerId ? ["ops", keyOf(centerId)] : ["ops"];
  const rows = await d.select({ key: appSettings.key, value: appSettings.value }).from(appSettings).where(inArray(appSettings.key, keys));
  const g = rows.find((r) => r.key === "ops")?.value as Record<string, unknown> | undefined;
  const c = centerId ? (rows.find((r) => r.key === keyOf(centerId))?.value as Record<string, unknown> | undefined) : undefined;
  return resolveOps(g ?? null, c ?? null);
}

export async function opsGroup(ctx: ProtectedContext, input: { group: OpsGroup; centerId: string | null }) {
  if (!hasPermission(ctx.actor, "automation:read")) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền" });
  const rows = await ctx.db.select().from(appSettings).where(inArray(appSettings.key, input.centerId ? ["ops", keyOf(input.centerId)] : ["ops"]));
  const g = (rows.find((r) => r.key === "ops")?.value ?? {}) as Record<string, unknown>;
  const c = input.centerId ? ((rows.find((r) => r.key === keyOf(input.centerId!))?.value ?? {}) as Record<string, unknown>) : {};
  const eff = resolveOps(g, input.centerId ? c : null);
  const fields = (OPS_GROUPS[input.group] as readonly OpsField[]).map((f) => ({
    ...f,
    value: eff[f.key as keyof OpsSettings],
    globalValue: resolveOps(g, null)[f.key as keyof OpsSettings],
    defaultValue: OPS_DEFAULTS[f.key as keyof OpsSettings],
    overridden: input.centerId ? f.key in c : f.key in g,
    editable: input.centerId ? f.scope === "center" : true,
  }));
  const canEdit = input.centerId ? authorize(ctx.actor, "automation:update", { centerId: input.centerId }).allowed : authorizeGlobal(ctx.actor, "system:configure");
  return { fields, canEdit };
}

export async function saveOpsGroup(ctx: ProtectedContext, input: { group: OpsGroup; centerId: string | null; values: Record<string, number | boolean | null>; reason?: string | null }) {
  const level = input.centerId ? "center" : "global";
  const ok = input.centerId ? authorize(ctx.actor, "automation:update", { centerId: input.centerId }).allowed : authorizeGlobal(ctx.actor, "system:configure");
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: input.centerId ? "Không có quyền cấu hình cơ sở này" : "Chỉ quản trị Hội sở đặt mặc định toàn hệ thống" });
  if (input.centerId && !(await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) }))) throw new TRPCError({ code: "NOT_FOUND", message: "Không có cơ sở" });
  const errs = validateOps(input.group, input.values, level);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  const key = keyOf(input.centerId);
  const row = await ctx.db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  const before = (row?.value ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(input.values)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  await ctx.db.insert(appSettings).values({ key, value: next, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: ctx.user.id, updatedAt: new Date() } });
  const changed = Object.keys(input.values).filter((k) => before[k] !== next[k]);
  if (changed.length) {
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "ops_settings", entityId: input.centerId, before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, next[k] ?? null])), reason: input.reason ?? null, ip: ctx.ip });
  }
  return { ok: true, changed: changed.length };
}

/** Tham số hiệu lực cho nhiều cơ sở một lần */
export async function opsForCenters(db: Db | Database, centerIds: string[]): Promise<Map<string, OpsSettings>> {
  const d = db as unknown as Db;
  const ids = [...new Set(centerIds)];
  const rows = await d.select({ key: appSettings.key, value: appSettings.value }).from(appSettings).where(inArray(appSettings.key, ["ops", ...ids.map(keyOf)]));
  const g = rows.find((r) => r.key === "ops")?.value as Record<string, unknown> | undefined;
  return new Map(ids.map((id) => [id, resolveOps(g ?? null, (rows.find((r) => r.key === keyOf(id))?.value as Record<string, unknown> | undefined) ?? null)]));
}
