import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { CatalogBoard } from "./board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khung chương trình chuẩn" };

/**
 * KHUNG CHƯƠNG TRÌNH CHUẨN TH STEAM — xem toàn bộ danh mục (4 chuyên ngành → 9 chương trình → năm học → 3 học phần)
 * và trạng thái trong CSDL của trung tâm; nút "Đồng bộ danh mục chuẩn" nạp / cập nhật khoá, giáo trình 45 buổi,
 * tiêu chí học bạ (6 năng lực + 3 phẩm chất), gói học phí, lộ trình. docs/KHUNG-CHUONG-TRINH.md
 */
export default async function ThCatalogPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "course:read")) return <NoAccess title="Khung chương trình chuẩn" perm="course:read" />;
  const data = await caller.thsteam.overview();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Khung chương trình chuẩn TH STEAM"
        desc="4 chuyên ngành → chương trình theo cấp học → năm học (45 buổi) → 3 học phần × 15 buổi. Buổi 5 ôn tập, buổi 13–14 dự án cuối học phần, buổi 15 báo cáo trước phụ huynh = mốc học bạ (6 năng lực + 3 phẩm chất, 3 mức Tốt / Đạt / Cần cố gắng). Khoá luyện thi tự chọn, học thêm sau năm học."
      />
      <CatalogBoard state={data.state} otherActiveCourses={data.otherActiveCourses} canSync={data.canSync} />
    </div>
  );
}
