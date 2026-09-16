"use client";

/** Xuất bảng ra CSV (UTF-8 BOM, mở được bằng Excel) — dữ liệu đã có sẵn trên trang */
export function CsvButton({ filename, headers, rows, label = "Xuất CSV" }: { filename: string; headers: string[]; rows: (string | number | null | undefined)[][]; label?: string }) {
  const download = () => {
    const cell = (v: string | number | null | undefined) => {
      let s = v === null || v === undefined ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" className="btn-ghost !py-1.5 text-xs print:hidden" onClick={download} disabled={rows.length === 0}>
      {label}
    </button>
  );
}
