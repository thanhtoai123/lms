import { notFound } from "next/navigation";
import { policySlug, validSlug } from "@satarobo/core";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

const slugOf = (x: string) => (validSlug(policySlug(x)) ? null : policySlug(x));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = slugOf((await params).slug);
  return s ? landingMetadata(s) : {};
}

/** Trang chính sách / văn bản: /chinh-sach/<x> = trang dựng khối "chinh-sach-<x>". */
export default async function PolicyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const s = slugOf(slug);
  if (!s) notFound();
  const el = await LandingPage({ slug: s, searchParams: sp });
  if (!el) notFound();
  return el;
}
