"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LeadChip } from "@/components/lead-ui";

type Row = { classId: string; childId: string; packageSessions: number; mediaConsent: boolean; paidAmount: string; paidAt: string; checked: boolean };

export function BulkConvert({ centerId, q }: { centerId: string | null; q?: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const data = useQuery(trpc.admissions.leads.bulkConvertCandidates.queryOptions({ centerId, q }));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [hideDone, setHideDone] = useState(true);
  const run = useMutation(trpc.admissions.leads.bulkConvert.mutationOptions({
    onSuccess: (r) => { setResults(Object.fromEntries(r.results.map((x) => [x.leadId, { ok: x.ok, message: x.message }]))); qc.invalidateQueries({ queryKey: trpc.admissions.leads.bulkConvertCandidates.queryKey({ centerId, q }) }); },
  }));

  const items = data.data?.items ?? [];
  const classOptions = data.data?.classOptions ?? [];
  const row = (id: string, centerIdOfLead: string | null): Row => rows[id] ?? { classId: classOptions.find((c) => c.centerId === centerIdOfLead)?.id ?? classOptions[0]?.id ?? "", childId: "", packageSessions: 48, mediaConsent: false, paidAmount: "", paidAt: "", checked: false };
  const set = (id: string, cid: string | null, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...row(id, cid), ...patch } }));
  const selected = useMemo(() => items.filter((i) => row(i.id, i.centerId).checked && !results[i.id]?.ok), [items, rows, results]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = items.filter((i) => !(hideDone && results[i.id]?.ok));

  const submit = () => {
    run.mutate({
      items: selected.map((i) => {
        const r = row(i.id, i.centerId);
        return { leadId: i.id, classId: r.classId, childId: r.childId || (i.children[0]?.id ?? null), packageSessions: r.packageSessions, mediaConsent: r.mediaConsent, paidAmount: r.paidAmount ? Number(r.paidAmount) : null, paidAt: r.paidAt || null };
      }),
    });
  };

  if (data.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (data.error) return <div className="card p-6 text-sm text-danger">{data.error.message}</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn-ghost text-xs" onClick={() => items.forEach((i) => set(i.id, i.centerId, { checked: true }))}>Tick tất cả</button>
        <button className="btn-ghost text-xs" onClick={() => items.forEach((i) => set(i.id, i.centerId, { mediaConsent: true }))}>Đồng ý ảnh tất cả</button>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ẩn lead đã chốt</label>
        <button className="btn-primary ml-auto" disabled={run.isPending || selected.length === 0} onClick={submit}>{run.isPending ? "Đang chốt…" : `Chốt ${selected.length} lead`}</button>
      </div>
      {run.data && <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">Đã chốt {run.data.ok} lead{run.data.failed ? `, ${run.data.failed} lỗi (xem cột Kết quả)` : ""}.</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2"></th><th className="p-2">PH</th><th className="p-2">HS</th><th className="p-2">Lớp</th><th className="p-2">Buổi</th><th className="p-2">Ảnh</th><th className="p-2">Đã đóng (đ) · ngày</th><th className="p-2">Kết quả</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {visible.map((i) => {
              const r = row(i.id, i.centerId);
              const res = results[i.id];
              return (
                <tr key={i.id} className={res ? (res.ok ? "bg-green-50/60" : "bg-red-50/60") : r.checked ? "bg-brand-50/40" : ""}>
                  <td className="p-2"><input type="checkbox" checked={r.checked} disabled={!!res?.ok} onChange={(e) => set(i.id, i.centerId, { checked: e.target.checked })} /></td>
                  <td className="p-2">
                    <Link href={`/ops/leads/${i.id}`} className="font-medium text-brand-700">{i.parentName || <span className="text-red-700">— thiếu tên —</span>}</Link>
                    <div className="text-[11px] text-ink-400">{i.phone} · {i.centerCode ?? "HO"} · {i.assigneeName ?? "chưa có sale"}</div>
                    <div className="mt-0.5"><LeadChip status={i.status} /></div>
                    {i.warnings.map((w) => <div key={w} className="text-[11px] text-amber-700">⚠ {w}</div>)}
                  </td>
                  <td className="p-2">
                    {i.children.length > 1 ? (
                      <select className="input text-xs" value={r.childId || i.children[0]!.id} onChange={(e) => set(i.id, i.centerId, { childId: e.target.value })}>{i.children.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.grade ? ` · L${c.grade}` : ""}</option>)}</select>
                    ) : (i.children[0]?.fullName ?? i.childName ?? <span className="text-ink-400">—</span>)}
                  </td>
                  <td className="p-2">
                    <select className="input text-xs min-w-[220px]" value={r.classId} onChange={(e) => set(i.id, i.centerId, { classId: e.target.value })}>
                      {classOptions.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} {c.courseCode ? `(${c.courseCode})` : ""}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input type="number" min={1} className="input !w-20 text-xs" value={r.packageSessions} onChange={(e) => set(i.id, i.centerId, { packageSessions: Number(e.target.value) })} /></td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.mediaConsent} onChange={(e) => set(i.id, i.centerId, { mediaConsent: e.target.checked })} title="PH đồng ý đăng ảnh" /></td>
                  <td className="p-2"><div className="flex gap-1"><input type="number" min={0} step={100000} className="input !w-28 text-xs" placeholder="0" value={r.paidAmount} onChange={(e) => set(i.id, i.centerId, { paidAmount: e.target.value })} /><input type="date" className="input !w-36 text-xs" value={r.paidAt} onChange={(e) => set(i.id, i.centerId, { paidAt: e.target.value })} /></div></td>
                  <td className="p-2 text-xs">{res ? <span className={res.ok ? "text-green-800" : "text-red-700"}>{res.message}</span> : <span className="text-ink-400">—</span>}</td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-400">Không có lead nào đủ điều kiện chốt (đã học thử / chờ quyết định / đang tư vấn).</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
