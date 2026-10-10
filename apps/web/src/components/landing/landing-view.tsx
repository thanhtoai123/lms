import { buildPalette, landingCss, renderParts, rootClass, type LandingDoc, type LandingVariant } from "@satarobo/core";
import { TrialForm } from "@/app/dang-ky/form";
import { SiteTracker } from "@/components/site-tracker";
import { UtmLinks } from "./utm-links";

export interface LandingBrand { name: string; primary: string; accent: string; logoUrl: string }

/**
 * Hiển thị landing: HTML do `renderParts` (core) sinh ra từ dữ liệu đã kiểm + form đăng ký (thành phần React).
 * Dùng chung cho trang công khai và khung xem trước trong quản trị. Không có hook — chạy được ở máy chủ.
 */
export function LandingView({ doc, variant, slug, brand, utm, preview }: {
  doc: LandingDoc;
  variant: LandingVariant;
  slug: string;
  brand: LandingBrand;
  utm: { utm_source: string; utm_medium: string; utm_campaign: string; ref?: string };
  /** Xem trước trong quản trị: không ghi lượt xem, không gắn UTM */
  preview?: boolean;
}) {
  const palette = buildPalette({ primary: brand.primary, accent: brand.accent });
  const parts = renderParts(doc, { slug, variant, mode: "page", brand: { name: brand.name, logoUrl: brand.logoUrl, palette } });
  const hasForm = parts.some((p) => p.kind === "form");
  return (
    <div className={rootClass(variant)} style={palette as React.CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: landingCss() }} />
      {parts.map((p, i) =>
        p.kind === "html"
          ? <div key={i} className="lp-part" style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.html }} />
          : (
            <section key={i} className={`lp-sec${p.alt ? " lp-alt" : ""} lp-form`} id="dang-ky">
              <div className="lp-wrap lp-form-in">
                <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.head }} />
                <div className="lp-form-card"><TrialForm utm={utm} thankYou={p.thankYou || undefined} /></div>
              </div>
            </section>
          ),
      )}
      {!preview && <><SiteTracker form={hasForm} /><UtmLinks slug={slug} /></>}
    </div>
  );
}
