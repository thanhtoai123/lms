import Link from "next/link";
import { getDb } from "@satarobo/db";
import { publicSite } from "@satarobo/api";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

const SLUG = "gioi-thieu";

export async function generateMetadata() {
  const m = await landingMetadata(SLUG);
  return Object.keys(m).length ? m : { title: "Giới thiệu — Sata Robo" };
}

/** Giới thiệu: trang dựng khối "gioi-thieu" nếu đã xuất bản; chưa có thì giữ trang chữ cũ (Website → Nội dung trang). */
export default async function AboutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const built = await LandingPage({ slug: SLUG, searchParams: await searchParams });
  if (built) return built;
  const s = await publicSite(getDb(), "about");
  return (
    <PublicShell>
      <SiteTracker />
      <h1 className="text-3xl font-bold">{s.data.title || "Về Sata Robo"}</h1>
      {s.data.image && <img src={s.data.image} alt="" className="mt-4 w-full rounded-2xl" />}
      {s.html ? <div className="sr-prose mt-4" dangerouslySetInnerHTML={{ __html: s.html }} /> : <p className="mt-4 text-ink-600">Nội dung đang được cập nhật.</p>}
      <Link href="/dang-ky" className="btn-primary mt-6 inline-block">Đăng ký học thử</Link>
    </PublicShell>
  );
}
