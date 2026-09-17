"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ASSIGNMENT_SOURCES, ASSIGNMENT_SOURCE_VI, type AssignmentSource } from "@satarobo/core";
import { fmtDateTime } from "@/components/lead-ui";
import { downloadCsv } from "@/lib/download-csv";

const localDay = (offsetDays = 0) => new Date(Date.now() + 7 * 3600e3 + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Tab "Sổ chia lead": mỗi lần lead được giao cho ai, nguồn, có tiêu lượt không, lượt sau khi chia */
export function DistributionLogTab({ centerId, sales }: { centerId: string; sales: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [f, setF] = useState({ from: localDay(-30), to: localDay(), saleId: "", source: "" as "" | AssignmentSource, consumed: "" as "" | "co" | "khong" });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const input = {
    centerId, from: f.from || undefined, to: f.to || undefined, saleId: f.saleId || null, source: f.source || undefined,
    consumed: f.consumed === "" ? undefined : f.consumed === "co",
  };
  const q = useQuery(trpc.admissions.leads.distributionLog.queryOptions({ ...input, page }));
  const upd = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await qc.fetchQuery(trpc.admissions.leads.distributionLog.queryOptions({ ...input, all: true }));
      downloadCsv(`so-chia-lead-${all.from}-${all.to}`, ["Thời gian", "Lead", "SĐT", "Cơ sở", "Người nhập", "Chia cho", "Nguồn", "Tiêu lượt", "Lượt sau khi chia", "Ghi chú"],
        all.items.map((r) => [fmtDateTime(r.createdAt), r.parentName, r.phone, r.centerCode, r.creatorName, r.assigneeName, ASSIGNMENT_SOURCE_VI[r.source], r.consumedRound ? "Có" : "Không", r.roundsAfter, r.note]));
    } finally {
      setExporting(false);
    }
  };

  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Từ<input type="date" className="input mt-1" value={f.from} onChange={(e) => upd({ from: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Đến<input type="date" className="input mt-1" value={f.to} onChange={(e) => upd({ to: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Sale
          <select className="input mt-1" value={f.saleId} onChange={(e) => upd({ saleId: e.target.value })}>
            <option value="">Tất cả</option>
            {sales.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Nguồn
          <select className="input mt-1" value={f.source} onChange={(e) => upd({ source: e.target.value as "" | AssignmentSource })}>
            <option value="">Tất cả</option>
            {ASSIGNMENT_SOURCES.map((s) => <option key={s} value={s}>{ASSIGNMENT_SOURCE_VI[s]}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Tiêu lượt
          <select className="input mt-1" value={f.consumed} onChange={(e) => upd({ consumed: e.target.value as "" | "co" | "khong" })}>
            <option value="">Tất cả</option>
            <option value="co">Có</option>
            <option value="khong">Không</option>
          </select>
        </label>
        <button type="button" className="btn-ghost ml-auto text-xs" disabled={exporting || !d?.total} onClick={exportAll}>{exporting ? "Đang xuất…" : "Xuất Excel (CSV)"}</button>
      </div>
      {q.isLoading ? <div className="card p-6 text-sm text-ink-400">Đang tải…</div> : q.error ? <div className="card p-6 text-sm text-red-700">{q.error.message}</div> : d && (
        <>
          <div className="text-xs text-ink-600">{d.total} lần chia · {d.consumedCount} lần tiêu lượt · {d.from.split("-").reverse().join("/")} → {d.to.split("-").reverse().join("/")}</div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-2">Thời gian</th><th className="p-2">Lead</th><th className="p-2">SĐT</th><th className="p-2">Cơ sở</th><th className="p-2">Người nhập</th><th className="p-2">Chia cho</th><th className="p-2">Nguồn</th><th className="p-2">Tiêu lượt</th><th className="p-2">Lượt sau khi chia</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap p-2 text-xs">{fmtDateTime(r.createdAt)}</td>
                    <td className="p-2"><Link href={`/leads/${r.leadId}`} className="text-brand-700">{r.parentName}</Link>{r.note && <div className="text-[11px] text-ink-400">{r.note}</div>}</td>
                    <td className="p-2 font-mono text-xs">{r.phone}</td>
                    <td className="p-2">{r.centerCode ?? "—"}</td>
                    <td className="p-2">{r.creatorName ?? "Form / hệ thống"}</td>
                    <td className="p-2">{r.assigneeName ?? "—"}</td>
                    <td className="p-2"><span className={`chip ${r.source === "auto" ? "bg-brand-100 text-brand-700" : "bg-black/5"}`}>{ASSIGNMENT_SOURCE_VI[r.source]}</span></td>
                    <td className="p-2">{r.consumedRound ? <span className="font-semibold text-green-700">Có</span> : <span className="text-ink-400">Không</span>}</td>
                    <td className="p-2 font-mono">{r.roundsAfter ?? "—"}</td>
                  </tr>
                ))}
                {d.items.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-ink-400">Không có lần chia nào trong khoảng này.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 text-sm">
            <button type="button" className="btn-ghost !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
            <span>Trang {page}/{pages}</span>
            <button type="button" className="btn-ghost !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau →</button>
          </div>
        </>
      )}
    </div>
  );
}
