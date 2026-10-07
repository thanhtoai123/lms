import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { CourseCriteriaCard } from "./overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiêu chí theo chương trình" };

export default async function CriteriaPage() {
  const { caller } = await getServerCaller();
  const o = await caller.portfolio.criteria.overview();
  const none = o.courses.filter((c) => c.activeCount === 0).length;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tiêu chí theo chương trình"
        desc="Mỗi chương trình (khoá) có bộ tiêu chí đánh giá riêng, 4 mức có mô tả hành vi. Giáo viên chấm từng buổi theo bộ này và học bạ mốc tự tổng hợp từ đó. Sửa ở đây chỉ áp cho phiếu mới — phiếu đã phát hành giữ nguyên."
        actions={<Link href="/ho-so-hoc-tap?xem=hoc-ba-moc" className="btn-ghost">← Học bạ mốc</Link>}
      />
      {none > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {none} chương trình chưa có tiêu chí riêng — đang dùng bộ mặc định 4 tiêu chí chung. Mở từng chương trình để chọn bộ mẫu phù hợp (robotics, lập trình, STEAM cho bé nhỏ, AI & dữ liệu) hoặc sao chép từ chương trình khác.
        </p>
      )}
      {!o.canEdit && <p className="rounded-xl bg-black/[0.04] p-3 text-sm text-ink-600">Bạn chỉ xem được. Người có quyền quản lý khoá học (Đào tạo, quản trị) mới sửa được tiêu chí.</p>}
      {o.courses.length === 0 ? <Empty>Chưa có chương trình nào đang mở.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {o.courses.map((c) => (
            <CourseCriteriaCard key={c.id} course={c} allCourses={o.allCourses} canEdit={o.canEdit} canSetNext={o.canSetNext} />
          ))}
        </div>
      )}
    </div>
  );
}
