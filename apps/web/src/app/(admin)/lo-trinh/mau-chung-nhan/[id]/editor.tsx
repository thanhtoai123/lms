"use client";

/**
 * TRÌNH DỰNG MẪU GIẤY CHỨNG NHẬN — kéo-thả bằng Pointer Events thuần React (không thư viện).
 *
 *  - Ảnh nền hiển thị đúng tỷ lệ A4; các ô trường đặt lên ảnh: kéo thân ô để di chuyển, kéo tay nắm góc
 *    phải-dưới để đổi rộng (QR giữ hình vuông). Phím mũi tên dịch 0,25 % (giữ Shift: 1 %).
 *  - Bảng thuộc tính: cỡ chữ (pt khi in A4), đậm, nghiêng, màu, căn lề, IN HOA, phông (chỉ Be Vietnam Pro
 *    đã có trong dự án và phông hệ thống — không nạp phông ngoài vì CSP), chữ đứng trước, nội dung (người ký…).
 *  - Toạ độ lưu theo % khung → in đúng ở mọi độ phân giải.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Eye, Italic, Move, Upload } from "lucide-react";
import {
  CERTIFICATE_FIELD_VI, TEMPLATE_FONT_VI, TEMPLATE_FONTS, TEMPLATE_TEXT_FIELDS, ISSUED_DATE_FORMAT_VI, TEMPLATE_ORIENTATION_VI,
  recommendedPixels, sampleCertificateSnapshot, validateTemplateFields,
  type TemplateField, type TemplateAlign, type TemplateFont, type IssuedDateFormat, type TemplateOrientation,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ErrorBox, OkBox } from "@/components/admin-ui";
import { CertificateSheet } from "@/components/certificates/certificate-sheet";

type Template = RouterOutputs["certificates"]["templates"]["get"];
type Drag = { key: TemplateField["key"]; mode: "move" | "resize"; startX: number; startY: number; orig: TemplateField; rectW: number; rectH: number; pointerId: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function TemplateEditor({ template, canManage }: { template: Template; canManage: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [orientation, setOrientation] = useState<TemplateOrientation>(template.orientation);
  const [fields, setFields] = useState<TemplateField[]>(template.fields);
  const [bg, setBg] = useState<{ url: string | null; w: number | null; h: number | null }>({ url: template.backgroundUrl, w: template.widthPx, h: template.heightPx });
  const [isActive, setIsActive] = useState(template.isActive);
  const [selected, setSelected] = useState<TemplateField["key"] | null>("studentName");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const sample = useMemo(() => sampleCertificateSnapshot(fields), [fields]);
  const errors = useMemo(() => validateTemplateFields(fields), [fields]);
  const sel = fields.find((f) => f.key === selected) ?? null;

  const patch = useCallback((key: TemplateField["key"], p: Partial<TemplateField>) => {
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
    setDirty(true);
  }, []);

  const save = useMutation(trpc.certificates.templates.update.mutationOptions({
    onSuccess: (t) => { setFields(t.fields); setDirty(false); setMsg({ ok: true, text: "Đã lưu mẫu." }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));

  /* ---------------- Kéo-thả bằng Pointer Events ---------------- */
  const onPointerDown = (e: React.PointerEvent, f: TemplateField, mode: "move" | "resize") => {
    if (!canManage || preview) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelected(f.key);
    dragRef.current = { key: f.key, mode, startX: e.clientX, startY: e.clientY, orig: f, rectW: rect.width, rectH: rect.height, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = ((e.clientX - d.startX) / d.rectW) * 100;
    const dy = ((e.clientY - d.startY) / d.rectH) * 100;
    const o = d.orig;
    if (d.mode === "move") {
      patch(d.key, { x: r2(clamp(o.x + dx, 0, 100 - o.w)), y: r2(clamp(o.y + dy, 0, 99)) });
    } else {
      const w = r2(clamp(o.w + dx, 2, 100 - o.x));
      // QR vuông: cạnh theo % chiều rộng; ô chữ: đổi cả chiều cao khung
      patch(d.key, o.key === "qr" ? { w, h: w } : { w, h: r2(clamp(o.h + dy, 1, 100 - o.y)) });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* đã nhả */ }
    dragRef.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sel || !canManage || preview) return;
    const step = e.shiftKey ? 1 : 0.25;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = map[e.key];
    if (!mv) return;
    e.preventDefault();
    patch(sel.key, { x: r2(clamp(sel.x + mv[0], 0, 100 - sel.w)), y: r2(clamp(sel.y + mv[1], 0, 99)) });
  };

  /* ---------------- Tải ảnh nền ---------------- */
  const upload = async (file: File) => {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("templateId", template.id);
      fd.append("file", file);
      const res = await fetch("/api/chung-nhan/nen", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({ ok: false, error: "Máy chủ không phản hồi" }))) as { ok: boolean; error?: string; warnings?: string[]; template?: { backgroundUrl: string | null; widthPx: number | null; heightPx: number | null } };
      if (!j.ok || !j.template) { setMsg({ ok: false, text: j.error ?? "Tải ảnh thất bại" }); return; }
      setBg({ url: j.template.backgroundUrl, w: j.template.widthPx, h: j.template.heightPx });
      setMsg({ ok: !(j.warnings?.length), text: j.warnings?.length ? `Đã tải ảnh nền. Lưu ý: ${j.warnings.join("; ")}` : "Đã tải ảnh nền." });
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  const rec = recommendedPixels(orientation);
  const doSave = () => {
    setMsg(null);
    save.mutate({ id: template.id, name, orientation, fields, isActive });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------ Khung dựng ------------------ */}
      <div className="space-y-3">
        <div className="card flex flex-wrap items-end gap-3 p-3">
          <label className="block min-w-48 flex-1">
            <span className="label">Tên mẫu</span>
            <input className="input" value={name} disabled={!canManage} maxLength={120} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          </label>
          <label className="block">
            <span className="label">Hướng giấy</span>
            <select className="input" value={orientation} disabled={!canManage} onChange={(e) => { setOrientation(e.target.value === "portrait" ? "portrait" : "landscape"); setDirty(true); }}>
              {(["landscape", "portrait"] as const).map((o) => <option key={o} value={o}>{TEMPLATE_ORIENTATION_VI[o]}</option>)}
            </select>
          </label>
          {canManage && (
            <label className={`btn-ghost cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              <Upload className="h-4 w-4" aria-hidden /> {uploading ? "Đang tải…" : "Tải ảnh nền (PNG/JPG)"}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </label>
          )}
          <button className={`btn-ghost ${preview ? "!border-primary !text-primary" : ""}`} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? <Move className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} {preview ? "Quay lại sắp xếp" : "Xem thử với dữ liệu mẫu"}
          </button>
          {canManage && (
            <button className="btn-primary" disabled={save.isPending || errors.length > 0 || !dirty} onClick={doSave}>
              {save.isPending ? "Đang lưu…" : dirty ? "Lưu mẫu" : "Đã lưu"}
            </button>
          )}
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Canva: khổ {orientation === "landscape" ? "A4 ngang 297 × 210 mm" : "A4 dọc 210 × 297 mm"} (khuyến nghị {rec.width} × {rec.height} px), <b>để trống</b> chỗ tên học viên, tên lộ trình,
          ngày, số chứng nhận, mã QR; xuất <b>PNG</b> chất lượng cao rồi tải lên.
          {bg.w && bg.h ? <> Ảnh hiện tại: {bg.w} × {bg.h} px.</> : null}
        </p>
        {msg && (msg.ok ? <OkBox>{msg.text}</OkBox> : <ErrorBox>{msg.text}</ErrorBox>)}

        <div className="card overflow-x-auto bg-muted/40 p-3 sm:p-5">
          <div
            ref={frameRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className={`relative mx-auto touch-none select-none shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-primary ${orientation === "landscape" ? "min-w-[36rem] max-w-5xl" : "min-w-[24rem] max-w-2xl"}`}
            aria-label="Khung dựng giấy chứng nhận — chọn một ô rồi dùng phím mũi tên để dịch"
          >
            <CertificateSheet
              template={{ orientation, backgroundUrl: bg.url, fields }}
              snapshot={sample}
              qrSvg={preview ? template.sampleQrSvg : null}
            >
              {!preview && fields.filter((f) => f.enabled).map((f) => {
                const active = f.key === selected;
                return (
                  <div
                    key={f.key}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${CERTIFICATE_FIELD_VI[f.key]} — kéo để di chuyển`}
                    onPointerDown={(e) => onPointerDown(e, f, "move")}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={() => setSelected(f.key)}
                    className={`absolute rounded-sm border ${active ? "z-20 border-2 border-primary bg-primary/10" : "z-10 border-dashed border-primary/60 hover:bg-primary/5"} ${canManage ? "cursor-move" : "cursor-pointer"}`}
                    style={f.key === "qr"
                      ? { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, aspectRatio: "1 / 1" }
                      : { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
                  >
                    <span className={`pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-semibold ${active ? "bg-primary text-white" : "bg-white/90 text-primary"}`}>
                      {CERTIFICATE_FIELD_VI[f.key]}
                    </span>
                    {canManage && (
                      <span
                        aria-hidden
                        onPointerDown={(e) => onPointerDown(e, f, "resize")}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary"
                      />
                    )}
                  </div>
                );
              })}
            </CertificateSheet>
          </div>
        </div>
        {errors.length > 0 && <ErrorBox>{errors.slice(0, 4).join(" · ")}</ErrorBox>}
      </div>

      {/* ------------------ Bảng thuộc tính ------------------ */}
      <aside className="space-y-3">
        <div className="card p-3">
          <h2 className="mb-2 text-sm font-bold">Các trường</h2>
          <ul className="space-y-1">
            {fields.map((f) => (
              <li key={f.key} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${f.key === selected ? "bg-brand-50" : ""}`}>
                <input type="checkbox" aria-label={`Hiện ${CERTIFICATE_FIELD_VI[f.key]}`} checked={f.enabled} disabled={!canManage} onChange={(e) => patch(f.key, { enabled: e.target.checked })} />
                <button className="flex-1 text-left" onClick={() => setSelected(f.key)}>{CERTIFICATE_FIELD_VI[f.key]}</button>
              </li>
            ))}
          </ul>
        </div>

        {sel && (
          <div className="card space-y-3 p-3">
            <h2 className="text-sm font-bold">{CERTIFICATE_FIELD_VI[sel.key]}</h2>
            <fieldset disabled={!canManage} className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="label !normal-case">{k === "x" ? "Trái %" : k === "y" ? "Trên %" : k === "w" ? "Rộng %" : "Cao %"}</span>
                    <input
                      type="number" step={0.25} min={0} max={100} className="input !px-2 text-xs" value={sel[k]}
                      disabled={k === "h" && sel.key === "qr"}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        patch(sel.key, sel.key === "qr" && k === "w" ? { w: n, h: n } : { [k]: n } as Partial<TemplateField>);
                      }}
                    />
                  </label>
                ))}
              </div>

              {sel.key !== "qr" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="label !normal-case">Cỡ chữ (pt)</span>
                      <input type="number" min={6} max={144} step={0.5} className="input" value={sel.fontSize} onChange={(e) => patch(sel.key, { fontSize: Number(e.target.value) || 6 })} />
                    </label>
                    <label className="block">
                      <span className="label !normal-case">Màu</span>
                      <input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card" value={sel.color} onChange={(e) => patch(sel.key, { color: e.target.value })} />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Toggle on={sel.bold} label="Đậm" onClick={() => patch(sel.key, { bold: !sel.bold })}><Bold className="h-4 w-4" /></Toggle>
                    <Toggle on={sel.italic} label="Nghiêng" onClick={() => patch(sel.key, { italic: !sel.italic })}><Italic className="h-4 w-4" /></Toggle>
                    <Toggle on={sel.uppercase} label="IN HOA" onClick={() => patch(sel.key, { uppercase: !sel.uppercase })}><CaseUpper className="h-4 w-4" /></Toggle>
                    <span className="mx-1 w-px bg-border" aria-hidden />
                    {(["left", "center", "right"] as TemplateAlign[]).map((a) => (
                      <Toggle key={a} on={sel.align === a} label={a === "left" ? "Căn trái" : a === "center" ? "Căn giữa" : "Căn phải"} onClick={() => patch(sel.key, { align: a })}>
                        {a === "left" ? <AlignLeft className="h-4 w-4" /> : a === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
                      </Toggle>
                    ))}
                  </div>
                  <label className="block">
                    <span className="label !normal-case">Phông chữ</span>
                    <select className="input" value={sel.font} onChange={(e) => patch(sel.key, { font: e.target.value as TemplateFont })}>
                      {TEMPLATE_FONTS.map((f) => <option key={f} value={f}>{TEMPLATE_FONT_VI[f]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label !normal-case">Chữ đứng trước (tuỳ chọn)</span>
                    <input className="input" maxLength={40} value={sel.prefix ?? ""} placeholder={sel.key === "certificateNo" ? "Số: " : sel.key === "grade" ? "Xếp loại: " : ""} onChange={(e) => patch(sel.key, { prefix: e.target.value })} />
                  </label>
                </>
              )}

              {sel.key === "issuedDate" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label !normal-case">Định dạng ngày</span>
                    <select className="input" value={sel.dateFormat ?? "long"} onChange={(e) => patch(sel.key, { dateFormat: e.target.value === "dmy" ? "dmy" : "long" as IssuedDateFormat })}>
                      {(["long", "dmy"] as const).map((f) => <option key={f} value={f}>{ISSUED_DATE_FORMAT_VI[f]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label !normal-case">Địa danh</span>
                    <input className="input" maxLength={60} value={sel.place ?? ""} placeholder="Đà Nẵng" onChange={(e) => patch(sel.key, { place: e.target.value })} />
                  </label>
                </div>
              )}

              {TEMPLATE_TEXT_FIELDS.includes(sel.key) && (
                <label className="block">
                  <span className="label !normal-case">{sel.key === "signerName" ? "Họ tên người ký" : sel.key === "signerTitle" ? "Chức danh người ký" : "Nội dung dòng chữ"}</span>
                  <textarea className="input min-h-16" maxLength={300} value={sel.text ?? ""} onChange={(e) => patch(sel.key, { text: e.target.value })} />
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">Chụp vào từng giấy lúc cấp — đổi ở đây không làm thay đổi giấy đã cấp.</span>
                </label>
              )}
              {sel.key === "qr" && (
                <p className="text-xs text-muted-foreground">Mã QR trỏ tới trang xác thực công khai của từng giấy. Nên để cạnh tối thiểu ~2,5 cm khi in (≈ 8,5 % bề rộng khổ ngang).</p>
              )}
            </fieldset>
          </div>
        )}

        {canManage && (
          <div className="card p-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} disabled={template.isDefault} onChange={(e) => { setIsActive(e.target.checked); setDirty(true); }} />
              Đang dùng {template.isDefault && <span className="text-xs text-muted-foreground">(mẫu mặc định luôn dùng)</span>}
            </label>
          </div>
        )}
      </aside>
    </div>
  );
}

function Toggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} title={label} aria-label={label} onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${on ? "border-primary bg-primary text-white" : "border-border bg-card text-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );
}
