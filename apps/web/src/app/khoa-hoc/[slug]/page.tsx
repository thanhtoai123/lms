import { notFound } from "next/navigation";
import { courseSlug, validSlug } from "@satarobo/core";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

const slugOf = (x: string) => (validSlug(courseSlug(x)) ? null : courseSlug(x));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = slugOf((await params).slug);
  return s ? landingMetadata(s) : {};
}

/** Chi tiết một khoá học: /khoa-hoc/<x> = trang dựng khối "khoa-hoc-<x>". */
export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const s = slugOf(slug);
  if (!s) notFound();
  const el = await LandingPage({ slug: s, searchParams: sp });
  if (!el) notFound();
  return el;
}
