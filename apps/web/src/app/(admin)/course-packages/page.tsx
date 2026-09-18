import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { PackagesTable } from "./table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gói khoá học" };

export default async function CoursePackagesPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string; active?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "course:read")) return <NoAccess title="Gói khoá học" perm="course:read" />;
  const uuidOr = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const [courses, rows] = await Promise.all([
    caller.catalog.courses({ active: true }),
    caller.catalog.coursePackages({ q: sp.q || undefined, courseId: uuidOr(sp.course), active: sp.active === "1" ? true : sp.active === "0" ? false : undefined }),
  ]);
  const canEdit = hasPermission(actor, "course:update");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Gói khoá học"
        desc="Gói bán cho khách: mỗi khoá có thể có nhiều gói (trọn khoá / học phần / gói lẻ) với số buổi, giá niêm yết và giá ưu đãi riêng. Gói đang bán được dùng làm gợi ý khi tạo đơn hàng và khi chốt lead (chọn gói → tự điền số buổi + đơn giá)."
      />
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Mã / tên gói…" className="input max-w-xs" aria-label="Tìm gói" />
        <select name="course" defaultValue={sp.course ?? ""} className="input max-w-[220px]" aria-label="Khoá">
          <option value="">Mọi khoá</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <select name="active" defaultValue={sp.active ?? ""} className="input max-w-[160px]" aria-label="Trạng thái bán">
          <option value="">Tất cả</option>
          <option value="1">Đang bán</option>
          <option value="0">Ngừng bán</option>
        </select>
        <button className="btn-ghost">Lọc</button>
      </form>
      <PackagesTable
        rows={rows}
        courses={courses.map((c) => ({ id: c.id, code: c.code, name: c.name, totalSessions: c.totalSessions, listPrice: c.listPrice }))}
        canEdit={canEdit}
      />
    </div>
  );
}
