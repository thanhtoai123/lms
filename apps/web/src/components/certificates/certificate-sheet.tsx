/**
 * MỘT TRANG GIẤY CHỨNG NHẬN — dùng chung cho trình dựng mẫu (xem thử), trang in hàng loạt và trang chi tiết.
 *
 * Khung đặt `container-type: inline-size`: toạ độ ô trường theo % khung, cỡ chữ quy đổi từ pt (khi in A4)
 * sang `cqw` — nên chữ co giãn đúng tỷ lệ ở mọi độ rộng màn hình và khi in ra A4 (297 × 210 mm).
 * Không hook, không mã chỉ-máy-chủ → render được ở cả hai phía.
 * Mã QR là SVG do MÁY CHỦ sinh (bộ sinh QR thuần TypeScript trong @satarobo/core) — không nạp thư viện ngoài.
 */
import {
  certificateFieldText, fontSizeCqw, TEMPLATE_FONT_CSS,
  type CertificateSnapshot, type TemplateField, type TemplateOrientation,
} from "@satarobo/core";

export interface SheetTemplate {
  orientation: TemplateOrientation;
  backgroundUrl: string | null;
  fields: TemplateField[];
}

export function fieldStyle(f: TemplateField, orientation: TemplateOrientation): React.CSSProperties {
  return {
    position: "absolute",
    left: `${f.x}%`,
    top: `${f.y}%`,
    width: `${f.w}%`,
    fontSize: `${fontSizeCqw(f.fontSize, orientation)}cqw`,
    fontWeight: f.bold ? 700 : 400,
    fontStyle: f.italic ? "italic" : "normal",
    color: f.color,
    textAlign: f.align,
    fontFamily: TEMPLATE_FONT_CSS[f.font],
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  };
}

/** Ô QR vuông: cạnh = w% chiều rộng khung */
export function qrStyle(f: TemplateField): React.CSSProperties {
  return { position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, aspectRatio: "1 / 1" };
}

export function CertificateSheet({
  template, snapshot, qrSvg, revoked = false, className = "", children,
}: {
  template: SheetTemplate;
  snapshot: CertificateSnapshot;
  /** SVG mã QR (chuỗi) — null thì vẽ ô giữ chỗ */
  qrSvg: string | null;
  /** Đóng dấu "ĐÃ THU HỒI" chéo trang */
  revoked?: boolean;
  className?: string;
  /** Lớp phủ thêm (trình dựng dùng để vẽ khung kéo-thả) */
  children?: React.ReactNode;
}) {
  const o = template.orientation;
  return (
    <div
      className={`cn-sheet relative w-full overflow-hidden bg-white ${o === "landscape" ? "cn-landscape" : "cn-portrait"} ${className}`}
      style={{ aspectRatio: o === "landscape" ? "297 / 210" : "210 / 297", containerType: "inline-size" }}
    >
      {template.backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.backgroundUrl} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full select-none" style={{ objectFit: "fill" }} draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center border-4 border-dashed border-brand-200 bg-brand-50/50 text-center text-sm text-muted-foreground print:hidden">
          Chưa có ảnh nền — tải ảnh PNG thiết kế trên Canva
        </div>
      )}
      {template.fields.filter((f) => f.enabled).map((f) => {
        if (f.key === "qr") {
          return (
            <div key={f.key} style={qrStyle(f)} className="cn-qr">
              {qrSvg ? (
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <div className="flex h-full w-full items-center justify-center border border-dashed border-ink-400 bg-white/80 text-[1.2cqw] text-ink-600">QR</div>
              )}
            </div>
          );
        }
        const text = certificateFieldText(f, snapshot);
        if (!text) return null;
        return <div key={f.key} style={fieldStyle(f, o)}>{text}</div>;
      })}
      {revoked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-label="Đã thu hồi">
          <span className="-rotate-12 rounded-xl border-[0.6cqw] border-red-600 px-[3cqw] py-[1cqw] text-[7cqw] font-extrabold tracking-widest text-red-600/80">ĐÃ THU HỒI</span>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * CSS in: mỗi chứng nhận một trang A4 đúng hướng mẫu, lề 0, ảnh nền phủ kín, giữ màu.
 * Dùng trang có tên (`page: cn-landscape` / `cn-portrait`) để một lệnh in trộn được cả mẫu ngang và dọc.
 * (CSP cho phép style nội tuyến; không có script.)
 */
export function CertificatePrintStyle({ orientation }: { orientation: TemplateOrientation }) {
  const css = `
@page { size: A4 ${orientation}; margin: 0; }
@page cn-landscape { size: A4 landscape; margin: 0; }
@page cn-portrait { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  main#main, .cn-print-root { padding: 0 !important; margin: 0 !important; }
  .cn-print-root > * + * { margin-top: 0 !important; }
  .cn-noprint { display: none !important; }
  .cn-page { break-after: page; page-break-after: always; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; max-width: none !important; }
  .cn-page:last-child { break-after: auto; page-break-after: auto; }
  .cn-page-landscape { page: cn-landscape; width: 297mm; height: 210mm; }
  .cn-page-portrait { page: cn-portrait; width: 210mm; height: 297mm; }
  .cn-page .cn-sheet { width: 100% !important; height: 100% !important; }
  .cn-sheet, .cn-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
