"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { DEPARTMENTS, DEPARTMENT_VI, type Department, type Role } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { dmy } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Defs = RouterOutputs["hr"]["positionDefs"];
type Deps = RouterOutputs["hr"]["deployments"];
type Center = { id: string; code: string; name: string };
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** Danh mục vị trí = bộ vai trò gắn vào ghế */
export function PositionDefs({ data, centers }: { data: Defs; centers: Center[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ id: undefined as string | undefined, name: "", centerId: "", department: "" as Department | "", roles: [] as Role[], reportsToId: "", isManager: false, isActive: true });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation(trpc.hr.upsertPositionDef.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã lưu vị trí" }); setOpen(false); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const toggle = (r: Role) => setF((x) => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter((y) => y !== r) : [...x.roles, r] }));
  return (
    <div className="space-y-3">
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      {data.canEdit && !open && <button className="btn-primary" onClick={() => { setF({ id: undefined, name: "", centerId: "", department: "", roles: [], reportsToId: "", isManager: false, isActive: true }); setOpen(true); }}>Thêm vị trí</button>}
      {open && (
        <div className="card space-y-3 p-4 text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs text-ink-600">Tên vị trí *<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: Quản lý cơ sở 1" /></label>
            <label className="text-xs text-ink-600">Đơn vị trực thuộc *
              <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>
                <option value="">Hội sở / toàn hệ thống</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Bộ phận
              <select className="input mt-1" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value as Department })}>
                <option value="">—</option>
                {DEPARTMENTS.map((k) => <option key={k} value={k}>{DEPARTMENT_VI[k]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Báo cáo cho
              <select className="input mt-1" value={f.reportsToId} onChange={(e) => setF({ ...f, reportsToId: e.target.value })}>
                <option value="">— Không —</option>
                {data.items.filter((x) => x.id !== f.id).map((x) => <option key={x.id} value={x.id}>{x.centerCode} · {x.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={f.isManager} onChange={(e) => setF({ ...f, isManager: e.target.checked })} /> Là vị trí quản lý</label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang dùng</label>
          </div>
          <div>
            <div className="text-xs font-semibold text-ink-600">Bộ vai trò (người giữ vị trí hưởng đủ các vai)</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {data.roles.map((r) => (
                <button key={r.role} className={`chip ${f.roles.includes(r.role) ? "bg-brand-100 text-brand-800" : "bg-black/5"}`} onClick={() => toggle(r.role)}>{r.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending || f.name.trim().length < 2 || f.roles.length === 0}
              onClick={() => save.mutate({ id: f.id, centerId: f.centerId || null, name: f.name.trim(), department: f.department || null, roles: f.roles, reportsToId: f.reportsToId || null, isManager: f.isManager, isActive: f.isActive })}>
              {f.id ? "Lưu vị trí" : "Tạo vị trí"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Vị trí</th><th className="p-3">Đơn vị</th><th className="p-3">Bộ vai trò</th><th className="p-3">Báo cáo cho</th><th className="p-3">Đang giữ</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {data.items.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-60"}>
                <td className="p-3">{p.name}{p.isManager && <span className="ml-1 chip bg-amber-100 text-amber-800">Quản lý</span>}</td>
                <td className="p-3 text-xs">{p.centerCode}</td>
                <td className="p-3 text-xs">{p.roleLabels.join(", ")}</td>
                <td className="p-3 text-xs">{p.reportsToName ?? "—"}</td>
                <td className="p-3 text-xs">{p.holders.length === 0 ? <span className="text-ink-400">Trống</span> : p.holders.map((h) => <div key={h.staffId}>{h.name}</div>)}</td>
                <td className="p-3 text-right">
                  {data.canEdit && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setF({ id: p.id, name: p.name, centerId: p.centerId ?? "", department: (p.department as Department) ?? "", roles: (p.roles ?? []) as Role[], reportsToId: p.reportsToId ?? "", isManager: p.isManager, isActive: p.isActive }); setOpen(true); }}>Sửa</button>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td className="p-3 text-sm text-ink-400" colSpan={6}>Chưa khai vị trí nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Điều động tác nghiệp — chỉ mở phạm vi dữ liệu của cơ sở trong khoảng thời gian */
export function DeploymentAdmin({ data, centers, people }: { data: Deps; centers: Center[]; people: RouterOutputs["hr"]["assignableStaff"] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ staffId: "", centerId: "", from: today(), to: "", reason: "", decisionNo: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState("");
  const add = useMutation(trpc.hr.addDeployment.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã tạo điều động" }); setF({ ...f, reason: "", note: "" }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const end = useMutation(trpc.hr.endDeployment.mutationOptions({
    onSuccess: () => { setMsg({ ok: true, text: "Đã kết thúc điều động" }); setEndId(null); setEndReason(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Nơi tác nghiệp tách khỏi nơi trực thuộc: giáo viên biên chế Hội sở được điều xuống cơ sở dạy mà không đổi biên chế, không đổi vai trò. Điều động chỉ mở phạm vi dữ liệu của cơ sở đó, trong đúng khoảng thời gian ghi ở đây — hết hạn là mất truy cập ngay.</p>
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      {data.canEdit && (
        <div className="card grid gap-2 p-4 md:grid-cols-3">
          <label className="text-xs text-ink-600">Người *
            <select className="input mt-1" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
              <option value="">— Chọn nhân sự —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.fullName}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Nơi tác nghiệp *
            <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>
              <option value="">— Chọn cơ sở —</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600">Hiệu lực từ *<input type="date" className="input mt-1" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Đến ngày<input type="date" className="input mt-1" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Số quyết định<input className="input mt-1" value={f.decisionNo} onChange={(e) => setF({ ...f, decisionNo: e.target.value })} placeholder="VD: 12/2026/QĐ-SR" maxLength={60} /></label>
          <label className="text-xs text-ink-600 md:col-span-2">Lý do *<input className="input mt-1" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Lý do điều động…" /></label>
          <div className="md:col-span-3">
            <button className="btn-primary" disabled={add.isPending || !f.staffId || !f.centerId || f.reason.trim().length < 5}
              onClick={() => add.mutate({ staffId: f.staffId, centerId: f.centerId, effectiveFrom: f.from, effectiveTo: f.to || null, reason: f.reason.trim(), decisionNo: f.decisionNo.trim() || null, note: f.note || null })}>Điều động</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Người — vị trí</th><th className="p-3">Nơi tác nghiệp</th><th className="p-3">Số quyết định</th><th className="p-3">Lý do</th><th className="p-3">Hiệu lực</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {data.items.map((x) => (
              <tr key={x.id}>
                <td className="p-3">{x.staffName}<div className="text-xs text-ink-400">{x.staffCode} · {x.staffTitle} · biên chế {x.homeCenter}</div></td>
                <td className="p-3 text-xs">{x.centerCode}</td>
                <td className="p-3 text-xs font-mono">{x.decisionNo ?? "—"}</td>
                <td className="p-3 text-xs">{x.reason}{x.note && <div className="text-ink-400">{x.note}</div>}</td>
                <td className="p-3 text-xs">{dmy(x.effectiveFrom)} → {x.effectiveTo ? dmy(x.effectiveTo) : "vô thời hạn"}{x.active && <span className="ml-1 chip bg-green-100 text-green-800">Đang hiệu lực</span>}</td>
                <td className="p-3 text-right text-xs">
                  {data.canEdit && x.active && (endId === x.id ? (
                    <span className="flex items-center gap-1">
                      <input className="input !w-40 !py-1 text-xs" placeholder="Lý do kết thúc" value={endReason} onChange={(e) => setEndReason(e.target.value)} />
                      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={endReason.trim().length < 5 || end.isPending} onClick={() => end.mutate({ id: x.id, effectiveTo: today(), reason: endReason.trim() })}>Lưu</button>
                    </span>
                  ) : <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEndId(x.id)}>Kết thúc</button>)}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td className="p-3 text-sm text-ink-400" colSpan={6}>Chưa có điều động nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
