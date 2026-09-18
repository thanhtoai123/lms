import { getServerCaller } from "@/lib/trpc/server";
import { InboxBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Việc hôm nay" };

/**
 * Màn hình mặc định của khu quản trị: gộp mọi việc cần xử lý hôm nay của
 * người đang đăng nhập, theo đúng quyền của họ. Mỗi dòng có đúng một nút
 * hành động chính; không có tab, chỉ có bộ lọc theo nhóm việc.
 */
export default async function ViecHomNayPage() {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  const name = (me?.user.fullName ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  const dateVi = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = `${name ? `Chào ${name} · ` : ""}${dateVi.charAt(0).toUpperCase()}${dateVi.slice(1)}`;

  return <InboxBoard greeting={greeting} />;
}
