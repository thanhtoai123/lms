import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appSettings, users } from "@satarobo/db";
import {
  BRAND_DEFAULT_COLORS, BRAND_LOGO_MAX, BRAND_LOGO_MIME, normalizeHex, validateBrandColors, svgUnsafeReason, brandCss, hasRole,
  type BrandColors,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { putObject, getObject, deleteObject } from "../storage";

type Db = ProtectedContext["db"];

const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });

/**
 * Nhận diện thương hiệu, lưu một dòng `app_settings` khoá "brand" (tách khỏi "general" để phần cài đặt
 * đọc ở mọi nơi không phải mang theo dữ liệu logo). Logo nằm ở kho tệp, CSDL chỉ giữ khoá + phiên bản.
 */
export interface BrandSettings extends BrandColors {
  logoKey: string | null;
  logoMime: string | null;
  /** Tăng mỗi lần đổi logo / màu — gắn vào URL (?v=) để trình duyệt và CDN lấy bản mới ngay */
  version: number;
}

const BRAND_DEFAULTS: BrandSettings = { ...BRAND_DEFAULT_COLORS, logoKey: null, logoMime: null, version: 0 };

export async function getBrand(db: Db | import("@satarobo/db").Database): Promise<BrandSettings> {
  const r = await (db as Db).query.appSettings.findFirst({ where: eq(appSettings.key, "brand") });
  const v = (r?.value ?? {}) as Partial<BrandSettings>;
  return {
    primary: normalizeHex(v.primary) ?? BRAND_DEFAULTS.primary,
    accent: normalizeHex(v.accent) ?? BRAND_DEFAULTS.accent,
    logoKey: typeof v.logoKey === "string" && /^brand\/logo-[0-9a-f-]{36}\.(png|jpg|webp|svg)$/.test(v.logoKey) ? v.logoKey : null,
    logoMime: typeof v.logoMime === "string" && BRAND_LOGO_MIME[v.logoMime] ? v.logoMime : null,
    version: Number.isFinite(v.version) ? Number(v.version) : 0,
  };
}

/** Phần công khai (không cần đăng nhập): màu + có logo hay không + CSS đã dựng */
export async function publicBrand(db: Db | import("@satarobo/db").Database) {
  const [b, g] = await Promise.all([getBrand(db), (db as Db).query.appSettings.findFirst({ where: eq(appSettings.key, "general") })]);
  const name = String(((g?.value ?? {}) as { brandName?: string }).brandName ?? "").trim() || "Sata Robo";
  return { primary: b.primary, accent: b.accent, hasLogo: !!b.logoKey, version: b.version, name, css: brandCss(b) };
}

export async function brandForAdmin(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const r = await ctx.db.select({ s: appSettings, byName: users.fullName }).from(appSettings).leftJoin(users, eq(users.id, appSettings.updatedBy)).where(eq(appSettings.key, "brand"));
  const b = await getBrand(ctx.db);
  return { brand: { primary: b.primary, accent: b.accent, hasLogo: !!b.logoKey, logoMime: b.logoMime, version: b.version }, updatedAt: r[0]?.s.updatedAt ?? null, updatedBy: r[0]?.byName ?? null, canEdit: hasRole(ctx.actor, "SUPER_ADMIN") };
}

async function writeBrand(ctx: ProtectedContext, next: BrandSettings) {
  await ctx.db.insert(appSettings).values({ key: "brand", value: next, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: ctx.user.id, updatedAt: new Date() } });
}

function mustEdit(ctx: ProtectedContext) {
  requirePermission(ctx, "system:update");
  if (!hasRole(ctx.actor, "SUPER_ADMIN")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Quản trị hệ thống được đổi nhận diện thương hiệu" });
}

export async function saveBrandColors(ctx: ProtectedContext, input: BrandColors) {
  mustEdit(ctx);
  const errs = validateBrandColors(input);
  if (errs.length) throw bad(errs);
  const before = await getBrand(ctx.db);
  const primary = normalizeHex(input.primary)!, accent = normalizeHex(input.accent)!;
  if (before.primary === primary && before.accent === accent) return { ok: true, changed: false };
  await writeBrand(ctx, { ...before, primary, accent, version: before.version + 1 });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "brand_colors", entityId: null, before: { primary: before.primary, accent: before.accent }, after: { primary, accent }, ip: ctx.ip });
  return { ok: true, changed: true };
}

/** Khôi phục tím + cam mặc định (giữ nguyên logo) */
export async function resetBrandColors(ctx: ProtectedContext) {
  return saveBrandColors(ctx, BRAND_DEFAULT_COLORS);
}

function sniff(mime: string, bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 12));
  if (mime === "image/png") return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? null : "Nội dung tệp không phải PNG";
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 ? null : "Nội dung tệp không phải JPG";
  if (mime === "image/webp") return head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP" ? null : "Nội dung tệp không phải WEBP";
  if (mime === "image/svg+xml") return svgUnsafeReason(Buffer.from(bytes).toString("utf8"));
  return "Định dạng không được hỗ trợ";
}

export async function uploadBrandLogo(ctx: ProtectedContext, input: { mime: string; bytes: Uint8Array }) {
  mustEdit(ctx);
  const ext = BRAND_LOGO_MIME[input.mime];
  if (!ext) throw bad("Chỉ nhận logo PNG, JPG, WEBP hoặc SVG");
  if (input.bytes.byteLength === 0) throw bad("Tệp rỗng");
  if (input.bytes.byteLength > BRAND_LOGO_MAX) throw bad("Logo tối đa 1MB");
  const why = sniff(input.mime, input.bytes);
  if (why) throw bad(why);
  const before = await getBrand(ctx.db);
  const key = `brand/logo-${randomUUID()}.${ext}`;
  await putObject(key, input.bytes, input.mime);
  await writeBrand(ctx, { ...before, logoKey: key, logoMime: input.mime, version: before.version + 1 });
  if (before.logoKey) await deleteObject(before.logoKey).catch(() => undefined);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "brand_logo", entityId: null, after: { mime: input.mime, bytes: input.bytes.byteLength }, ip: ctx.ip });
  return { ok: true, version: before.version + 1 };
}

export async function removeBrandLogo(ctx: ProtectedContext) {
  mustEdit(ctx);
  const before = await getBrand(ctx.db);
  if (!before.logoKey) return { ok: true, changed: false };
  await writeBrand(ctx, { ...before, logoKey: null, logoMime: null, version: before.version + 1 });
  await deleteObject(before.logoKey).catch(() => undefined);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "system", entity: "brand_logo", entityId: null, ip: ctx.ip });
  return { ok: true, changed: true };
}

/** Đọc logo để phát công khai (route /api/public/brand/logo) */
export async function readBrandLogo(db: Db | import("@satarobo/db").Database): Promise<{ bytes: Buffer; mime: string; version: number } | null> {
  const b = await getBrand(db);
  if (!b.logoKey || !b.logoMime) return null;
  const bytes = await getObject(b.logoKey);
  return bytes ? { bytes, mime: b.logoMime, version: b.version } : null;
}
