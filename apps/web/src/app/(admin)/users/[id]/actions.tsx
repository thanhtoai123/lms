"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { Role } from "@satarobo/core";
import { RolePicker, type RoleOpt, type CenterOpt } from "../role-picker";

type U = { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; isSelf: boolean; hasAuth: boolean };
type R = { id: string; role: string; label: string; centerCode: string | null; centerName: string | null; grantedByName: string | null; createdAt: Date };

export function UserActions({ user, roles, roleOptions, centers, canEdit }: { user: U; roles: R[]; roleOptions: RoleOpt[]; centers: CenterOpt[]; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newRole, setNewRole] = useState({ role: "", centerId: "" });
  const [lockReason, setLockReason] = useState("");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ fullName: user.fullName, email: user.email, phone: user.phone ?? "" });
  const ok = (text: string) => { setMsg({ ok: true, text }); router.refresh(); };
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });

  const grant = useMutation(trpc.system.grantRole.mutationOptions({ onSuccess: () => { setNewRole({ role: "", centerId: "" }); ok("Đã cấp vai trò. Quyền có hiệu lực ở lần tải trang kế tiếp của người dùng."); }, onError }));
  const revoke = useMutation(trpc.system.revokeRole.mutationOptions({ onSuccess: () => ok("Đã gỡ vai trò."), onError }));
  const lock = useMutation(trpc.system.setLock.mutationOptions({ onSuccess: () => { setLockReason(""); ok(user.isActive ? "Đã khoá tài khoản — người dùng bị đăng xuất ở lần gọi kế tiếp." : "Đã mở khoá tài khoản."); }, onError }));
  const update = useMutation(trpc.system.updateUser.mutationOptions({ onSuccess: () => { setEdit(false); ok("Đã lưu thông tin."); }, onError }));
  const busy = grant.isPending || revoke.isPending || lock.isPending || update.isPending;
  const isGlobal = roleOptions.find((r) => r.role === newRole.role)?.global ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {msg && <div className={`lg:col-span-3 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <section className="card space-y-3 p-4 lg:col-span-2">
        <h2 className="font-semibold">Vai trò & phạm vi</h2>
        <ul className="divide-y divide-black/5 text-sm">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <b>{r.label}</b> <span className="text-ink-600">· {r.centerCode ? `${r.centerCode} — ${r.centerName}` : "Toàn hệ thống"}</span>
                <div className="text-xs text-ink-400">cấp {new Date(r.createdAt).toLocaleDateString("vi-VN")}{r.grantedByName ? ` bởi ${r.grantedByName}` : ""}</div>
              </div>
              {canEdit && <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={busy} onClick={() => revoke.mutate({ roleId: r.id })}>Gỡ</button>}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="space-y-2 border-t border-black/5 pt-3">
            <div className="label">Cấp thêm vai trò</div>
            <div className="flex flex-wrap items-center gap-2">
              <RolePicker roles={roleOptions} centers={centers} role={newRole.role} centerId={newRole.centerId} onChange={(role, centerId) => setNewRole({ role, centerId })} />
              <button className="btn-primary" disabled={busy || !newRole.role || (!isGlobal && !newRole.centerId)} onClick={() => grant.mutate({ userId: user.id, role: newRole.role as Role, centerId: isGlobal ? null : newRole.centerId })}>Cấp</button>
            </div>
          </div>
        )}
      </section>

      <div className="space-y-4">
        {canEdit && (
          <section className="card space-y-2 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Thông tin</h2>{!edit && <button className="text-xs text-brand-600" onClick={() => setEdit(true)}>Sửa</button>}</div>
            {edit ? (
              <>
                <label className="text-xs text-ink-600">Họ tên<input className="input mt-1" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
                <label className="text-xs text-ink-600">Email<input className="input mt-1" type="email" value={form.email} disabled={user.hasAuth} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                {user.hasAuth && <p className="text-[11px] text-ink-400">Email đã liên kết đăng nhập nên không đổi tại đây.</p>}
                <label className="text-xs text-ink-600">Điện thoại<input className="input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => update.mutate({ id: user.id, fullName: form.fullName, email: form.email, phone: form.phone || null })}>Lưu</button>
                  <button className="btn-ghost" onClick={() => setEdit(false)}>Thôi</button>
                </div>
              </>
            ) : (
              <dl className="space-y-1 text-sm"><div><dt className="inline text-ink-400">Email: </dt><dd className="inline">{user.email}</dd></div><div><dt className="inline text-ink-400">Điện thoại: </dt><dd className="inline">{user.phone ?? "—"}</dd></div></dl>
            )}
          </section>
        )}
        {canEdit && (
          <section className="card space-y-2 p-4">
            <h2 className="font-semibold">{user.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"}</h2>
            {user.isActive ? (
              user.isSelf ? <p className="text-sm text-ink-600">Không thể tự khoá tài khoản của chính mình.</p> : (
                <>
                  <p className="text-xs text-ink-600">Người dùng không đăng nhập / gọi API được nữa. Dữ liệu và lịch sử được giữ nguyên.</p>
                  <input className="input" placeholder="Lý do (bắt buộc) — nghỉ việc, chuyển bộ phận…" value={lockReason} onChange={(e) => setLockReason(e.target.value)} maxLength={300} />
                  <button className="btn-primary !bg-red-600" disabled={busy || lockReason.trim().length < 5} onClick={() => lock.mutate({ userId: user.id, lock: true, reason: lockReason.trim() })}>Khoá tài khoản</button>
                </>
              )
            ) : (
              <button className="btn-primary" disabled={busy} onClick={() => lock.mutate({ userId: user.id, lock: false })}>Mở khoá</button>
            )}
          </section>
        )}
        {!canEdit && <section className="card p-4 text-sm text-ink-600">Bạn đang xem ở chế độ chỉ đọc.</section>}
      </div>
    </div>
  );
}
