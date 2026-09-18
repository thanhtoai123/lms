"use client";

/**
 * Đọc / sinh file .xlsx ngay trên trình duyệt.
 *
 * Thư viện `xlsx` được nạp bằng **import động** (`await import("xlsx")`) để không phình gói
 * của những trang không nhập liệu — chỉ khi người dùng thật sự chọn file Excel hoặc bấm
 * "Tải file mẫu" thì thư viện mới tải về.
 *
 * Câu chữ báo lỗi giữ nguyên bản gốc:
 *  · "File Excel không có sheet nào"
 *  · "File Excel rỗng hoặc sai format"
 *  · "Không mở được file. File có phải .xlsx không?"
 */

export const XLSX_ERR = {
  noSheet: "File Excel không có sheet nào",
  emptySheet: "File Excel rỗng hoặc sai format",
  cannotOpen: "Không mở được file. File có phải .xlsx không?",
} as const;

export const EXCEL_EXT_RE = /\.(xlsx|xlsm|xlsb|xls)$/i;
export function isExcelFile(f: { name: string }): boolean {
  return EXCEL_EXT_RE.test(f.name);
}

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

type Sheet = { name: string; csv: string; rows: number };

/** Sổ làm việc đã đọc: tên các sheet + nội dung từng sheet dưới dạng CSV để dùng lại luồng CSV sẵn có */
export interface ReadWorkbook {
  sheets: Sheet[];
  /** Sheet đầu tiên có dữ liệu */
  first: Sheet;
}

/**
 * Đọc .xlsx → CSV cho từng sheet. Ném XlsxError với đúng câu chữ bản gốc khi file hỏng / rỗng.
 * Nhiều sheet thì trả về hết để màn nhập cho người dùng chọn sheet.
 */
export async function readWorkbook(file: File): Promise<ReadWorkbook> {
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
  } catch {
    throw new XlsxError(XLSX_ERR.cannotOpen);
  }
  const names = wb.SheetNames ?? [];
  if (!names.length) throw new XlsxError(XLSX_ERR.noSheet);
  const sheets: Sheet[] = names.map((name) => {
    const ws = wb.Sheets[name];
    const csv = ws ? XLSX.utils.sheet_to_csv(ws, { blankrows: false, FS: "," }) : "";
    const rows = csv.trim() ? csv.trim().split(/\r?\n/).length : 0;
    return { name, csv, rows };
  });
  const first = sheets.find((s) => s.rows >= 2) ?? sheets.find((s) => s.rows >= 1);
  // Có sheet nhưng không sheet nào có dữ liệu → "rỗng hoặc sai format"
  if (!first) throw new XlsxError(XLSX_ERR.emptySheet);
  return { sheets, first };
}

/** Lấy CSV của một sheet theo tên; sheet trống → lỗi "File Excel rỗng hoặc sai format" */
export function sheetCsv(wb: ReadWorkbook, name: string): string {
  const s = wb.sheets.find((x) => x.name === name);
  if (!s || !s.csv.trim()) throw new XlsxError(XLSX_ERR.emptySheet);
  return s.csv;
}

/** Tải xuống file .xlsx mẫu: dòng tiêu đề + (tuỳ chọn) vài dòng ví dụ */
export async function downloadTemplateXlsx(opts: {
  fileName: string;
  headers: readonly string[];
  sample?: readonly (readonly (string | number)[])[];
  sheetName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [[...opts.headers], ...(opts.sample ?? []).map((r) => [...r])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Rộng cột theo độ dài tiêu đề để mở ra đọc được ngay
  ws["!cols"] = opts.headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName ?? "Mẫu").slice(0, 31));
  const name = opts.fileName.endsWith(".xlsx") ? opts.fileName : `${opts.fileName}.xlsx`;
  XLSX.writeFile(wb, name, { bookType: "xlsx" });
}
