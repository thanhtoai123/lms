import { getDb } from "@satarobo/db";
import { publicSite } from "@satarobo/api";
import { TrialForm } from "./form";
import { SiteTracker } from "@/components/site-tracker";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đặt buổi học thử 1-1 miễn phí" };

/** Trang form công khai (nhúng được vào website / landing / Zalo). Gửi về /api/public/leads. */
export default async function DangKyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const site = await publicSite(getDb(), "register").catch(() => ({ data: {} as Record<string, string> }));
  return (
    <main className="min-h-dvh bg-gradient-to-b from-brand-50 to-surface p-6">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-brand-500 grid place-items-center text-white text-2xl font-black">S</div>
          <SiteTracker form />
          <h1 className="text-2xl font-bold">{site.data.title || "Đặt buổi học thử 1-1 miễn phí"}</h1>
          <p className="text-sm text-ink-600">{site.data.subtitle || "45 phút test năng lực + 90 phút học thử cùng giáo viên. 0 đồng, không ràng buộc."}</p>
        </div>
        <TrialFormWrapper searchParams={searchParams} thankYou={site.data.thankYou} />
      </div>
    </main>
  );
}

async function TrialFormWrapper({ searchParams, thankYou }: { searchParams: Promise<Record<string, string>>; thankYou?: string }) {
  const sp = await searchParams;
  return <TrialForm thankYou={thankYou} utm={{ utm_source: sp.utm_source ?? "", utm_medium: sp.utm_medium ?? "", utm_campaign: sp.utm_campaign ?? "" }} />;
}
