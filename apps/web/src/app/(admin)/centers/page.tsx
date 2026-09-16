import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { CenterEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cơ sở" };

export default async function CentersPage() {
  const { caller, ctx } = await getServerCaller();
  const rows = await caller.org.centers();
  const canEdit = !!ctx.actor && hasPermission(ctx.actor as Actor, "center:update");
  return (
    <div className="space-y-4">
      <PageHeader title="Cơ sở" desc="Các cơ sở đào tạo. Thêm/sửa cơ sở thuộc quyền Quản trị tối cao (Cây tổ chức)." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <div key={c.id} className={`card space-y-2 p-4 ${c.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-xs font-mono text-ink-400">{c.code}</div><div className="font-semibold">{c.name}</div></div>
              {!c.isActive && <span className="chip bg-black/5">Ngừng hoạt động</span>}
            </div>
            <div className="text-sm text-ink-600">{c.address ?? "—"}</div>
            {c.phone && <div className="text-xs text-ink-400">{c.phone}</div>}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
              <Link href={`/rooms?center=${c.id}`} className="rounded-lg bg-black/[0.03] p-2 hover:bg-black/5"><div className="text-lg font-bold">{c.rooms}</div>phòng</Link>
              <Link href={`/classes?center=${c.id}`} className="rounded-lg bg-black/[0.03] p-2 hover:bg-black/5"><div className="text-lg font-bold">{c.runningClasses}</div>lớp mở</Link>
              <Link href={`/students?center=${c.id}`} className="rounded-lg bg-black/[0.03] p-2 hover:bg-black/5"><div className="text-lg font-bold">{c.activeStudents}</div>học viên</Link>
            </div>
            {canEdit && <CenterEditor initial={{ id: c.id, code: c.code, name: c.name, address: c.address ?? "", phone: c.phone ?? "", isActive: c.isActive }} />}
          </div>
        ))}
      </div>
      {canEdit && <div className="card max-w-xl p-4"><h2 className="mb-2 font-bold">Thêm cơ sở</h2><CenterEditor /></div>}
    </div>
  );
}
