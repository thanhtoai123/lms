import Link from "next/link";
import { hasPermission, hasRole, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { GroupForm, MemberAdder, RemoveMember, Announce, DeleteGroup, GroupPermissions } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhóm người dùng" };

export default async function UserGroupsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Nhóm người dùng" perm="system:read" />;
  const canEdit = hasPermission(ctx.actor as Actor, "system:update");
  const canDelete = hasRole(ctx.actor as Actor, "SUPER_ADMIN");
  const [groups, tree] = await Promise.all([caller.admin.groups(), caller.admin.orgTree()]);
  const centers = [...tree.regions.flatMap((r) => r.centers), ...tree.unassigned].map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const selId = groups.some((g) => g.id === sp.id) ? sp.id! : groups[0]?.id;
  const g = selId ? await caller.admin.group({ id: selId }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Nhóm người dùng" desc="Gom tài khoản theo nhóm (ban quản lý, tư vấn khu vực…) để gửi thông báo nội bộ hàng loạt VÀ cấp thêm quyền cho cả nhóm mà không phải sửa vai trò từng người." actions={canEdit ? <GroupForm centers={centers} /> : null} />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card divide-y divide-black/5 self-start">
          {groups.length === 0 ? <div className="p-4"><Empty>Chưa có nhóm.</Empty></div> : groups.map((x) => (
            <Link key={x.id} href={`/user-groups?id=${x.id}`} className={`block p-3 text-sm hover:bg-black/5 ${x.id === selId ? "bg-brand-50" : ""}`}>
              <div className="font-medium">{x.name}</div>
              <div className="text-xs text-ink-400">{x.members} thành viên{x.centerCode ? ` · ${x.centerCode}` : " · toàn hệ thống"}{x.permissions > 0 ? ` · ${x.permissions} quyền` : ""}</div>
            </Link>
          ))}
        </div>
        {g ? (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                  {g.description && <p className="text-sm text-ink-600">{g.description}</p>}
                  <p className="text-xs text-ink-400">Tạo {dtVN(g.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  {canEdit && <GroupForm centers={centers} group={{ id: g.id, name: g.name, description: g.description, centerId: g.centerId }} />}
                  {canDelete && <DeleteGroup id={g.id} name={g.name} />}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
                <h3 className="font-semibold">Thành viên ({g.members.length})</h3>
                {canEdit && <MemberAdder groupId={g.id} existing={g.members.map((m) => m.userId)} />}
              </div>
              {g.members.length === 0 ? <div className="p-4"><Empty>Nhóm chưa có thành viên.</Empty></div> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Họ tên</th><th className="p-3">Email</th><th className="p-3">Vai trò</th><th className="p-3">Thêm lúc</th><th /></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {g.members.map((m) => (
                      <tr key={m.userId} className={m.isActive ? "" : "opacity-50"}>
                        <td className="p-3 font-medium"><Link href={`/users/${m.userId}`} className="hover:underline">{m.fullName}</Link>{!m.isActive && <span className="chip ml-1 bg-red-100 text-red-700">Đã khoá</span>}</td>
                        <td className="p-3 text-xs">{m.email}</td>
                        <td className="p-3 text-xs">{m.roles ?? "—"}</td>
                        <td className="p-3 text-xs">{dtVN(m.addedAt)}</td>
                        <td className="p-3 text-right">{canEdit && <RemoveMember groupId={g.id} userId={m.userId} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <GroupPermissions
              groupId={g.id}
              scope={g.centerId ? "cơ sở của nhóm" : "toàn hệ thống"}
              catalog={g.catalog}
              actionLabels={g.actionLabels}
              current={g.permissions.map((p) => p.permission)}
              canEdit={canDelete}
            />
            {canEdit && <Announce groupId={g.id} count={g.members.filter((m) => m.isActive).length} />}
          </div>
        ) : <Empty>Tạo nhóm đầu tiên để bắt đầu.</Empty>}
      </div>
    </div>
  );
}
