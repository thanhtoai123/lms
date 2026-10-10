import { notFound } from "next/navigation";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";
const SLUG = "khoa-hoc";

export async function generateMetadata() { return landingMetadata(SLUG); }

/** Danh sách khoá học: trang dựng khối "khoa-hoc" (Website → Cấu trúc & khung). Chưa xuất bản thì 404. */
export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const el = await LandingPage({ slug: SLUG, searchParams: await searchParams });
  if (!el) notFound();
  return el;
}
