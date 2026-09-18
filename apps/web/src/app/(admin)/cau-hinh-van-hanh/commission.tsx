"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  COMMISSION_EVENTS, COMMISSION_EVENT_VI, COMMISSION_EVENT_HINT, COMMISSION_SCOPES, COMMISSION_SCOPE_VI,
  COMMISSION_CALC_METHODS, COMMISSION_CALC_METHOD_VI,
  type CommissionEvent, type CommissionScope, type CommissionCalcMethod,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";

type TierRow = { from: number; to: number | null; amount: number | null; percent: number | null };
type ShareRow = { role: string; value: number; maxAmount: number | null; tiers: TierRow[] };
type Form = {
  id?: string; name: string; event: CommissionEvent; orderScope: CommissionScope; centerId: string;
  calcMethod: CommissionCalcMethod; shares: ShareRow[]; sourceRef: string; note: string;
  effectiveFrom: string; effectiveTo: string; isActive: boolean; reason: string;
};

const blank = (today: string): Form => ({
  name: "", event: "hoc_vien_moi", orderScope: "all", centerId: "", calcMethod: "percent",
  shares: [{ role: "", value: 0, maxAmount: null, tiers: [] }],
  sourceRef: "", note: "", effectiveFrom: today, effectiveTo: "", isActive: true, reason: "",
});

