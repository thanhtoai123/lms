"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { SHIFT_KINDS, SHIFT_KIND_VI, WORKPLACES, WORKPLACE_VI, type ShiftKind, type Workplace } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { units } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Shift = RouterOutputs["hr"]["shifts"][number];
type Center = { id: string; code: string; name: string };
type Seg = { from: string; to: string };

const empty = { id: undefined as string | undefined, code: "", name: "", kind: "timed" as ShiftKind, units: 1, workplace: "own_center" as Workplace, punchRequired: true, isActive: true, scope: "shared" };

export function ShiftCatalogue({ centerId, centers, shifts, tab }: { centerId: string; centers: Center[]; shifts: Shift[]; tab: "all" | "on" | "off" }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [segs, setSegs] = useState<Seg[]>([{ from: "08:00", to: "11:30" }, { from: "13:30", to: "17:30" }]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = { onSuccess: () => { setMsg({ ok: true, text: "Đã lưu mã ca" }); setOpen(false); setForm(empty); router.refresh(); }, onError: (e: { message: string }) => setMsg({ ok: false, text: e.message }) };
  const save = useMutation(trpc.hr.upsertShift.mutationOptions(done));
  const seed = useMutation(trpc.hr.seedShiftCatalogue.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã nạp ${r.created} mã ca gốc (bỏ qua ${r.skipped} mã đã có)` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const rows = shifts.filter((s) => (tab === "on" ? s.isActive : tab === "off" ? !s.isActive : true));

  const edit = (s: Shift) => {
    setForm({ id: s.id, code: s.code, name: s.name, kind: s.kind, units: s.units, workplace: s.workplace, punchRequired: s.punchRequired, isActive: s.isActive, scope: s.centerId ? "center" : "shared" });
    setSegs((s.segments ?? []).map((x) => ({ from: x.from, to: x.to })));
    setOpen(true);
    setMsg(null);
  };
  const submit = () => save.mutate({
    id: form.id, centerId: form.scope === "center" ? centerId : null, code: form.code, name: form.name, kind: form.kind,
    units: form.units, segments: form.kind === "timed" ? segs : [], workplace: form.workplace,
    workplaceCenterId: form.workplace === "fixed_center" ? centerId : null, punchRequired: form.kind === "timed" ? true : form.punchRequired, isActive: form.isActive,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["all", "on", "off"] as const).map((t) => (
          <a key={t} href={`/cham-cong/danh-muc-ca?center=${centerId}&tab=${t}`} className={`chip ${tab === t ? "bg-brand-100 text-brand-800" : "bg-black/5"}`}>{t === "all" ? "Tất cả" : t === "on" ? "Đang dùng" : "Đã ngưng"}</a>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost !py-1 text-xs" disabled={seed.isPending} onClick={() => seed.mutate()}>Nạp danh mục mã ca gốc</button>
          <button className="btn-primary !py-1 text-xs" onClick={() => { setForm(empty); setSegs([{ from: "08:00", to: "11:30" }, { from: "13:30", to: "17:30" }]); setOpen(true); }}>Thêm mã ca</button>
        </div>
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}

      {open && (
        <div className="card space-y-3 p-4 text-sm">
          <div className="grid gap-2 md:grid-cols-4">
            <label className="text-xs text-ink-600">Mã *<input className="input mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CG" /></label>
            <label className="text-xs text-ink-600 md:col-span-2">Tên *<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ca gãy" /></label>
            <label className="text-xs text-ink-600">Loại
              <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ShiftKind, units: e.target.value === "off" || e.target.value === "leave" ? 0 : form.units || 1 })}>
                {SHIFT_KINDS.map((k) => <option key={k} value={k}>{SHIFT_KIND_VI[k]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Công
              <select className="input mt-1" value={form.units} onChange={(e) => setForm({ ...form, units: Number(e.target.value) })}>
                {[0, 0.5, 1, 1.5].map((u) => <option key={u} value={u}>{units(u)}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Nơi làm
              <select className="input mt-1" value={form.workplace} onChange={(e) => setForm({ ...form, workplace: e.target.value as Workplace })}>
                {WORKPLACES.map((w) => <option key={w} value={w}>{WORKPLACE_VI[w]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Phạm vi
              <select className="input mt-1" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} disabled={!!form.id}>
                <option value="shared">Dùng chung (Hội sở)</option>
                <option value="center">Riêng cơ sở {centers.find((c) => c.id === centerId)?.code}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Đang dùng</label>
            {form.kind !== "timed" && <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={form.punchRequired} onChange={(e) => setForm({ ...form, punchRequired: e.target.checked })} /> Phải quét</label>}
          </div>
          {form.kind === "timed" && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-ink-600">Đoạn giờ (ca gãy khai nhiều đoạn)</div>
              {segs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" className="input w-auto" value={s.from} onChange={(e) => setSegs(segs.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                  <span>–</span>
                  <input type="time" className="input w-auto" value={s.to} onChange={(e) => setSegs(segs.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSegs(segs.filter((_, j) => j !== i))}>Xoá</button>
                </div>
              ))}
              {segs.length < 4 && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSegs([...segs, { from: "18:00", to: "21:00" }])}>Thêm đoạn</button>}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending} onClick={submit}>{form.id ? "Lưu mã ca" : "Tạo mã ca"}</button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setForm(empty); }}>Huỷ</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Mã</th><th className="p-3">Tên</th><th className="p-3">Loại</th><th className="p-3">Giờ</th><th className="p-3 text-right">Giờ KH</th><th className="p-3 text-right">Công</th><th className="p-3">Nơi làm</th><th className="p-3">Phạm vi</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((s) => (
              <tr key={s.id} className={s.isActive ? "" : "opacity-60"}>
                <td className="p-3 font-mono font-semibold">{s.code}</td>
                <td className="p-3">{s.name}</td>
                <td className="p-3 text-xs">{SHIFT_KIND_VI[s.kind]}</td>
                <td className="p-3 text-xs">{s.clock || "—"}</td>
                <td className="p-3 text-right tabular-nums text-xs">{s.plannedMinutes ? `${Math.floor(s.plannedMinutes / 60)}h${String(s.plannedMinutes % 60).padStart(2, "0")}` : "—"}</td>
                <td className="p-3 text-right tabular-nums">{units(s.units)}</td>
                <td className="p-3 text-xs">{WORKPLACE_VI[s.workplace]}</td>
                <td className="p-3 text-xs">{s.centerId ? `Riêng ${s.centerCode}` : "Dùng chung"}</td>
                <td className="p-3 text-xs">{s.isActive ? <span className="chip bg-green-100 text-green-800">Đang dùng</span> : <span className="chip bg-slate-100 text-slate-600">Đã ngưng</span>}{s.usedCells > 0 && <div className="text-ink-400">{s.usedCells} ô lịch</div>}</td>
                <td className="p-3 text-right">
                  {s.canEdit && (
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => edit(s)}>Sửa</button>
                      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={save.isPending}
                        onClick={() => save.mutate({ id: s.id, centerId: s.centerId, code: s.code, name: s.name, kind: s.kind, units: s.units, segments: (s.segments ?? []).map((x) => ({ from: x.from, to: x.to })), workplace: s.workplace, workplaceCenterId: s.workplaceCenterId, punchRequired: s.punchRequired, isActive: !s.isActive })}>
                        {s.isActive ? "Ngưng" : "Dùng lại"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
