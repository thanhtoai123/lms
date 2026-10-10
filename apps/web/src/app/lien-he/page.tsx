import { notFound } from "next/navigation";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";
const SLUG = "lien-he";

export async function generateMetadata() { return landingMetadata(SLUG); }

/** Liên hệ: trang dựng khối "lien-he" (Website → Cấu trúc & khung). Chưa xuất bản thì 404. */
export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const el = await LandingPage({ slug: SLUG, searchParams: await searchParams });
  if (!el) notFound();
  return el;
}
