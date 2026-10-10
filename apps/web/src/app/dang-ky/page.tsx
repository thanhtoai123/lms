import { getDb } from "@satarobo/db";
import { publicSite } from "@satarobo/api";
import { TrialForm } from "./form";
import { SiteTracker } from "@/components/site-tracker";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đặt buổi học thử 1-1 miễn phí" };

/**
 * Trang form công khai. Gửi về /api/public/leads.
 * Mặc định nằm trong khung website (đầu / chân trang chung); thêm `?embed=1` để nhúng gọn vào website khác / Zalo (không đầu / chân trang).
 */
export default async function DangKyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await publicSite(getDb(), "register").catch(() => ({ data: {} as Record<string, string> }));
  const body = (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <SiteTracker form />
        <h1 className="text-2xl font-bold">{site.data.title || "Đặt buổi học thử 1-1 miễn phí"}</h1>
        <p className="text-sm text-ink-600">{site.data.subtitle || "45 phút test năng lực + 90 phút học thử cùng giáo viên. 0 đồng, không ràng buộc."}</p>
      </div>
      <TrialForm thankYou={site.data.thankYou} utm={{ utm_source: sp.utm_source ?? "", utm_medium: sp.utm_medium ?? "", utm_campaign: sp.utm_campaign ?? "", ref: (sp.ref ?? "").slice(0, 20) }} />
    </div>
  );
  if (sp.embed === "1") return <main className="min-h-dvh bg-gradient-to-b from-brand-50 to-surface p-6">{body}</main>;
  return <PublicShell narrow>{body}</PublicShell>;
}
