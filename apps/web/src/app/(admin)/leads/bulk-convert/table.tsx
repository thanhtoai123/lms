"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { packagePrice } from "@satarobo/core";
import { LeadChip, fmtDay } from "@/components/lead-ui";
import { vnd } from "@/components/finance-ui";

type Row = { classId: string; childId: string; packageSessions: number; mediaConsent: boolean; paidAmount: string; paidAt: string; checked: boolean };

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export function BulkConvert({ centerId, q }: { centerId: string | null; q?: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const data = useQuery(trpc.admissions.leads.bulkConvertCandidates.queryOptions({ centerId, q }));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [hideDone, setHideDone] = useState(true);
  const [quickClass, setQuickClass] = useState("");
  const run = useMutation(trpc.admissions.leads.bulkConvert.mutationOptions({
    onSuccess: (r) => {
      setResults(Object.fromEntries(r.results.map((x) => [x.leadId, { ok: x.ok, message: x.message }])));
      qc.invalidateQueries({ queryKey: trpc.admissions.leads.bulkConvertCandidates.queryKey({ centerId, q }) });
    },
  }));

  const items = useMemo(() => data.data?.items ?? [], [data.data]);
  const classOptions = useMemo(() => data.data?.classOptions ?? [], [data.data]);
  const classById = useMemo(() => new Map(classOptions.map((c) => [c.id, c] as const)), [classOptions]);
  const courseOfChild = (leadId: string, childId: string) => {
    const it = items.find((i) => i.id === leadId);
    return it?.children.find((c) => c.id === childId)?.interestedCourseId ?? it?.interestedCourseId ?? null;
  };
  const defaultRow = (id: string, leadCenterId: string | null, childId: string): Row => {
    const courseId = courseOfChild(id, childId);
    const cls = classOptions.find((c) => (!leadCenterId || c.centerId === leadCenterId) && (!courseId || c.courseId === courseId)) ?? classOptions.find((c) => !leadCenterId || c.centerId === leadCenterId);
    return { classId: cls?.id ?? "", childId, packageSessions: cls?.totalSessions || 48, mediaConsent: false, paidAmount: "", paidAt: today(), checked: false };
  };
  const row = (id: string, leadCenterId: string | null, firstChild: string): Row => rows[id] ?? defaultRow(id, leadCenterId, firstChild);
  const set = (id: string, leadCenterId: string | null, firstChild: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...row(id, leadCenterId, firstChild), ...patch } }));
  const listPriceOf = (r: Row) => {
    const c = r.classId ? classById.get(r.classId) : null;
    return c && c.listPrice && c.totalSessions ? packagePrice(c.listPrice, c.totalSessions, r.packageSessions || c.totalSessions) : null;
  };

  const visible = items.filter((i) => !(hideDone && results[i.id]?.ok));
  const selected = visible.filter((i) => row(i.id, i.centerId, i.children[0]?.id ?? "").checked && !results[i.id]?.ok);
  const eachVisible = (patch: (i: (typeof items)[number], r: Row) => Partial<Row>) =>
    setRows((prev) => {
      const next = { ...prev };
      for (const i of visible) {
        const cur = next[i.id] ?? defaultRow(i.id, i.centerId, i.children[0]?.id ?? "");
        next[i.id] = { ...cur, ...patch(i, cur) };
      }
      return next;
    });

  const submit = () => {
    run.mutate({
      items: selected.map((i) => {
        const r = row(i.id, i.centerId, i.children[0]?.id ?? "");
        return {
          leadId: i.id, classId: r.classId, childId: r.childId || (i.children[0]?.id ?? null), packageSessions: r.packageSessions,
          mediaConsent: r.mediaConsent, paidAmount: r.paidAmount ? Number(r.paidAmount) : null, paidAt: r.paidAt || null,
        };
      }),
    });
  };

  if (data.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (data.error) return <div className="card p-6 text-sm text-danger">{data.error.message}</div>;

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-3 text-xs">
        <label className="text-ink-600">Gán lớp nhanh (HV chưa gán, cùng khoá &amp; cơ sở)
          <select className="input mt-1 max-w-xs" value={quickClass} onChange={(e) => setQuickClass(e.target.value)}>
            <option value="">— Chọn lớp —</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} {c.courseCode ? `(${c.courseCode})` : ""}</option>)}
          </select>
        </label>
        <button className="btn-ghost" disabled={!quickClass} onClick={() => {
          const c = classById.get(quickClass);
          if (!c) return;
          eachVisible((i, r) => (!r.classId || (i.centerId === c.centerId && courseOfChild(i.id, r.childId || (i.children[0]?.id ?? "")) === c.courseId) ? { classId: c.id, packageSessions: c.totalSessions || r.packageSessions } : {}));
        }}>Áp dụng</button>
        <button className="btn-ghost" onClick={() => eachVisible(() => ({ checked: true }))}>Tick tất cả đang hiển thị</button>
        <button className="btn-ghost" onClick={() => eachVisible(() => ({ checked: false }))}>Bỏ tick</button>
        <button className="btn-ghost" onClick={() => eachVisible(() => ({ mediaConsent: true }))}>Đồng ý ảnh: tick tất cả</button>
        <button className="btn-ghost" onClick={() => eachVisible((i, r) => {
          if (!r.checked) return {};
          const child = i.children.find((c) => c.id === (r.childId || i.children[0]?.id));
          const paid = child?.tokens.paid ?? i.tokens.paid;
          return paid ? { paidAmount: String(paid) } : {};
        })}>Điền &quot;đã đóng&quot; theo file (lead đã tick)</button>
        <button className="btn-ghost" onClick={() => eachVisible((_i, r) => {
          const p = listPriceOf(r);
          return r.checked && p ? { paidAmount: String(p) } : {};
        })}>Điền &quot;đã đóng&quot; = học phí niêm yết (lead đã tick)</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ẩn lead đã chốt xong</label>
        <button className="btn-primary ml-auto" disabled={run.isPending || selected.length === 0} onClick={submit}>{run.isPending ? "Đang chốt…" : `Chốt ${selected.length} lead`}</button>
      </div>
      {run.data && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">Đã chốt {run.data.ok} lead{run.data.failed ? `, ${run.data.failed} lỗi (xem cột Kết quả)` : ""}.</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2"></th><th className="p-2">Phụ huynh</th><th className="p-2">Học viên</th><th className="p-2">Lớp</th><th className="p-2">Buổi</th><th className="p-2">Ảnh</th><th className="p-2">Đã đóng (đ) · ngày</th><th className="p-2">Kết quả</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {visible.map((i) => {
              const firstChild = i.children[0]?.id ?? "";
              const r = row(i.id, i.centerId, firstChild);
              const res = results[i.id];
              const price = listPriceOf(r);
              const upd = (patch: Partial<Row>) => set(i.id, i.centerId, firstChild, patch);
              return (
                <tr key={i.id} className={res ? (res.ok ? "bg-green-50/60" : "bg-red-50/60") : r.checked ? "bg-brand-50/40" : ""}>
                  <td className="p-2"><input type="checkbox" checked={r.checked} disabled={!!res?.ok} onChange={(e) => upd({ checked: e.target.checked })} /></td>
                  <td className="p-2">
                    <Link href={`/leads/${i.id}`} className="font-medium text-brand-700">{i.parentName || <span className="text-red-700">— thiếu tên —</span>}</Link>
                    <div className="text-[11px] text-ink-400">{i.phone} · {i.centerCode ?? "HO"} · {i.assigneeName ?? "chưa có sale"}</div>
                    <div className="text-[11px] text-ink-400">Đăng ký: {fmtDay(i.createdAt)}</div>
                    <div className="mt-0.5"><LeadChip status={i.status} /></div>
                    {i.warnings.map((w) => <div key={w} className="text-[11px] text-amber-700">⚠ {w}</div>)}
                  </td>
                  <td className="p-2">
                    {i.children.length > 1 ? (
                      <select className="input text-xs" value={r.childId || firstChild} onChange={(e) => upd({ childId: e.target.value })}>{i.children.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.grade ? ` · L${c.grade}` : ""}</option>)}</select>
                    ) : (i.children[0]?.fullName ?? i.childName ?? <span className="text-ink-400">—</span>)}
                  </td>
                  <td className="p-2">
                    <select className="input min-w-[220px] text-xs" value={r.classId} onChange={(e) => { const c = classById.get(e.target.value); upd({ classId: e.target.value, packageSessions: c?.totalSessions || r.packageSessions }); }}>
                      <option value="">— Chọn lớp —</option>
                      {classOptions.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} {c.courseCode ? `(${c.courseCode})` : ""}{c.listPrice ? ` · ${vnd(c.listPrice)}` : ""}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input type="number" min={1} className="input !w-20 text-xs" value={r.packageSessions} onChange={(e) => upd({ packageSessions: Number(e.target.value) })} /></td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.mediaConsent} onChange={(e) => upd({ mediaConsent: e.target.checked })} title="PH đồng ý đăng ảnh" /></td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <input type="number" min={0} step={100000} className="input !w-28 text-xs" placeholder="Bỏ trống nếu chưa rõ" value={r.paidAmount} onChange={(e) => upd({ paidAmount: e.target.value })} />
                      <input type="date" max={today()} className="input !w-36 text-xs" value={r.paidAt} onChange={(e) => upd({ paidAt: e.target.value })} />
                    </div>
                    {price !== null && <div className="text-[11px] text-ink-400">Học phí niêm yết {vnd(price)}</div>}
                    {!r.paidAmount && !i.unpaidAllowed && <div className="text-[11px] text-amber-700">Cần số tiền đã đóng để chốt</div>}
                  </td>
                  <td className="p-2 text-xs">{res ? <span className={res.ok ? "text-green-800" : "text-red-700"}>{res.message}</span> : <span className="text-ink-400">—</span>}</td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-400">Chưa có lead nào đủ điều kiện chốt — nhập file khách đã đăng ký ở màn “Nhập khách đã đăng ký”, hoặc chốt từng lead ở màn Chuyển đổi.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-400">Nhập “Đã đóng” nếu khách đã nộp học phí trước — hệ thống tạo đơn theo học phí niêm yết và ghi khoản thu <b>lùi ngày</b> ở trạng thái chờ kế toán xác nhận (không bịa khoản đã xác nhận). Bỏ trống nếu chưa rõ: chỉ chốt được với lead “Đã đăng ký” (nhập liệu ban đầu) hoặc người có quyền duyệt tài chính.</p>
    </div>
  );
}
