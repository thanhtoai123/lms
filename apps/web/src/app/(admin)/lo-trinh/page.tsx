import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { PathsBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lộ trình học & chứng nhận" };

/**
 * Lộ trình học: chuỗi khoá có thứ tự → học viên hoàn thành đủ khoá bắt buộc được cấp
 * **giấy chứng nhận hoàn thành lộ trình** (không phải "chứng chỉ"), in theo mẫu thiết kế trên Canva.
 */
export default async function LearningPathsPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !(hasPermission(actor, "course:read") || hasPermission(actor, "completion:read") || hasPermission(actor, "enrollment:read"))) {
    return <NoAccess title="Lộ trình học" perm="course:read" />;
  }
  const [paths, options] = await Promise.all([
    caller.certificates.paths.list({ includeInactive: true }),
    caller.certificates.paths.options(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Lộ trình học & giấy chứng nhận"
        desc="Ghép các khoá thành lộ trình (có thứ tự, đánh dấu khoá bắt buộc). Học viên hoàn thành — đã được duyệt — mọi khoá bắt buộc sẽ vào nhóm “Đủ điều kiện”; cấp giấy chứng nhận hàng loạt rồi in theo mẫu thiết kế trên Canva, mỗi giấy có mã QR xác thực."
        actions={<Link href="/lo-trinh/mau-chung-nhan" className="btn-ghost">Mẫu giấy chứng nhận</Link>}
      />
      <PathsBoard paths={paths} options={options} initialPathId={sp.path ?? paths.find((p) => p.isActive)?.id ?? null} />
    </div>
  );
}
