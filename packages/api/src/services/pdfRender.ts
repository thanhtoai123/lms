/**
 * XUẤT PDF PHÍA MÁY CHỦ (tuỳ chọn) — dùng `playwright-core` điều khiển Chrome có sẵn trên máy chủ
 * để in trang in nội bộ của hồ sơ học tập ra tệp PDF khổ A4, lưu vào kho tệp làm bản lưu trữ.
 *
 * - Chỉ bật khi `PDF_RENDERER=playwright`. Không bật (hoặc chưa cài gói) thì giao diện ẩn nút
 *   "Xuất PDF lưu trữ" và chỉ còn "In / Lưu PDF" (hộp thoại in của trình duyệt).
 * - `playwright-core` là optionalDependency, NẠP ĐỘNG bằng biến (không import tĩnh) để typecheck và
 *   bundler không phụ thuộc gói. Kênh trình duyệt: `PDF_CHROME_CHANNEL` (mặc định "chrome");
 *   hoặc chỉ đường dẫn tệp chạy bằng `PDF_CHROME_PATH`.
 * - Trang cần in lấy từ `PDF_RENDER_BASE_URL` (mặc định NEXT_PUBLIC_APP_URL hoặc http://localhost:3000).
 */

/** Hình dạng tối thiểu của playwright-core mà ta dùng — tránh phụ thuộc kiểu của gói */
interface PwPage {
  goto(url: string, opts: { waitUntil: "networkidle" | "load"; timeout: number }): Promise<unknown>;
  emulateMedia(opts: { media: "print" }): Promise<void>;
  pdf(opts: { format: string; printBackground: boolean; preferCSSPageSize: boolean }): Promise<Uint8Array>;
}
interface PwBrowser {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(opts: { channel?: string; executablePath?: string; headless: boolean }): Promise<PwBrowser> };
}

export function pdfRendererEnabled(): boolean {
  return (process.env.PDF_RENDERER ?? "").trim().toLowerCase() === "playwright";
}

export function renderBaseUrl(): string {
  return (process.env.PDF_RENDER_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export class PdfRenderUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfRenderUnavailable";
  }
}

async function loadPlaywright(): Promise<PwModule> {
  // Tên gói để trong biến: TypeScript không đi tìm kiểu, bundler không cố đóng gói
  const spec = "playwright-core";
  try {
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as { chromium?: unknown; default?: { chromium?: unknown } };
    const chromium = (mod.chromium ?? mod.default?.chromium) as PwModule["chromium"] | undefined;
    if (!chromium || typeof chromium.launch !== "function") throw new Error("thiếu chromium");
    return { chromium };
  } catch {
    throw new PdfRenderUnavailable("Máy chủ chưa cài playwright-core — dùng nút \"In / Lưu PDF\" của trình duyệt, hoặc cài gói (pnpm --filter @satarobo/api add -O playwright-core)");
  }
}

/** In một đường dẫn nội bộ (bắt đầu bằng "/") ra PDF A4, giữ màu nền, theo khổ trang của CSS */
export async function renderPdf(path: string, opts: { timeoutMs?: number } = {}): Promise<Uint8Array> {
  if (!pdfRendererEnabled()) throw new PdfRenderUnavailable("Chưa bật xuất PDF phía máy chủ (PDF_RENDERER=playwright)");
  if (!path.startsWith("/")) throw new Error("Đường dẫn in phải là đường dẫn nội bộ");
  const pw = await loadPlaywright();
  const exe = (process.env.PDF_CHROME_PATH ?? "").trim();
  let browser: PwBrowser;
  try {
    browser = await pw.chromium.launch(exe ? { executablePath: exe, headless: true } : { channel: (process.env.PDF_CHROME_CHANNEL ?? "chrome").trim() || "chrome", headless: true });
  } catch {
    throw new PdfRenderUnavailable("Không mở được Chrome trên máy chủ để xuất PDF — kiểm tra Chrome đã cài, hoặc đặt PDF_CHROME_PATH");
  }
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print" });
    await page.goto(`${renderBaseUrl()}${path}`, { waitUntil: "networkidle", timeout: opts.timeoutMs ?? 60_000 });
    // Lề và khổ trang lấy theo @page trong CSS in (A4, lề 12mm)
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
