"use client";

import { SECTION_DEFS, validImage, validUrl, type LField, type LandingSection } from "@satarobo/core";
import { ImageUpload } from "@/components/image-upload";

/** Một ô nhập theo định nghĩa trường (chữ, đoạn, liên kết, ảnh) — kiểm tra nhanh ngay tại chỗ, kiểm tra đủ khi Xuất bản */
export function FieldInput({ f, value, onChange, disabled }: { f: LField; value: string; onChange: (v: string) => void; disabled: boolean }) {
  if (f.type === "image") {
    if (disabled) return <div className="text-sm">{f.label}{value ? <img src={value} alt="" className="mt-1 max-h-24 rounded" /> : <span className="text-ink-600"> — chưa có</span>}</div>;
    return <ImageUpload label={`${f.label}${f.required ? " *" : ""}`} value={value} onChange={onChange} />;
  }
  const bad = value && ((f.type === "url" && !validUrl(value)) || (f.type === "image" && !validImage(value)));
  return (
    <label className="block text-sm">
      <span className="font-medium">{f.label}{f.required && <span className="text-red-700"> *</span>}</span>{" "}
      <span className="text-xs text-ink-600">({value.length}/{f.max})</span>
      {f.type === "textarea"
        ? <textarea className="input mt-1" rows={f.max > 1000 ? 8 : 3} maxLength={f.max} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        : <input className={`input mt-1 ${bad ? "!border-red-500" : ""}`} maxLength={f.max} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
            placeholder={f.type === "url" ? "https://… · /dang-ky · #mốc · tel:09…" : ""} inputMode={f.type === "url" ? "url" : undefined} />}
      {f.hint && <span className="mt-0.5 block text-xs text-ink-600">{f.hint}</span>}
      {bad && <span className="mt-0.5 block text-xs text-red-700">Liên kết chỉ nhận https://, đường dẫn /…, #mốc, tel:, mailto:</span>}
    </label>
  );
}

/** Form của một khối: các trường + từng danh sách (thêm / xoá / đổi thứ tự dòng) */
export function SectionForm({ section, onChange, disabled }: { section: LandingSection; onChange: (s: LandingSection) => void; disabled: boolean }) {
  const def = SECTION_DEFS[section.type];
  const setField = (k: string, v: string) => onChange({ ...section, data: { ...section.data, [k]: v } });
  const setRows = (k: string, rows: Record<string, string>[]) => onChange({ ...section, lists: { ...section.lists, [k]: rows } });
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{def.label}</h3>
        <p className="text-xs text-ink-600">{def.desc}</p>
      </div>
      {def.fields.map((f) => (
        <FieldInput key={f.key} f={f} value={section.data[f.key] ?? ""} disabled={disabled} onChange={(v) => setField(f.key, v)} />
      ))}
      {def.lists.map((l) => {
        const rows = section.lists[l.key] ?? [];
        const move = (i: number, d: -1 | 1) => {
          const j = i + d;
          if (j < 0 || j >= rows.length) return;
          const next = rows.slice();
          [next[i], next[j]] = [next[j]!, next[i]!];
          setRows(l.key, next);
        };
        return (
          <fieldset key={l.key} className="space-y-3 rounded-xl border border-black/10 p-3">
            <legend className="px-1 text-sm font-semibold">{l.label} <span className="text-xs font-normal text-ink-600">({rows.length}/{l.max})</span></legend>
            {l.hint && <p className="text-xs text-ink-600">{l.hint}</p>}
            {rows.map((row, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-black/[0.03] p-3">
                <div className="flex items-center justify-between text-xs text-ink-600">
                  <span>#{i + 1}</span>
                  {!disabled && (
                    <span className="flex gap-1">
                      <button type="button" className="btn-ghost !px-2 !py-0.5" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                      <button type="button" className="btn-ghost !px-2 !py-0.5" aria-label="Xuống" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>▼</button>
                      <button type="button" className="btn-ghost !px-2 !py-0.5 text-red-700" aria-label="Xoá dòng" onClick={() => setRows(l.key, rows.filter((_, x) => x !== i))}>Xoá</button>
                    </span>
                  )}
                </div>
                {l.fields.map((f) => (
                  <FieldInput key={f.key} f={f} value={row[f.key] ?? ""} disabled={disabled} onChange={(v) => setRows(l.key, rows.map((r, x) => (x === i ? { ...r, [f.key]: v } : r)))} />
                ))}
              </div>
            ))}
            {!disabled && rows.length < l.max && (
              <button type="button" className="btn-ghost !py-1.5 text-sm" onClick={() => setRows(l.key, [...rows, Object.fromEntries(l.fields.map((f) => [f.key, ""]))])}>+ {l.addLabel}</button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
