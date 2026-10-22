import { buildPalette, landingCss, renderParts, rootClass, type LandingDoc, type LandingVariant } from "@satarobo/core";
import { TrialForm } from "@/app/dang-ky/form";
import { LeadForm } from "./lead-form";
import { SiteTracker } from "@/components/site-tracker";
import { UtmLinks } from "./utm-links";
import { StickyToggle } from "./sticky-toggle";

export interface LandingBrand { name: string; primary: string; accent: string; logoUrl: string; lockup?: string | null; lockupOnDark?: string | null }

/**
 * Hiển thị landing: HTML do `renderParts` (core) sinh ra từ dữ liệu đã kiểm + form đăng ký (thành phần React).
 * Dùng chung cho trang công khai và khung xem trước trong quản trị. Không có hook — chạy được ở máy chủ.
 */
export function LandingView({ doc, variant, slug, brand, utm, preview, homeHref, focus }: {
  doc: LandingDoc;
  variant: LandingVariant;
  slug: string;
  brand: LandingBrand;
  utm: { utm_source: string; utm_medium: string; utm_campaign: string; ref?: string };
  /** Xem trước trong quản trị: không ghi lượt xem, không gắn UTM */
  preview?: boolean;
  /** Liên kết của logo (trang thuộc website dùng "/") */
  homeHref?: string;
  /** Mã chuyên ngành mở sẵn (khối tab "Chuyên ngành") */
  focus?: string;
}) {
  const palette = buildPalette({ primary: brand.primary, accent: brand.accent });
  const parts = renderParts(doc, { slug, variant, mode: "page", homeHref, focus, brand: { name: brand.name, logoUrl: brand.logoUrl, lockupUrl: brand.lockup, lockupOnDarkUrl: brand.lockupOnDark, palette } });
  const hasForm = parts.some((p) => p.kind === "form" || p.kind === "leadHero");
  return (
    <div className={rootClass(variant)} style={palette as unknown as React.CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: landingCss(variant) }} />
      {parts.map((p, i) => {
        if (p.kind === "html") return <div key={i} className="lp-part" style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.html }} />;
        if (p.kind === "leadHero") {
          // Mở đầu + form: cột chữ (H1), form 4 ô, ảnh — thứ tự trên điện thoại do CSS (chữ → form → ảnh)
          return (
            <section key={i} className="lp-sec lp-hero lp-lead-hero" id="top">
              <div className="lp-wrap">
                <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.left }} />
                <div className="lp-hero-form" id="dang-ky-nhanh">
                  <div className="lp-form-card">
                    <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.formHead }} />
                    <LeadForm utm={utm} thankYou={p.thankYou || undefined} interest={p.interest || undefined} />
                  </div>
                </div>
                {p.pic ? <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.pic }} /> : null}
              </div>
            </section>
          );
        }
        return (
          <section key={i} className={`lp-sec${p.alt ? " lp-alt" : ""} lp-form`} id="dang-ky">
            <div className="lp-wrap lp-form-in">
              <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: p.head }} />
              <div className="lp-form-card">
                {p.compact ? <LeadForm utm={utm} thankYou={p.thankYou || undefined} interest={p.interest || undefined} /> : <TrialForm utm={utm} thankYou={p.thankYou || undefined} />}
              </div>
            </div>
          </section>
        );
      })}
      {!preview && <><SiteTracker form={hasForm} /><UtmLinks slug={slug} /><StickyToggle /></>}
    </div>
  );
}
