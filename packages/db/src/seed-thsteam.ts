/**
 * CHUYỂN HỆ THỐNG SANG TH STEAM ACADEMY — nhận diện + danh mục chương trình chuẩn (docs/KHUNG-CHUONG-TRINH.md).
 *
 *   pnpm db:seed-thsteam              # đổi nhận diện + nạp danh mục chuẩn + NGỪNG BÁN danh mục cũ (không xoá) + website TH STEAM
 *   pnpm db:seed-thsteam --giu-cu     # như trên nhưng giữ danh mục cũ đang bán
 *   pnpm db:seed-thsteam --nhap       # website chỉ ghi NHÁP (mặc định khi NODE_ENV=production)
 *   pnpm db:seed-thsteam --xuat-ban   # ép xuất bản website kể cả production
 *
 * Chạy lại an toàn. Không xoá dữ liệu: lớp, học viên, học bạ cũ vẫn còn và xem được.
 * Nhận diện: tên trung tâm mặc định, tên thương hiệu + pháp nhân + hotline + website (Cài đặt chung), màu thương hiệu
 * (Deep Ocean Blue + Cosmic Gold), gỡ logo tải lên cũ để dùng biểu tượng TH đi kèm ứng dụng, nền chứng nhận mặc định.
 * Website: khung đầu / chân trang, trang chủ, Giới thiệu, Chương trình học, 4 trang chuyên ngành, Liên hệ, chính sách;
 * trang khoá học cũ của khung website chuyển "lưu trữ" (không xoá). Bản cũ vẫn nằm trong lịch sử xuất bản của từng trang.
 */
import "./env";
import { eq } from "drizzle-orm";
import { appSettings, tenants, certificateTemplates } from "./schema/index";
import { BRAND_DEFAULT_COLORS, TH_BRAND } from "@satarobo/core";
import { createDb } from "./index";
import { syncThSteamCatalog, defaultTenantId } from "./thsteam-sync";
import { syncThSteamWebsite } from "./thsteam-site";

const keepOld = process.argv.includes("--giu-cu");
const publishSite = process.argv.includes("--xuat-ban") || (!process.argv.includes("--nhap") && process.env.NODE_ENV !== "production");
const db = createDb();
const tenantId = await defaultTenantId(db);

// ---- Trung tâm mặc định ----
await db.update(tenants).set({ name: TH_BRAND.name, legalName: TH_BRAND.legalName, phone: TH_BRAND.hotline, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

// ---- Cài đặt chung: tên thương hiệu, pháp nhân, hotline, website ----
const g = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "general") });
const general = {
  ...((g?.value ?? {}) as Record<string, unknown>),
  brandName: TH_BRAND.name, legalName: TH_BRAND.legalName, hotline: TH_BRAND.hotline, website: TH_BRAND.websiteUrl,
  receiptFooter: `Cảm ơn quý phụ huynh đã tin tưởng ${TH_BRAND.name}.`,
};
await db.insert(appSettings).values({ key: "general", value: general }).onConflictDoUpdate({ target: appSettings.key, set: { value: general, updatedAt: new Date() } });

// ---- Màu thương hiệu + gỡ logo cũ (dùng biểu tượng TH mặc định /icon.svg) ----
const b = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "brand") });
const prev = (b?.value ?? {}) as { version?: number };
// Số phiên bản dùng làm khoá bộ đệm (theme.css?v=…, logo?v=…, cache 1 năm). Sau khi xoá sạch CSDL, đếm lại từ 1 sẽ trùng
// bản cũ trình duyệt còn giữ (màu / logo cũ) → lấy theo thời gian để không bao giờ trùng.
const brand = { ...BRAND_DEFAULT_COLORS, logoKey: null, logoMime: null, version: Math.max((Number(prev.version) || 0) + 1, Math.floor(Date.now() / 1000)) };
await db.insert(appSettings).values({ key: "brand", value: brand }).onConflictDoUpdate({ target: appSettings.key, set: { value: brand, updatedAt: new Date() } });

// ---- Nền giấy chứng nhận mặc định ----
const certs = await db.update(certificateTemplates).set({ backgroundKey: TH_BRAND.certificateBackground, updatedAt: new Date() })
  .where(eq(certificateTemplates.backgroundKey, "builtin/sata-mac-dinh.svg")).returning({ id: certificateTemplates.id });

// ---- Danh mục chương trình chuẩn ----
const r = await syncThSteamCatalog(db, { tenantId, retireOthers: !keepOld });

console.log(`✓ Nhận diện: ${TH_BRAND.name} · ${TH_BRAND.hotline} · ${TH_BRAND.website} · màu ${BRAND_DEFAULT_COLORS.primary} + ${BRAND_DEFAULT_COLORS.accent} · ${certs.length} mẫu chứng nhận đổi nền`);
console.log(`✓ Khoá học: tạo ${r.courses.created}, cập nhật ${r.courses.updated} · buổi: tạo ${r.lessons.created}, cập nhật ${r.lessons.updated}`);
console.log(`✓ Tiêu chí học bạ: thêm ${r.criteria.created}, điền mô tả ${r.criteria.filled} · gói học phí: tạo ${r.packages.created}, cập nhật ${r.packages.updated} · lộ trình: tạo ${r.paths.created}, cập nhật ${r.paths.updated}`);
console.log(keepOld ? "= Giữ danh mục cũ đang bán (--giu-cu)" : `✓ Ngừng bán danh mục cũ: ${r.retired.courses} khoá, ${r.retired.packages} gói, ${r.retired.paths} lộ trình (không xoá)`);

// ---- Website ----
const w = await syncThSteamWebsite(db, { publish: publishSite });
console.log(`✓ Website: khung đầu / chân trang TH STEAM · tạo ${w.created.length}, cập nhật ${w.updated.length} trang${publishSite ? ` · đã xuất bản ${w.published.length}` : " (chỉ NHÁP — vào Website để xem và Xuất bản)"} · lưu trữ ${w.archived.length} trang cũ`);
console.log("  ! Chính sách bảo mật là BẢN NHÁP có chữ [DEMO] — cần người có thẩm quyền duyệt rồi sửa trong Website → Landing page.");
process.exit(0);
