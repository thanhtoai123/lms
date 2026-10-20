import { redirect } from "next/navigation";
import { getDb } from "@satarobo/db";
import { familyChildren } from "@satarobo/api";
import { pickChild } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Trang cũ — đã GỘP vào Hồ sơ công nghệ: nhận xét và ảnh từng buổi nằm ở phần "chi tiết" của hồ sơ
 * (cổng phụ huynh xếp buổi mới nhất lên đầu, hiện đủ ảnh). Giữ đường dẫn để liên kết cũ vẫn mở đúng chỗ.
 */
export default async function OldPage({ searchParams }: { searchParams: Promise<{ con?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const kids = await familyChildren(getDb(), p.id);
  const kid = pickChild(kids, sp.con && UUID.test(sp.con) ? sp.con : null);
  redirect(kid ? `/ph/be/${kid.id}#chi-tiet` : "/ph");
}
