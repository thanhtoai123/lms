"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { parseLeadImportTable, LEAD_IMPORT_TEMPLATE, LEAD_REGISTERED_TEMPLATE, LEAD_IMPORT_MAX_ROWS, type RawLeadImportRow } from "@satarobo/core";
import { CsvFileInput } from "@/components/csv-file-input";
import { downloadCsv } from "@/lib/download-csv";

type Mode = "leads" | "registered";
type PreviewRow = {
  line: number; group: "new" | "dup" | "error"; firstLine: number | null; errors: string[]; messages: string[];
  centerCode: string | null; courseCode: string | null; saleName: string | null; paid: number | null; dueDate2: string | null; registeredAt: string | null;
  existing: { id: string; parentName: string; statusLabel: string; phone: string } | null;
};
type CommitResult = { lines: number[]; ok: boolean; kind: "created" | "merged" | "failed"; message: string; leadId: string | null };

const GROUP_VI = { new: "Mới", dup: "Trùng", error: "Lỗi" } as const;
const CHUNK = 200;
const FIELDS: { key: keyof RawLeadImportRow; label: string; registeredOnly?: boolean }[] = [
  { key: "parentName", label: "Tên phụ huynh" }, { key: "phone", label: "SĐT" }, { key: "email", label: "Email" }, { key: "childName", label: "Tên con" },
  { key: "childAge", label: "Tuổi con" }, { key: "centerCode", label: "Cơ sở" }, { key: "course", label: "Khoá quan tâm" }, { key: "source", label: "Nguồn" },
  { key: "notes", label: "Ghi chú" }, { key: "sale", label: "Sale phụ trách" },
  { key: "paid", label: "Đã đóng", registeredOnly: true }, { key: "dueDate2", label: "Hạn đợt 2", registeredOnly: true }, { key: "registeredAt", label: "Ngày đăng ký", registeredOnly: true },
];