/** Chính sách hoa hồng 4 trục: chi khi nào · loại đơn · cách tính · ai nhận bao nhiêu */
export function CommissionPolicyPanel({ centers, today }: { centers: { id: string; code: string; name: string }[]; today: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.finance.commissionPolicies.queryOptions());
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toggling, setToggling] = useState<{ id: string; isActive: boolean; reason: string } | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.finance.commissionPolicies.queryKey() });
  const save = useMutation(trpc.finance.upsertCommissionPolicy.mutationOptions({ onSuccess: () => { setF(null); setErr(null); invalidate(); }, onError: (e) => setErr(e.message) }));
  const toggle = useMutation(trpc.finance.toggleCommissionPolicy.mutationOptions({ onSuccess: () => { setToggling(null); setErr(null); invalidate(); }, onError: (e) => setErr(e.message) }));

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error) return <div className="card p-6 text-sm text-red-700">{q.error.message}</div>;
  const d = q.data!;
  const isPercentish = (m: CommissionCalcMethod) => m === "percent";

  const setShare = (i: number, patch: Partial<ShareRow>) => f && setF({ ...f, shares: f.shares.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setTier = (si: number, ti: number, patch: Partial<TierRow>) =>
    f && setF({ ...f, shares: f.shares.map((s, k) => (k === si ? { ...s, tiers: s.tiers.map((t, j) => (j === ti ? { ...t, ...patch } : t)) } : s)) });

  const submit = () => {
    if (!f) return;
    setErr(null);
    save.mutate({
      id: f.id,
      name: f.name,
      event: f.event,
      orderScope: f.orderScope,
      centerId: f.centerId || null,
      calcMethod: f.calcMethod,
      shares: f.shares.map((s) => ({
        role: s.role,
        // % nhập theo đơn vị phần trăm, lưu theo điểm cơ bản (5% → 500)
        value: f.calcMethod === "percent" ? Math.round(s.value * 100) : Math.round(s.value),
        maxAmount: s.maxAmount,
        tiers: f.calcMethod === "tier"
          ? s.tiers.map((t) => ({ from: Math.round(t.from), to: t.to == null ? null : Math.round(t.to), amount: t.amount == null ? null : Math.round(t.amount), percent: t.percent == null ? null : Math.round(t.percent * 100) }))
          : null,
      })),
      sourceRef: f.sourceRef || null,
      note: f.note || null,
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo || null,
      isActive: f.isActive,
      reason: f.reason || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-1 p-4 text-sm">
        <p className="text-ink-600">
          Bốn trục: <b>chi khi nào</b> (sự kiện) · <b>loại đơn</b> · <b>cách tính</b> · <b>ai nhận bao nhiêu</b> (nhiều vai, mỗi vai một mức).
          Tổng % của mọi vai trong cùng một sự kiện + loại đơn không vượt trần <b>{d.capPercent}%</b> (đổi ở tab Thanh toán › nhóm Hoa hồng).
        </p>
        <p className="text-xs text-ink-400">Sửa chính sách bắt buộc ghi lý do (vào nhật ký kiểm toán). Dòng hoa hồng đã sinh trước đó giữ nguyên — chính sách chỉ áp cho lần tính sau.</p>
      </div>

      {d.buckets.length > 0 && (
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-2 font-semibold">Mức đang chiếm theo trần</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Sự kiện</th><th className="p-2">Loại đơn</th><th className="p-2">Cơ sở</th><th className="p-2 text-right">Đang chiếm</th><th className="p-2 text-right">Còn lại dưới trần</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.buckets.map((b, i) => (
                <tr key={i}>
                  <td className="p-2">{COMMISSION_EVENT_VI[b.event]}</td>
                  <td className="p-2">{COMMISSION_SCOPE_VI[b.orderScope]}</td>
                  <td className="p-2">{b.centerId ? centers.find((c) => c.id === b.centerId)?.code ?? "—" : "Dùng chung"}</td>
                  <td className="p-2 text-right tabular-nums">{b.percent}%</td>
                  <td className={`p-2 text-right tabular-nums ${b.remaining < 0 ? "text-red-700" : b.remaining === 0 ? "text-amber-700" : ""}`}>{b.remaining}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {d.perms.configure && !f && <button className="btn-primary" onClick={() => { setErr(null); setF(blank(today)); }}>+ Thêm chính sách</button>}

      {f && (
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">{f.id ? `Sửa chính sách — ${f.name}` : "Thêm chính sách hoa hồng"}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-ink-600 sm:col-span-3">Tên chính sách *<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Hoa hồng học viên mới — khoá học" /></label>
            <label className="text-xs text-ink-600">Trục 1 — chi khi nào *
              <select className="input mt-1" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value as CommissionEvent })}>
                {COMMISSION_EVENTS.map((v) => <option key={v} value={v}>{COMMISSION_EVENT_VI[v]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Trục 2 — loại đơn *
              <select className="input mt-1" value={f.orderScope} onChange={(e) => setF({ ...f, orderScope: e.target.value as CommissionScope })}>
                {COMMISSION_SCOPES.map((v) => <option key={v} value={v}>{COMMISSION_SCOPE_VI[v]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Trục 3 — cách tính *
              <select className="input mt-1" value={f.calcMethod} onChange={(e) => setF({ ...f, calcMethod: e.target.value as CommissionCalcMethod })}>
                {COMMISSION_CALC_METHODS.map((v) => <option key={v} value={v}>{COMMISSION_CALC_METHOD_VI[v]}</option>)}
              </select>
            </label>
            <p className="text-xs text-ink-400 sm:col-span-3">{COMMISSION_EVENT_HINT[f.event]}</p>
            <label className="text-xs text-ink-600">Cơ sở áp dụng
              <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })} disabled={!!f.id}>
                <option value="">Dùng chung (mọi cơ sở)</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Hiệu lực từ *<input type="date" className="input mt-1" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></label>
            <label className="text-xs text-ink-600">Hiệu lực đến<input type="date" className="input mt-1" value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} /></label>
            <label className="text-xs text-ink-600 sm:col-span-2">Nguồn văn bản<input className="input mt-1" value={f.sourceRef} onChange={(e) => setF({ ...f, sourceRef: e.target.value })} placeholder="SR.QD.208 · PL04 Điều 1" /></label>
            <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang áp dụng</label>
            <label className="text-xs text-ink-600 sm:col-span-3">Ghi chú<input className="input mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          </div>

          <div className="space-y-2 rounded-xl border border-black/10 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Trục 4 — ai nhận bao nhiêu</h3>
              <button className="text-xs text-brand-600" onClick={() => setF({ ...f, shares: [...f.shares, { role: "", value: 0, maxAmount: null, tiers: [] }] })}>+ Thêm vai</button>
            </div>
            {f.shares.map((s, i) => (
              <div key={i} className="space-y-2 border-t border-black/5 pt-2 first:border-0 first:pt-0">
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs text-ink-600">Vai nhận *<input className="input mt-1" value={s.role} onChange={(e) => setShare(i, { role: e.target.value })} placeholder="CENTER_SALES_CSM" /></label>
                  {f.calcMethod !== "tier" && (
                    <label className="text-xs text-ink-600">
                      {isPercentish(f.calcMethod) ? "Tỉ lệ (%) *" : "Số tiền mỗi đơn vị (đ) *"}
                      <input type="number" min={0} step={isPercentish(f.calcMethod) ? 0.01 : 1000} className="input mt-1 text-right" value={s.value} onChange={(e) => setShare(i, { value: Number(e.target.value) })} />
                    </label>
                  )}
                  <label className="text-xs text-ink-600">Trần mỗi lần (đ)<input type="number" min={0} step={1000} className="input mt-1 text-right" value={s.maxAmount ?? ""} onChange={(e) => setShare(i, { maxAmount: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                  {f.shares.length > 1 && <button className="self-end text-xs text-red-700" onClick={() => setF({ ...f, shares: f.shares.filter((_, k) => k !== i) })}>Xoá vai</button>}
                </div>
                {f.calcMethod === "tier" && (
                  <div className="space-y-1 rounded-lg bg-black/[0.03] p-2">
                    <div className="flex items-center justify-between text-xs">
                      <b>Bậc doanh thu của vai này</b>
                      <button className="text-brand-600" onClick={() => setShare(i, { tiers: [...s.tiers, { from: 0, to: null, amount: null, percent: null }] })}>+ Thêm bậc</button>
                    </div>
                    {s.tiers.length === 0 && <div className="text-xs text-ink-400">Chưa có bậc nào — thêm ít nhất một bậc.</div>}
                    {s.tiers.map((t, j) => (
                      <div key={j} className="grid gap-1 sm:grid-cols-5">
                        <label className="text-[11px] text-ink-600">Từ (đ)<input type="number" min={0} step={1000} className="input mt-0.5 !py-1 text-right text-xs" value={t.from} onChange={(e) => setTier(i, j, { from: Number(e.target.value) })} /></label>
                        <label className="text-[11px] text-ink-600">Đến (đ, trống = không giới hạn)<input type="number" min={0} step={1000} className="input mt-0.5 !py-1 text-right text-xs" value={t.to ?? ""} onChange={(e) => setTier(i, j, { to: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                        <label className="text-[11px] text-ink-600">Thưởng (đ)<input type="number" min={0} step={1000} className="input mt-0.5 !py-1 text-right text-xs" value={t.amount ?? ""} onChange={(e) => setTier(i, j, { amount: e.target.value === "" ? null : Number(e.target.value), percent: null })} /></label>
                        <label className="text-[11px] text-ink-600">hoặc thưởng (%)<input type="number" min={0} step={0.01} className="input mt-0.5 !py-1 text-right text-xs" value={t.percent ?? ""} onChange={(e) => setTier(i, j, { percent: e.target.value === "" ? null : Number(e.target.value), amount: null })} /></label>
                        <button className="self-end pb-1 text-xs text-red-700" onClick={() => setShare(i, { tiers: s.tiers.filter((_, k) => k !== j) })}>Xoá bậc</button>
                      </div>
                    ))}
                    <p className="text-[11px] text-ink-400">Các bậc không được chồng lấn — mỗi mức doanh thu chỉ rơi vào một bậc.</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-xs text-ink-600">
              {f.id ? "Lý do sửa * (ghi vào nhật ký)" : "Lý do / căn cứ (tuỳ chọn)"}
              <input className="input mt-1" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="VD: áp dụng PL04 sửa đổi từ 01/10" />
            </label>
            <button className="btn-primary" disabled={save.isPending || (!!f.id && f.reason.trim().length < 5)} onClick={submit}>{save.isPending ? "Đang lưu…" : "Lưu chính sách"}</button>
            <button className="btn-ghost" onClick={() => { setF(null); setErr(null); }}>Thôi</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Chính sách</th><th className="p-3">Sự kiện</th><th className="p-3">Loại đơn</th><th className="p-3">Cách tính</th><th className="p-3">Các vai nhận</th><th className="p-3">Hiệu lực</th><th className="p-3">Trạng thái</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5 align-top">
            {d.items.length === 0 && <tr><td className="p-4 text-ink-400" colSpan={8}>Chưa có chính sách hoa hồng nào.</td></tr>}
            {d.items.map((p) => (
              <tr key={p.id}>
                <td className="p-3">
                  <b>{p.name}</b>
                  <div className="text-xs text-ink-400">{p.centerCode ?? "Dùng chung"}{p.used ? ` · đã sinh ${p.used} dòng` : ""}</div>
                  {p.sourceRef && <div className="text-xs text-ink-600">{p.sourceRef}</div>}
                  {p.note && <div className="text-xs text-ink-400">{p.note}</div>}
                </td>
                <td className="p-3">{p.eventLabel}</td>
                <td className="p-3">{p.scopeLabel}</td>
                <td className="p-3">{p.calcLabel}{p.totalPercent > 0 && <div className="text-xs text-ink-400">tổng {p.totalPercent}%</div>}</td>
                <td className="p-3 text-xs">
                  {p.shares.map((s) => (
                    <div key={s.role}>{s.role}: <b>{s.label}</b>{s.maxAmount ? <span className="text-ink-400"> (tối đa {vnd(s.maxAmount)})</span> : null}</div>
                  ))}
                </td>
                <td className="p-3 text-xs">{p.effectiveFrom.split("-").reverse().join("/")}{p.effectiveTo ? ` → ${p.effectiveTo.split("-").reverse().join("/")}` : ""}</td>
                <td className="p-3">{p.isActive ? <span className="chip bg-green-100 text-green-800">Đang áp dụng</span> : <span className="chip bg-black/5">Đã tắt</span>}</td>
                <td className="p-3">
                  {p.canEdit && (
                    <div className="space-y-1 text-xs">
                      <button className="font-semibold text-brand-600" onClick={() => {
                        setErr(null);
                        setF({
                          id: p.id, name: p.name, event: p.event, orderScope: p.orderScope, centerId: p.centerId ?? "", calcMethod: p.calcMethod,
                          shares: p.shares.map((s) => ({
                            role: s.role,
                            value: p.calcMethod === "percent" ? s.value / 100 : s.value,
                            maxAmount: s.maxAmount,
                            tiers: (s.tiers ?? []).map((t) => ({ from: t.from, to: t.to, amount: t.amount ?? null, percent: t.percent == null ? null : t.percent / 100 })),
                          })),
                          sourceRef: p.sourceRef ?? "", note: p.note ?? "", effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo ?? "", isActive: p.isActive, reason: "",
                        });
                      }}>Sửa</button>
                      {toggling?.id === p.id ? (
                        <div className="space-y-1">
                          <input className="input !py-1 text-xs" placeholder="Lý do (bắt buộc)" value={toggling.reason} onChange={(e) => setToggling({ ...toggling, reason: e.target.value })} />
                          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={toggling.reason.trim().length < 5 || toggle.isPending}
                            onClick={() => toggle.mutate({ id: p.id, isActive: toggling.isActive, reason: toggling.reason.trim() })}>Xác nhận</button>
                        </div>
                      ) : (
                        <div><button className="text-ink-600" onClick={() => { setErr(null); setToggling({ id: p.id, isActive: !p.isActive, reason: "" }); }}>{p.isActive ? "Tắt" : "Bật"}</button></div>
                      )}
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
