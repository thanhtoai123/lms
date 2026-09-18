"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Cell = string | number | null | undefined;
type ExportResult = { headers: string[]; rows: Cell[][]; total: number; truncated: boolean; limit: number; piiMasked: boolean };

function toCsv(headers: string[], rows: Cell[][]) {
  const cell = (v: Cell) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Chặn công thức khi mở bằng Excel
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/**
 * "Xuất CSV (toàn bộ kết quả lọc)" — gọi thủ tục xuất phía máy chủ theo ĐÚNG bộ lọc đang xem,
 * không chỉ trang hiện tại. Máy chủ trả tối đa 10.000 dòng và tự che SĐT theo quyền.
 */
export function ExportAllButton({ filename, filters, kind, label = "Xuất CSV (toàn bộ kết quả lọc)" }: {
  filename: string;
  /** Bộ lọc y hệt màn hình đang xem */
  filters: Record<string, unknown>;
  kind: "leads" | "students";
  label?: string;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const d = (kind === "leads"
        ? await qc.fetchQuery(trpc.admissions.leads.exportRows.queryOptions(filters as never))
        : await qc.fetchQuery(trpc.students.exportRows.queryOptions(filters as never))) as ExportResult;
      const text = toCsv(d.headers, d.rows);
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(
        d.truncated
          ? `Đã xuất ${d.rows.length}/${d.total} dòng — vượt trần ${d.limit.toLocaleString("vi-VN")} dòng, hãy thu hẹp bộ lọc để lấy đủ.`
          : `Đã xuất ${d.rows.length} dòng${d.piiMasked ? " (SĐT che theo quyền của bạn)" : ""}.`,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={run}>{busy ? "Đang xuất…" : label}</button>
      {msg && <span className="text-[11px] text-green-700">{msg}</span>}
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </span>
  );
}
