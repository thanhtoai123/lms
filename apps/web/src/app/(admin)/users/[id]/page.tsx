import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, fmtDate } from "@/components/admin-ui";
import { fmtDateTime } from "@/components/lead-ui";
import { UserActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết tài khoản" };

const ACTION_VI: Record<string, string> = { CREATE: "Tạo", UPDATE: "Cập nhật", DELETE: "Gỡ", TRANSITION: "Chuyển trạng thái", PII_REVEAL: "Xem dữ liệu nhạy cảm" };

function describe(h: { action: string; entity: string; before: unknown; after: unknown }) {
  const a = (h.after ?? {}) as Record<string, unknown>;
  const b = (h.before ?? {}) as Record<string, unknown>;
  if (h.entity === "user_roles") return `${h.action === "DELETE" ? "Gỡ" : "Cấp"} vai trò ${String((h.action === "DELETE" ? b.role : a.role) ?? "")}`;
  if ("isActive" in a) return a.isActive ? "Mở khoá tài khoản" : "Khoá tài khoản";
  if (h.action === "CREATE") return "Tạo tài khoản";
  return "Cập nhật thông tin";
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Tài khoản" perm="system:read" />;
  const canEdit = hasPermission(ctx.actor as Actor, "system:update");
  const [u, opts] = await Promise.all([caller.system.user({ id }).catch(() => null), caller.system.roleOptions()]);
  if (!u) notFound();
  return (
    <div className="space-y-4">
      <Link href="/users" className="text-sm text-ink-600">← Tài khoản</Link>
      <PageHeader
        title={u.fullName}
        desc={`${u.email}${u.phone ? ` · ${u.phone}` : ""}`}
        actions={<><Link href={`/audit-log?actor=${u.id}`} className="btn-ghost">Thao tác của người này</Link></>}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-ink-400">Trạng thái</div><div className="mt-1">{u.isActive ? <span className="chip bg-green-100 text-green-800">Hoạt động</span> : <span className="chip bg-red-100 text-red-700">Đã khoá</span>}</div>{!u.isActive && u.lockedReason && <div className="mt-1 text-xs text-ink-600">Lý do: {u.lockedReason}{u.lockedAt ? ` (${fmtDate(u.lockedAt)})` : ""}</div>}</div>
        <div className="card p-4"><div className="text-xs text-ink-400">Đăng nhập gần nhất</div><div className="mt-1 text-sm">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Chưa đăng nhập"}</div><div className="text-xs text-ink-400">{u.hasAuth ? "Đã liên kết tài khoản đăng nhập" : "Chưa liên kết"}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Thao tác đã ghi nhật ký</div><div className="mt-1 text-2xl font-bold">{u.activity.actions}</div><div className="text-xs text-ink-400">{u.activity.lastActionAt ? `gần nhất ${fmtDateTime(u.activity.lastActionAt)}` : ""}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-400">Hồ sơ giáo viên</div><div className="mt-1 text-sm">{u.teacher ? `${u.teacher.fullName}${u.teacher.code ? ` (${u.teacher.code})` : ""}` : "—"}</div><div className="text-xs text-ink-400">Tạo lúc {fmtDate(u.createdAt)}</div></div>
      </div>
      <UserActions
        user={{ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, isActive: u.isActive, isSelf: u.isSelf, hasAuth: u.hasAuth }}
        roles={u.roles.map((r) => ({ id: r.id, role: r.role, label: r.label, centerCode: r.centerCode, centerName: r.centerName, grantedByName: r.grantedByName, createdAt: r.createdAt }))}
        roleOptions={opts.roles}
        centers={opts.centers}
        canEdit={canEdit}
      />
      <section className="card overflow-hidden">
        <h2 className="border-b border-black/5 px-4 py-3 font-semibold">Lịch sử thay đổi tài khoản</h2>
        {u.history.length === 0 ? <div className="p-4 text-sm text-ink-400">Chưa có thay đổi nào được ghi.</div> : (
          <ul className="divide-y divide-black/5 text-sm">
            {u.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span><b>{describe(h)}</b>{h.reason ? <span className="text-ink-600"> — {h.reason}</span> : null} <span className="text-xs text-ink-400">({ACTION_VI[h.action] ?? h.action})</span></span>
                <span className="text-xs text-ink-400">{h.actorName ?? "hệ thống"} · {fmtDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
