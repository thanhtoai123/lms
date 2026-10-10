import { notFound } from "next/navigation";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return landingMetadata((await params).slug);
}

/** Landing page công khai theo đường dẫn: /lp/<tên>. Chỉ hiện bản đã Xuất bản. */
export default async function LpPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const el = await LandingPage({ slug, searchParams: sp });
  if (!el) notFound();
  return el;
}
