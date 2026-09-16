import Link from "next/link";
import { hasPermission, ROLE_LABEL_VI, ASSIGNABLE_ROLES, type Actor, type Role } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { fmtDateTime } from "@/components/lead-ui";
import { CreateUser } from "./create";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài khoản" };

type SP = { q?: string; role?: string; center?: string; status?: string; page?: string };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Tài khoản" perm="system:read" />;
  const canEdit = hasPermission(ctx.actor as Actor, "system:update");
  const role = ASSIGNABLE_ROLES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const status = sp.status === "active" || sp.status === "locked" ? sp.status : undefined;
  const [opts, data] = await Promise.all([
    caller.system.roleOptions(),
    caller.system.users({ q: sp.q || undefined, role, centerId: sp.center || undefined, status, page: Number(sp.page) || 1 }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Tài khoản" desc="Tài khoản đăng nhập khu quản trị. Một người có thể có nhiều vai trò, mỗi vai trò gắn một cơ sở (hoặc toàn hệ thống). Khoá tài khoản thay vì xoá để giữ lịch sử." />
      {canEdit && <CreateUser roles={opts.roles} centers={opts.centers} />}
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tên / email / SĐT…" className="input max-w-xs" />
        <select name="role" defaultValue={role ?? ""} className="input max-w-[220px]">
          <option value="">Mọi vai trò</option>
          {opts.roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
        </select>
        <select name="center" defaultValue={sp.center ?? ""} className="input max-w-[200px]">
          <option value="">Mọi cơ sở</option>
          {opts.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/users" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả", count: data.counts.total }, { key: "active", label: "Đang hoạt động", count: data.counts.active }, { key: "locked", label: "Đã khoá", count: data.counts.locked }]} />
      {data.items.length === 0 ? <Empty>Không có tài khoản phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Người dùng</th><th className="p-3">Vai trò</th><th className="p-3">Đăng nhập</th><th className="p-3">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/users/${u.id}`} className="font-medium text-brand-600">{u.fullName}</Link><div className="text-xs text-ink-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => <span key={r.id} className={`chip ${r.role === "SUPER_ADMIN" ? "bg-brand-100 text-brand-700" : "bg-black/5"}`}>{ROLE_LABEL_VI[r.role]}{r.centerCode ? ` · ${r.centerCode}` : ""}</span>)}
                      {u.roles.length === 0 && <span className="text-xs text-ink-400">chưa có vai trò</span>}
                    </div>
                  </td>
                  <td className="p-3 text-xs">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="text-ink-400">chưa đăng nhập</span>}<div className="text-ink-400">{u.hasAuth ? "đã liên kết đăng nhập" : "chưa liên kết"}</div></td>
                  <td className="p-3">{u.isActive ? <span className="chip bg-green-100 text-green-800">Hoạt động</span> : <span className="chip bg-red-100 text-red-700" title={u.lockedReason ?? ""}>Đã khoá</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/users" params={sp} page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
