"use client";

import { useRef, useState } from "react";

/** Chọn file CSV (hoặc dán nội dung) → trả text. Excel: "Lưu thành → CSV UTF-8". */
export function CsvFileInput({ onText, disabled }: { onText: (text: string, fileName: string | null) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (f.size > 3_000_000) return setErr("File lớn hơn 3MB — chia nhỏ file");
    if (/\.xlsx?$/i.test(f.name)) return setErr("Đây là file Excel — mở bằng Excel rồi chọn Lưu thành → CSV UTF-8");
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1258").decode(buf);
    onText(text, f.name);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={ref} type="file" accept=".csv,.txt,text/csv" disabled={disabled} className="text-sm" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className="text-xs text-brand-600" onClick={() => setPaste((v) => !v)}>{paste ? "Ẩn ô dán" : "…hoặc dán nội dung"}</button>
      </div>
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
