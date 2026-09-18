"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Center = { id: string; code: string; name: string };

export function GroupForm({ centers, group }: { centers: Center[]; group?: { id: string; name: string; description: string | null; centerId: string | null } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [centerId, setCenterId] = useState(group?.centerId ?? "");
  const m = useMutation(trpc.admin.upsertGroup.mutationOptions({
    onSuccess: (r) => { setOpen(false); router.push(`/user-groups?id=${r.id}`); router.refresh(); },
  }));
  if (!open) return <button className={group ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>{group ? "Sửa" : "+ Tạo nhóm"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form className="card w-full max-w-md space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: group?.id, name, description: description || null, centerId: centerId || null }); }}>
        <h3 className="font-semibold">{group ? "Sửa nhóm" : "Tạo nhóm"}</h3>
        <label className="block text-sm">Tên nhóm<input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
        <label className="block text-sm">Mô tả<textarea className="input mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} /></label>
        <label className="block text-sm">Phạm vi
          <select className="input mt-1 w-full" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">Toàn hệ thống</option>
            {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function MemberAdder({ groupId, existing }: { groupId: string; existing: string[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = useQuery({ ...trpc.system.users.queryOptions({ q, status: "active" }), enabled: q.trim().length >= 2 });
  const m = useMutation(trpc.admin.setGroupMembers.mutationOptions({ onSuccess: () => { setQ(""); router.refresh(); } }));
  const opts = (list.data?.items ?? []).filter((u) => !existing.includes(u.id)).slice(0, 8);
  return (
    <div className="relative">
      <input className="input w-64" placeholder="Thêm thành viên: tên / email…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-black/10 bg-white shadow-lg">
          {list.isLoading ? <div className="p-2 text-xs text-ink-400">Đang tìm…</div> : opts.length === 0 ? <div className="p-2 text-xs text-ink-400">Không có tài khoản phù hợp</div> : opts.map((u) => (
            <button key={u.id} type="button" className="block w-full p-2 text-left text-sm hover:bg-black/5" disabled={m.isPending} onClick={() => m.mutate({ groupId, add: [u.id] })}>
              {u.fullName}<span className="block text-xs text-ink-400">{u.email}</span>
            </button>
          ))}
        </div>
      )}
      {m.error && <p className="text-xs text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function RemoveMember({ groupId, userId }: { groupId: string; userId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.setGroupMembers.mutationOptions({ onSuccess: () => router.refresh() }));
  return <button className="text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ groupId, remove: [userId] })}>Gỡ</button>;
}

export function DeleteGroup({ id, name }: { id: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const m = useMutation(trpc.admin.deleteGroup.mutationOptions({ onSuccess: () => { router.push("/user-groups"); router.refresh(); } }));
  if (!confirm) return <button className="btn-ghost text-red-700" onClick={() => setConfirm(true)}>Xoá</button>;
  return (
    <span className="flex items-center gap-2 text-xs">
      Xoá nhóm “{name}”?
      <button className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id })}>Xoá</button>
      <button className="btn-ghost" onClick={() => setConfirm(false)}>Không</button>
      {m.error && <span className="text-red-700">{m.error.message}</span>}
    </span>
  );
}

type Catalog = { group: string; items: { key: string; label: string; permissions: string[] }[] }[];

/**
 * Quyền cấp theo nhóm — "cấp quyền cho một nhóm người mà không sửa vai trò".
 * Quyền của một người = quyền vai trò ∪ quyền của mọi nhóm họ thuộc (chỉ cộng thêm, không bớt).
 */
export function GroupPermissions({ groupId, scope, catalog, actionLabels, current, canEdit }: {
  groupId: string;
  scope: string;
  catalog: Catalog;
  actionLabels: Record<string, string>;
  current: string[];
  canEdit: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(current);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.admin.setGroupPermissions.mutationOptions({ onSuccess: () => { setReason(""); router.refresh(); } }));
  const toggle = (p: string) => setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const dirty = [...sel].sort().join("|") !== [...current].sort().join("|");
  const actions = Object.keys(actionLabels);

  return (
    <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ groupId, permissions: sel, reason }); }}>
      <div>
        <h3 className="font-semibold">Quyền cấp theo nhóm <span className="text-xs font-normal text-ink-400">({sel.length} quyền · phạm vi {scope})</span></h3>
        <p className="text-xs text-ink-600">Cấp thêm quyền cho cả nhóm mà không phải sửa vai trò từng người. Quyền nhóm chỉ <b>cộng thêm</b>, không bớt quyền sẵn có. Quyền hệ thống / audit / tuân thủ vẫn phải đi qua vai trò.</p>
      </div>
      <div className="space-y-3">
        {catalog.map((g) => (
          <div key={g.group} className="overflow-x-auto">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400">{g.group}</div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-400"><tr><th className="py-1">Tài nguyên</th>{actions.map((a) => <th key={a} className="py-1 text-center">{actionLabels[a]}</th>)}</tr></thead>
              <tbody className="divide-y divide-black/5">
                {g.items.map((it) => (
                  <tr key={it.key}>
                    <td className="py-1">{it.label}</td>
                    {actions.map((a) => {
                      const p = `${it.key}:${a}`;
                      const ok = it.permissions.includes(p);
                      return (
                        <td key={a} className="py-1 text-center">
                          {ok ? <input type="checkbox" checked={sel.includes(p)} disabled={!canEdit} onChange={() => toggle(p)} aria-label={`${it.label} — ${actionLabels[a]}`} /> : <span className="text-ink-400">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do thay đổi (bắt buộc, ≥ 5 ký tự — ghi vào nhật ký)" maxLength={300} required />
          <button className="btn-primary" disabled={m.isPending || !dirty}>{m.isPending ? "Đang lưu…" : "Lưu quyền nhóm"}</button>
          {dirty && <span className="text-xs text-amber-700">Có thay đổi chưa lưu</span>}
        </div>
      ) : <p className="text-xs text-ink-400">Chỉ Quản trị tối cao đổi được quyền của nhóm.</p>}
      {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
      {m.isSuccess && <p className="text-sm text-green-700">Đã lưu quyền nhóm. Người trong nhóm nhận quyền mới ở lần tải trang kế tiếp.</p>}
    </form>
  );
}

export function Announce({ groupId, count }: { groupId: string; count: number }) {
  const trpc = useTRPC();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [priority, setPriority] = useState(2);
  const m = useMutation(trpc.admin.announce.mutationOptions({ onSuccess: () => { setTitle(""); setBody(""); setLink(""); } }));
  return (
    <form className="card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ groupId, title, body, link: link || null, priority }); }}>
      <h3 className="font-semibold">Gửi thông báo nội bộ <span className="text-xs font-normal text-ink-400">tới {count} thành viên đang hoạt động (chuông thông báo)</span></h3>
      <input className="input w-full" placeholder="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
      <textarea className="input w-full" placeholder="Nội dung" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} required />
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" placeholder="Liên kết nội bộ (vd /hoan-tien)" value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} />
        <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}><option value={1}>Cao</option><option value={2}>Thường</option><option value={3}>Thấp</option></select>
        <button className="btn-primary" disabled={m.isPending || count === 0}>Gửi</button>
      </div>
      {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
      {m.data && <p className="text-sm text-green-700">Đã gửi tới {m.data.recipients} người.</p>}
    </form>
  );
}