/** Nhập lead từ file: đọc ngay trên trình duyệt (CSV / dán từ Excel), xem 3 nhóm Mới / Trùng / Lỗi rồi mới ghi */
export function LeadImporter({ mode, canOverwrite = false }: {
  mode: Mode;
  /** Có quyền lead:overwrite không — không có thì ẩn hẳn ô "Đè", máy chủ cũng từ chối */
  canOverwrite?: boolean;
}) {
  const trpc = useTRPC();
  const [rows, setRows] = useState<RawLeadImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ total: number; counts: { new: number; dup: number; error: number }; willWrite: number; rows: PreviewRow[] } | null>(null);
  const [overwrite, setOverwrite] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"all" | "new" | "dup" | "error">("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState(mode === "registered" ? "Nhập khách đã đăng ký" : "Nhập lead từ file");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<CommitResult[] | null>(null);
  const [summary, setSummary] = useState<{ created: number; merged: number; failed: number; skipped: number } | null>(null);

  const prev = useMutation(trpc.admissions.leads.importPreview.mutationOptions({ onSuccess: (r) => { setPreview(r as typeof preview); setError(null); }, onError: (e) => setError(e.message) }));
  const commit = useMutation(trpc.admissions.leads.importCommit.mutationOptions({}));
  const busy = prev.isPending || commit.isPending;
  const template = mode === "registered" ? LEAD_REGISTERED_TEMPLATE : LEAD_IMPORT_TEMPLATE;

  const runPreview = (next: RawLeadImportRow[]) => { setResults(null); setSummary(null); if (next.length) prev.mutate({ rows: next, mode }); else setPreview(null); };

  const onText = (text: string, name: string | null) => {
    const parsed = parseLeadImportTable(text);
    setHeaderErrors(parsed.headerErrors);
    if (parsed.headerErrors.length) return;
    const offset = rows.length ? Math.max(...rows.map((r) => r.line)) : 1;
    const added = rows.length ? parsed.rows.map((r, i) => ({ ...r, line: offset + i + 1 })) : parsed.rows;
    const next = [...rows, ...added].slice(0, LEAD_IMPORT_MAX_ROWS);
    setFileName(name ?? fileName);
    setRows(next);
    runPreview(next);
  };

  const patchRow = (line: number, patch: Partial<RawLeadImportRow>) => {
    const next = rows.map((r) => (r.line === line ? { ...r, ...patch } : r));
    setRows(next);
  };
  const dropRow = (line: number) => { const next = rows.filter((r) => r.line !== line); setRows(next); setEditing(null); runPreview(next); };

  const commitAll = async () => {
    setError(null);
    setProgress("Đang ghi…");
    const valid = preview ? new Set(preview.rows.filter((r) => r.group !== "error").map((r) => r.line)) : new Set<number>();
    const send = rows.filter((r) => valid.has(r.line));
    const all: CommitResult[] = [];
    let batchId: string | null = null;
    let created = 0, merged = 0, failed = 0, skipped = 0;
    try {
      for (let i = 0; i < send.length; i += CHUNK) {
        const chunk = send.slice(i, i + CHUNK);
        setProgress(`Đang ghi ${Math.min(i + CHUNK, send.length)}/${send.length} dòng…`);
        const r: { batchId: string | null; created: number; merged: number; failed: number; skipped: number; results: CommitResult[] } = await commit.mutateAsync({ rows: chunk, overwriteLines: [...overwrite], note: note.trim() || "Nhập lead từ file", mode, fileName, batchId });
        batchId = r.batchId;
        all.push(...(r.results as CommitResult[]));
        created += r.created; merged += r.merged; failed += r.failed; skipped += r.skipped;
      }
      setResults(all);
      setSummary({ created, merged, failed, skipped });
      setProgress(null);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  };

  const byLine = new Map((preview?.rows ?? []).map((p) => [p.line, p] as const));
  const shown = rows.filter((r) => filter === "all" || byLine.get(r.line)?.group === filter);
  const dupLines = (preview?.rows ?? []).filter((r) => r.group === "dup").map((r) => r.line);
  const allDupOverwritten = dupLines.length > 0 && dupLines.every((l) => overwrite.has(l));

  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-4 text-sm">
        <h2 className="font-semibold">1. Chọn dữ liệu</h2>
        <p className="text-ink-600">
          Chọn thẳng <b>file Excel (.xlsx)</b> — file nhiều sheet thì chọn sheet cần nhập. Vẫn nhận CSV UTF-8, hoặc bôi đen vùng dữ liệu trong Excel rồi <b>dán thẳng</b> vào ô bên dưới (dán lần nào nối thêm lần đó).
          Dữ liệu được đọc ngay trên máy bạn; tối đa {LEAD_IMPORT_MAX_ROWS} dòng.
        </p>
        <CsvFileInput
          onText={onText}
          disabled={busy}
          template={{ fileName: mode === "registered" ? "mau-khach-da-dang-ky" : "mau-lead", headers: template, sheetName: mode === "registered" ? "Khách đã đăng ký" : "Lead" }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => downloadCsv(mode === "registered" ? "mau-khach-da-dang-ky" : "mau-nhap-lead", template, [template.map(() => "")])}>Tải file mẫu (CSV)</button>
          {rows.length > 0 && <button type="button" className="text-xs text-red-700" onClick={() => { setRows([]); setPreview(null); setOverwrite(new Set()); setResults(null); setSummary(null); }}>Xoá dữ liệu đang xem</button>}
          {fileName && <span className="text-xs text-ink-400">Tệp: {fileName}</span>}
        </div>
        <p className="text-xs text-ink-400">Cột cố định: {template.join(" | ")}. SĐT là căn cứ <b>duy nhất</b> để phát hiện trùng (mọi cách ghi +84 / 0 / khoảng trắng đều quy về một số).</p>
        {headerErrors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{headerErrors.join("; ")}</div>}
      </section>

      {preview && (
        <>
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-semibold">2. Xem trước ({preview.total} dòng)</h2>
            <div className="flex flex-wrap gap-2">
              {([["all", `Tất cả ${preview.total}`], ["new", `Mới ${preview.counts.new}`], ["dup", `Trùng ${preview.counts.dup}`], ["error", `Lỗi ${preview.counts.error}`]] as const).map(([k, label]) => (
                <button key={k} type="button" className={`chip cursor-pointer ${filter === k ? "bg-brand-500 text-white" : "bg-black/5"}`} onClick={() => setFilter(k)}>{label}</button>
              ))}
              {dupLines.length > 0 && canOverwrite && (
                <label className="ml-auto flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={allDupOverwritten} onChange={(e) => setOverwrite(e.target.checked ? new Set(dupLines) : new Set())} />
                  Đè cả nhóm trùng (lấy dữ liệu file thay dữ liệu cũ; giá trị cũ ghi vào ghi chú)
                </label>
              )}
            </div>
            <p className="text-xs text-ink-400">
              Dòng <b>Lỗi</b> sẽ KHÔNG được ghi (bấm Sửa để chữa ngay tại đây). Dòng <b>Trùng</b> mặc định <b>không ghi đè</b> — chỉ điền ô đang trống, thêm con mới, giá trị khác ghi vào ghi chú kèm ngày.
              Ô trống trong file không bao giờ xoá dữ liệu. Trạng thái phễu giữ nguyên.
              {!canOverwrite && <> Bạn <b>không có quyền đè</b> dữ liệu cũ (<code className="font-mono">lead:overwrite</code>) — mọi dòng trùng sẽ được gộp, không mất số liệu.</>}
            </p>
          </section>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr><th className="p-2">Dòng</th><th className="p-2">Tình trạng</th><th className="p-2">Phụ huynh / SĐT</th><th className="p-2">Con</th><th className="p-2">Cơ sở · khoá · sale</th><th className="p-2">Ghi chú xử lý</th><th className="p-2">Đè</th><th className="p-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {shown.map((r) => {
                  const p = byLine.get(r.line);
                  const res = results?.find((x) => x.lines.includes(r.line));
                  if (editing === r.line) {
                    return (
                      <tr key={r.line} className="bg-brand-50/40">
                        <td className="p-2 align-top">{r.line}</td>
                        <td colSpan={7} className="p-2">
                          <div className="grid gap-2 sm:grid-cols-4">
                            {FIELDS.filter((f) => mode === "registered" || !f.registeredOnly).map((f) => (
                              <label key={f.key} className="text-xs text-ink-600">{f.label}
                                <input className="input mt-1" value={r[f.key] as string} onChange={(e) => patchRow(r.line, { [f.key]: e.target.value } as Partial<RawLeadImportRow>)} />
                              </label>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button type="button" className="btn-primary !py-1 text-xs" onClick={() => { setEditing(null); runPreview(rows); }}>Xong</button>
                            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => dropRow(r.line)}>Xoá dòng</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.line} className={p?.group === "error" ? "bg-red-50/60" : p?.group === "dup" ? "bg-amber-50/40" : ""}>
                      <td className="p-2 text-xs text-ink-400">{r.line}</td>
                      <td className="p-2"><span className={`chip ${p?.group === "error" ? "bg-red-100 text-red-700" : p?.group === "dup" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{GROUP_VI[p?.group ?? "new"]}</span></td>
                      <td className="p-2"><div className="font-medium">{r.parentName || <span className="text-ink-400">(chưa có tên)</span>}</div><div className="font-mono text-[11px] text-ink-400">{r.phone}</div></td>
                      <td className="p-2 text-xs">{r.childName || "—"}{r.childAge ? ` · ${r.childAge} tuổi` : ""}</td>
                      <td className="p-2 text-xs">{[p?.centerCode ?? r.centerCode, p?.courseCode ?? r.course, p?.saleName ?? r.sale].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-2 text-xs">
                        {p?.errors.map((m) => <div key={m} className="text-red-700">{m}</div>)}
                        {p?.messages.map((m) => <div key={m} className="text-ink-600">{m}</div>)}
                        {p?.existing && <div className="text-ink-400">CRM: {p.existing.parentName} · {p.existing.statusLabel}</div>}
                        {res && <div className={res.ok ? "text-green-700" : "text-red-700"}>{res.message}</div>}
                      </td>
                      <td className="p-2 text-center">
                        {p?.group === "dup" && canOverwrite && (
                          <input type="checkbox" checked={overwrite.has(r.line)} title="Lấy dữ liệu file thay dữ liệu cũ" onChange={(e) => setOverwrite((s) => { const n = new Set(s); if (e.target.checked) n.add(r.line); else n.delete(r.line); return n; })} />
                        )}
                      </td>
                      <td className="p-2 text-right"><button type="button" className="text-xs text-brand-700" onClick={() => setEditing(r.line)}>Sửa</button></td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-400">Không có dòng nào trong nhóm này.</td></tr>}
              </tbody>
            </table>
          </div>

          <section className="card flex flex-wrap items-end gap-2 p-4">
            <label className="min-w-64 flex-1 text-xs text-ink-600">Ghi chú cho lượt nhập *
              <input className="input mt-1" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn-primary" disabled={busy || !!progress || preview.willWrite === 0 || note.trim().length < 3} onClick={commitAll}>
              {progress ?? `Nhập ${preview.willWrite} khách (${preview.total - preview.counts.error} dòng)`}
            </button>
          </section>
        </>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {summary && (
        <section className="card space-y-1 border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <div className="font-semibold">Đã ghi xong: {summary.created} khách mới · {summary.merged} khách trùng đã gộp · {summary.failed} lỗi · {summary.skipped} dòng bỏ qua.</div>
          <div className="flex flex-wrap gap-3">
            <Link href="/leads" className="underline">Xem danh sách lead →</Link>
            {mode === "registered" && <Link href="/leads/bulk-convert" className="underline">Chốt hàng loạt →</Link>}
          </div>
        </section>
      )}
    </div>
  );
}
