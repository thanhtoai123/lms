import { redirect } from "next/navigation";
import { HOME_SLUG } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { laChiGiaoVien } from "@/lib/account";
import { LandingPage, landingMetadata } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

// Trang chủ công khai = landing có đường dẫn "trang-chu" (nếu đã xuất bản); không thì giữ hành vi cũ
export async function generateMetadata() {
  return landingMetadata(HOME_SLUG);
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) {
    // Khách chưa đăng nhập: nếu đã xuất bản landing "trang-chu" thì hiện nó, không thì sang trang đăng nhập như trước
    const el = await LandingPage({ slug: HOME_SLUG, searchParams: await searchParams });
    if (el) return el;
    redirect("/login");
  }
  const roles = me.assignments.map((a) => a.role);
  // Chỉ giáo viên/trợ giảng thuần tuý vào app giáo viên; mọi vai trò quản trị vào "Việc hôm nay"
  const teacherOnly = laChiGiaoVien(roles);
  redirect(teacherOnly ? "/teacher" : "/viec-hom-nay");
}
