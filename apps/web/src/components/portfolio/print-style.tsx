/**
 * CSS in của hồ sơ học tập. Chỉ render trên trang có hồ sơ / phiếu nên không ảnh hưởng trang khác.
 * (CSP của dự án cho phép style nội tuyến — xem packages/core/src/security/headers.ts; không có script.)
 *
 * - Hồ sơ: A4 dọc, lề 12mm, trang bìa trọn một trang, mỗi khoá sang trang mới, phiếu buổi 2 phiếu / trang,
 *   không cắt khối ngang trang, giữ màu nền, đánh số trang ở chân trang (trình duyệt hỗ trợ ô lề trang,
 *   vd Chrome 131+; không hỗ trợ thì bỏ qua).
 * - Một phiếu buổi: khổ A5. Một học bạ mốc: A4.
 */
export function PortfolioPrintStyle({ size = "A4" }: { size?: "A4" | "A5" }) {
  return <style dangerouslySetInnerHTML={{ __html: size === "A5" ? SHEET_CSS : DOC_CSS }} />;
}

const COMMON = `
@media print {
  html { background: #fff; }
  body { background: #fff !important; }
  .hs-doc, .hs-doc *, .hs-sheet, .hs-sheet *, .hs-milestone, .hs-milestone * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hs-avoid { break-inside: avoid; page-break-inside: avoid; }
  .hs-noprint { display: none !important; }
  img { max-height: 60mm; }
}`;

const DOC_CSS = `
@page { size: A4; margin: 12mm 12mm 14mm; @bottom-right { content: "Trang " counter(page) " / " counter(pages); font-size: 9px; color: #6c6c6c; } @bottom-left { content: "Sata Robo · Hồ sơ học tập"; font-size: 9px; color: #6c6c6c; } }
@page :first { margin: 0; @bottom-right { content: none; } @bottom-left { content: none; } }
@media print {
  html { font-size: 11px; }
  .hs-cover { min-height: 297mm; break-after: page; page-break-after: always; padding: 22mm 18mm !important; }
  .hs-break { break-before: page; page-break-before: always; }
  .hs-cover + .hs-break, .hs-cover + p + .hs-break { break-before: auto; page-break-before: auto; }
  .hs-course { break-before: page; page-break-before: always; }
  .hs-pair { break-before: page; page-break-before: always; break-inside: avoid; }
  .hs-pair .hs-sheet { max-height: 132mm; overflow: hidden; }
  .hs-milestone { break-inside: avoid; page-break-inside: avoid; }
}${COMMON}`;

const SHEET_CSS = `
@page { size: A5; margin: 8mm; }
@media print {
  html { font-size: 10px; }
}${COMMON}`;
