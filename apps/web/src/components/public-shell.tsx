import { getDb } from "@satarobo/db";
import { getSiteChrome } from "@satarobo/api";
import { buildPalette, chromeSections, landingCss, renderFooterHtml, renderHeaderHtml, rootClass, type RenderCtx } from "@satarobo/core";
import { loadBrand } from "@/lib/brand";

/**
 * Khung trang công khai của website (Tin tức, Tuyển dụng, Đăng ký học thử, tra cứu…): cùng đầu / chân trang với các trang dựng khối,
 * lấy từ khung chung (Website → Cấu trúc & khung). Đầu / chân trang dùng CSS của landing, phần giữa giữ kiểu giao diện của ứng dụng.
 */
export async function PublicShell({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  const [chrome, brand] = await Promise.all([getSiteChrome(getDb()).catch(() => null), loadBrand()]);
  const palette = buildPalette({ primary: brand.primary, accent: brand.accent });
  const ctx: RenderCtx = { slug: "site", variant: "classic", mode: "page", homeHref: "/", brand: { name: brand.name, logoUrl: brand.logoUrl, palette } };
  const parts = chrome ? chromeSections(chrome) : null;
  // `display: contents` để đầu trang vẫn dính trên cùng khi cuộn, còn biến màu vẫn kế thừa xuống
  const wrap = { display: "contents" } as const;
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {parts && (
        <div className={rootClass("classic")} style={{ ...(palette as unknown as React.CSSProperties), ...wrap }}>
          <style dangerouslySetInnerHTML={{ __html: landingCss() }} />
          <div style={wrap} dangerouslySetInnerHTML={{ __html: renderHeaderHtml(parts.header, ctx) }} />
        </div>
      )}
      <main className={`mx-auto w-full flex-1 px-4 py-8 ${narrow ? "max-w-md" : "max-w-4xl"}`}>{children}</main>
      {parts && (
        <div className={rootClass("classic")} style={{ ...(palette as unknown as React.CSSProperties), ...wrap }}>
          <div style={wrap} dangerouslySetInnerHTML={{ __html: renderFooterHtml(parts.footer, ctx) }} />
        </div>
      )}
    </div>
  );
}
