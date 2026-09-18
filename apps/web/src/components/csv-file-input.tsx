"use client";

import { useRef, useState } from "react";
import { isExcelFile, readWorkbook, sheetCsv, XlsxError, XLSX_ERR, downloadTemplateXlsx, type ReadWorkbook } from "./xlsx";

/**
 * Chọn file để nhập liệu: **.xlsx đọc thẳng** (như bản gốc), CSV, hoặc dán tay.
 * File nhiều sheet thì hiện ô chọn sheet (mỗi sheet = một tháng × cơ sở ở màn nhập giao dịch cũ).
 */
export function CsvFileInput({ onText, disabled, template }: {
  onText: (text: string, fileName: string | null) => void;
  disabled?: boolean;
  /** Bật nút "Tải file mẫu" sinh .xlsx đúng cột của màn này */
  template?: { fileName: string; headers: readonly string[]; sample?: readonly (readonly (string | number)[])[]; sheetName?: string };
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wb, setWb] = useState<{ book: ReadWorkbook; fileName: string; picked: string } | null>(null);

  const pick = async (f: File | undefined) => {
    setErr(null);
    setWb(null);
    if (!f) return;
    if (f.size > 10_000_000) return setErr("File lớn hơn 10MB — chia nhỏ file");
    if (isExcelFile(f)) {
      setBusy(true);
      try {
        const book = await readWorkbook(f);
        const withData = book.sheets.filter((s) => s.rows >= 1);
        if (withData.length > 1) {
          // Nhiều sheet → để người dùng chọn, nạp sẵn sheet đầu có dữ liệu
          setWb({ book, fileName: f.name, picked: book.first.name });
          onText(book.first.csv, `${f.name} — ${book.first.name}`);
        } else {
          onText(book.first.csv, f.name);
        }
      } catch (e) {
        setErr(e instanceof XlsxError ? e.message : XLSX_ERR.cannotOpen);
      } finally {
        setBusy(false);
        if (ref.current) ref.current.value = "";
      }
      return;
    }
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1258").decode(buf);
    onText(text, f.name);
    if (ref.current) ref.current.value = "";
  };

  const chooseSheet = (name: string) => {
    if (!wb) return;
    try {
      setErr(null);
      setWb({ ...wb, picked: name });
      onText(sheetCsv(wb.book, name), `${wb.fileName} — ${name}`);
    } catch (e) {
      setErr(e instanceof XlsxError ? e.message : XLSX_ERR.emptySheet);
    }
  };

  const getTemplate = async () => {
    if (!template) return;
    setErr(null);
    setBusy(true);
    try {
      await downloadTemplateXlsx(template);
    } catch {
      setErr("Không tạo được file mẫu — thử lại hoặc dùng luồng dán tay");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={ref} type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt,text/csv" disabled={disabled || busy} className="text-sm" onChange={(e) => pick(e.target.files?.[0])} />
        {template && <button type="button" className="btn-ghost !py-1 text-xs" disabled={disabled || busy} onClick={getTemplate}>Tải file mẫu</button>}
        <button type="button" className="text-xs text-brand-600" onClick={() => setPaste((v) => !v)}>{paste ? "Ẩn ô dán" : "…hoặc dán nội dung"}</button>
      </div>
      <p className="text-[11px] text-ink-400">Chọn thẳng file Excel (.xlsx) — không cần lưu thành CSV nữa. Vẫn nhận CSV và dán tay từ Excel.</p>
      {busy && <div className="text-xs text-ink-400">Đang đọc file…</div>}
      {wb && wb.book.sheets.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
          File có {wb.book.sheets.length} sheet — chọn sheet cần nhập
          <select className="input !w-auto !py-1 text-xs" value={wb.picked} onChange={(e) => chooseSheet(e.target.value)} disabled={disabled || busy}>
            {wb.book.sheets.map((s) => <option key={s.name} value={s.name} disabled={s.rows === 0}>{s.name}{s.rows ? ` (${s.rows} dòng)` : " — trống"}</option>)}
          </select>
        </label>
      )}
      {paste && (
        <div className="space-y-1">
          <textarea className="input h-32 font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Dán dữ liệu có dòng tiêu đề (phân cách bằng dấu phẩy, chấm phẩy hoặc tab — dán thẳng từ Excel được)" />
          <button type="button" className="btn-ghost !py-1 text-xs" disabled={disabled || !raw.trim()} onClick={() => onText(raw, null)}>Dùng nội dung đã dán</button>
        </div>
      )}
      {err && <div className="text-sm text-red-700">{err}</div>}
    </div>
  );
}
