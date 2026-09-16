import { TrialForm } from "./form";

export const metadata = { title: "Đặt buổi học thử 1-1 miễn phí" };

/** Trang form công khai (nhúng được vào website / landing / Zalo). Gửi về /api/public/leads. */
export default function DangKyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-brand-50 to-surface p-6">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-brand-500 grid place-items-center text-white text-2xl font-black">S</div>
          <h1 className="text-2xl font-bold">Đặt buổi học thử 1-1 miễn phí</h1>
          <p className="text-sm text-ink-600">45 phút test năng lực + 90 phút học thử cùng giáo viên. 0 đồng, không ràng buộc.</p>
        </div>
        <TrialFormWrapper searchParams={searchParams} />
      </div>
    </main>
  );
}

async function TrialFormWrapper({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <TrialForm utm={{ utm_source: sp.utm_source ?? "", utm_medium: sp.utm_medium ?? "", utm_campaign: sp.utm_campaign ?? "" }} />;
}
