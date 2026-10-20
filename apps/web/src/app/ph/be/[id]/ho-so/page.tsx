import { redirect } from "next/navigation";

/** Đường dẫn cũ của Hồ sơ công nghệ — nay là trang chính của con: /ph/be/<id> */
export default async function OldChildPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ph/be/${encodeURIComponent(id)}`);
}
