import { getDb } from "@satarobo/db";
import { publicSite } from "@satarobo/api";
import { HOME_PAGE, TH_REGISTER_BLOCK, TRIAL_PATH, buildPalette, landingCss, renderFormHeadHtml, rootClass, type LandingSection } from "@satarobo/core";
import { LeadForm } from "@/components/landing/lead-form";
import { SiteTracker } from "@/components/site-tracker";
import { PublicShell } from "@/components/public-shell";
import { loadBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: `${TH_REGISTER_BLOCK.title} — TH STEAM Academy` },
  description: TH_REGISTER_BLOCK.subtitle,
  alternates: { canonical: TRIAL_PATH },
};

/** Khối form cuối trang chính — trang này dùng đúng tiêu đề, ✓ và form 4 ô đó */
const FORM = HOME_PAGE.sections.find((s) => s.type === "form") as LandingSection;

/**
 * Trang đăng ký học trải nghiệm 1:1: cùng form với trang chính (họ tên, SĐT/Zalo, lớp, chuyên ngành + đồng ý).
 * Link riêng để dán vào Zalo, Fanpage, mã QR, quảng cáo; `?embed=1` để nhúng (không đầu / chân trang). /dang-ky chuyển về đây.
 */
export default async function HocThuPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await publicSite(getDb(), "register").catch(() => ({ data: {} as Record<string, string> }));
  const utm = { utm_source: sp.utm_source ?? "", utm_medium: sp.utm_medium ?? "", utm_campaign: sp.utm_campaign ?? "", ref: (sp.ref ?? "").slice(0, 20) };
  const body = (
    <section className="lp-sec lp-form" id="dang-ky">
      <SiteTracker form />
      <div className="lp-wrap lp-form-in">
        <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderFormHeadHtml(FORM, true) }} />
        <div className="lp-form-card">
          <LeadForm utm={utm} thankYou={site.data.thankYou || FORM.data.thankYou || undefined} interest={sp.nganh || undefined} />
        </div>
      </div>
    </section>
  );
  if (sp.embed === "1") {
    const brand = await loadBrand();
    const palette = buildPalette({ primary: brand.primary, accent: brand.accent });
    return (
      <main className={rootClass("vivid")} style={palette as unknown as React.CSSProperties}>
        <style dangerouslySetInnerHTML={{ __html: landingCss("vivid") }} />
        {body}
      </main>
    );
  }
  return <PublicShell landing>{body}</PublicShell>;
}
