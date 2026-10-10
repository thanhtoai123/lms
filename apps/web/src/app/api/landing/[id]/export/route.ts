import { buildPalette, renderStandalone, clientSafeMessage } from "@satarobo/core";
import { landingForExport } from "@satarobo/api";
import { routeContext, errorStatus } from "@/lib/route-ctx";
import { loadBrand } from "@/lib/brand";

/**
 * GET /api/landing/<id>/export — tải tệp HTML độc lập của landing ĐANG XUẤT BẢN để đưa lên host khác.
 * Chỉ người có quyền xem nội dung website (site:read). Ảnh / liên kết nội bộ được đổi thành địa chỉ tuyệt đối của hệ thống;
 * form đăng ký dẫn về /dang-ky của hệ thống (HTML tĩnh không gửi form sang miền khác được).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await routeContext(req);
  if (!ctx) return Response.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, error: "Mã không hợp lệ" }, { status: 400 });
  try {
    const { slug, snapshot } = await landingForExport(ctx, id);
    const brand = await loadBrand();
    const origin = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
    const html = renderStandalone(snapshot.doc, {
      slug, variant: snapshot.variant, mode: "export", baseUrl: origin,
      brand: { name: brand.name, logoUrl: brand.logoUrl, palette: buildPalette({ primary: brand.primary, accent: brand.accent }) },
    }, { title: snapshot.seoTitle || snapshot.title, description: snapshot.seoDescription, image: snapshot.seoImage });
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.html"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: clientSafeMessage(e) }, { status: errorStatus(e) });
  }
}
