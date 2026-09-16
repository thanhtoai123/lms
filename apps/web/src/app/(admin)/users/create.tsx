"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { Role } from "@satarobo/core";
import { RolePicker, type RoleOpt, type CenterOpt } from "./role-picker";

type Row = { role: string; centerId: string };

export function CreateUser({ roles, centers }: { roles: RoleOpt[]; centers: CenterOpt[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([{ role: "", centerId: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation(trpc.system.createUser.mutationOptions({
    onSuccess: (r) => router.push(`/users/${r.id}`),
    onError: (e) => setErr(e.message),
  }));

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Tạo tài khoản</button>;
  const valid = email.includes("@") && fullName.trim().length >= 2 && rows.every((r) => r.role && (roles.find((x) => x.role === r.role)?.global || r.centerId));
  const submit = () => {
    setErr(null);
    create.mutate({ email: email.trim(), fullName: fullName.trim(), phone: phone.trim() || null, roles: rows.map((r) => ({ role: r.role as Role, centerId: roles.find((x) => x.role === r.role)?.global ? null : r.centerId })) });
  };
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold">Tạo tài khoản</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <p className="text-xs text-ink-600">Mật khẩu không nhập ở đây: người dùng đăng nhập bằng email này qua trang đăng nhập (liên kết lần đầu tự động).</p>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Email *<input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
        <label className="text-xs text-ink-600">Họ tên *<input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label className="text-xs text-ink-600">Điện thoại<input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <div className="space-y-2">
        <div className="label">Vai trò *</div>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <RolePicker roles={roles} centers={centers} role={r.role} centerId={r.centerId} onChange={(role, centerId) => setRows(rows.map((x, j) => (j === i ? { role, centerId } : x)))} />
            {rows.length > 1 && <button className="text-xs text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Bỏ</button>}
          </div>
        ))}
        <button className="text-xs font-semibold text-brand-600" onClick={() => setRows([...rows, { role: "", centerId: "" }])}>+ Thêm vai trò</button>
      </div>
      <button className="btn-primary" disabled={!valid || create.isPending} onClick={submit}>{create.isPending ? "Đang tạo…" : "Tạo tài khoản"}</button>
    </section>
  );
}
