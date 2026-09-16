/**
 * Biến động số dư (SePay / sao kê) và nhập giao dịch cũ — quy tắc thuần, không phụ thuộc DB.
 */
import { extractOrderRef, formatVnd } from "./rules.js";

export const BANK_TX_STATUSES = ["matched", "unmatched", "needs_review", "ignored"] as const;
export type BankTxStatus = (typeof BANK_TX_STATUSES)[number];
export const BANK_TX_STATUS_VI: Record<BankTxStatus, string> = {
  matched: "Đã khớp",
  unmatched: "Chưa khớp",
  needs_review: "Cần kiểm tra",
  ignored: "Bỏ qua",
};
export const BANK_TX_SOURCES = ["sepay", "statement"] as const;
export type BankTxSource = (typeof BANK_TX_SOURCES)[number];

export interface BankTx {
  externalId: string;
  gateway: string;
  accountNo: string;
  /** ISO có múi giờ +07:00 */
  occurredAt: string;
  amount: number;
  direction: "in" | "out";
  content: string;
  referenceCode: string | null;
  accumulated: number | null;
}

/** "2024-07-02 11:08:33" (giờ VN) → "2024-07-02T11:08:33+07:00" */
export function parseSepayDate(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const dt = new Date(Date.UTC(+y!, +mo! - 1, +d!));
  if (dt.getUTCMonth() !== +mo! - 1 || dt.getUTCDate() !== +d! || +h! > 23 || +mi! > 59 || +(se ?? 0) > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}+07:00`;
}

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Chuẩn hoá payload webhook SePay. Trả lỗi thay vì ném để route trả 400 rõ ràng. */
export function parseSepayPayload(x: unknown): { ok: true; tx: BankTx } | { ok: false; error: string } {
  if (!x || typeof x !== "object") return { ok: false, error: "Payload không phải JSON object" };
  const p = x as Record<string, unknown>;
  const id = p.id;
  if (typeof id !== "number" && typeof id !== "string") return { ok: false, error: "Thiếu id giao dịch" };
  const amount = Number(p.transferAmount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return { ok: false, error: "transferAmount không hợp lệ" };
  const direction = p.transferType === "in" ? "in" : p.transferType === "out" ? "out" : null;
  if (!direction) return { ok: false, error: "transferType phải là in/out" };
  const occurredAt = typeof p.transactionDate === "string" ? parseSepayDate(p.transactionDate) : null;
  if (!occurredAt) return { ok: false, error: "transactionDate không hợp lệ" };
  const accountNo = digitsOnly(String(p.accountNumber ?? "")) || digitsOnly(String(p.subAccount ?? ""));
  if (!accountNo) return { ok: false, error: "Thiếu số tài khoản" };
  const acc = p.accumulated == null ? null : Number(p.accumulated);
  const content = [p.content, p.code].filter((v) => typeof v === "string" && v.trim()).join(" ").trim();
  return {
    ok: true,
    tx: {
      externalId: String(id),
      gateway: String(p.gateway ?? "").slice(0, 60),
      accountNo,
      occurredAt,
      amount,
      direction,
      content: content.slice(0, 500),
      referenceCode: typeof p.referenceCode === "string" && p.referenceCode.trim() ? p.referenceCode.trim().slice(0, 80) : null,
      accumulated: acc != null && Number.isFinite(acc) ? Math.round(acc) : null,
    },
  };
}

/** So khoá API không lộ thời gian (header "Apikey xxx") */
export function checkApiKey(header: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !header) return false;
  const m = /^Apikey\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  const a = m[1]!.trim();
  let diff = a.length ^ expected.length;
  for (let i = 0; i < Math.max(a.length, expected.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}

export interface MatchOrder {
  code: string;
  status: string;
  total: number;
  confirmed: number;
  pending: { id: string; amount: number }[];
}

export type MatchDecision =
  | { kind: "confirm_new"; note: string }
  | { kind: "confirm_pending"; paymentId: string; note: string }
  | { kind: "needs_review"; note: string }
  | { kind: "unmatched"; note: string }
  | { kind: "ignored"; note: string };

/**
 * Quyết định đối khớp một giao dịch tiền vào với đơn.
 * accountOk: số TK nhận thuộc một phương thức chuyển khoản đang dùng được cho cơ sở của đơn.
 */
export function decideBankMatch(input: { direction: "in" | "out"; amount: number; content: string; accountKnown: boolean; accountOk: boolean; order: MatchOrder | null }): MatchDecision {
  if (input.direction === "out") return { kind: "ignored", note: "Tiền ra — không đối khớp" };
  const ref = extractOrderRef(input.content);
  if (!input.accountKnown) return { kind: "needs_review", note: "Số tài khoản nhận chưa khai báo trong Phương thức TT" };
  if (!ref) return { kind: "unmatched", note: "Nội dung không có mã đơn" };
  const o = input.order;
  if (!o) return { kind: "unmatched", note: `Không tìm thấy đơn ${ref}` };
  if (!input.accountOk) return { kind: "needs_review", note: `Tài khoản nhận không thuộc cơ sở của đơn ${o.code}` };
  if (o.status === "cancelled" || o.status === "refunded") return { kind: "needs_review", note: `Đơn ${o.code} đã đóng — cần xử lý hoàn/giữ tiền` };
  const outstanding = Math.max(0, o.total - o.confirmed);
  if (outstanding <= 0) return { kind: "needs_review", note: `Đơn ${o.code} đã thu đủ — tiền thừa ${formatVnd(input.amount)}` };
  const same = o.pending.find((p) => p.amount === input.amount);
  if (same) return { kind: "confirm_pending", paymentId: same.id, note: `Khớp khoản sale đã ghi nhận ${formatVnd(input.amount)}` };
  if (input.amount > outstanding) return { kind: "needs_review", note: `Tiền vào ${formatVnd(input.amount)} vượt số còn phải thu ${formatVnd(outstanding)}` };
  const pendingSum = o.pending.reduce((s, p) => s + p.amount, 0);
  if (pendingSum > 0 && pendingSum + input.amount > outstanding) {
    return { kind: "needs_review", note: `Đơn có ${formatVnd(pendingSum)} sale ghi nhận chờ xác nhận khác số tiền về — kiểm tra trùng` };
  }
  return { kind: "confirm_new", note: `Tự khớp theo nội dung (${o.code})` };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Đọc CSV: tự nhận dấu phân cách , ; hoặc tab, hỗ trợ ngoặc kép, bỏ BOM, bỏ dòng trống */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row.map((x) => x.trim()));
  return rows;
}

/** "1.200.000", "1,200,000", "1200000đ", "1 200 000 VND" → 1200000; số lẻ/âm/rỗng → null */
export function parseVnAmount(s: string | null | undefined): number | null {
  const t = (s ?? "").replace(/(vnd|vnđ|đ|d)$/i, "").replace(/[\s.,]/g, "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** "25/03/2024", "25-03-2024", "2024-03-25", "25/03/2024 14:02" → "2024-03-25" */
export function parseVnDate(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
    if (!r) return null;
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Map tiêu đề cột (không dấu, nhiều cách viết) → khoá chuẩn */
export function mapHeaders<K extends string>(header: string[], aliases: Record<K, string[]>): { index: Partial<Record<K, number>>; unknown: string[] } {
  const index: Partial<Record<K, number>> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const f = fold(h);
    const key = (Object.keys(aliases) as K[]).find((k) => aliases[k].includes(f));
    if (key && index[key] === undefined) index[key] = i;
    else if (!key) unknown.push(h);
  });
  return { index, unknown };
}

export const LEGACY_ALIASES = {
  orderCode: ["ma_don", "order_code", "ma_don_hang", "don_hang"],
  studentCode: ["ma_hv", "ma_hoc_vien", "student_code"],
  classCode: ["ma_lop", "lop", "class_code"],
  orderTotal: ["tong_don", "hoc_phi", "tong_tien_don", "order_total"],
  amount: ["so_tien", "so_tien_thu", "amount", "da_thu"],
  paidAt: ["ngay_thu", "ngay", "paid_at", "ngay_nop"],
  method: ["phuong_thuc", "ma_phuong_thuc", "hinh_thuc", "method"],
  legacyReceipt: ["so_phieu", "so_phieu_thu", "ma_phieu", "receipt", "receipt_no"],
  payer: ["nguoi_nop", "payer", "phu_huynh"],
  note: ["ghi_chu", "note", "dien_giai"],
} as const satisfies Record<string, string[]>;
export type LegacyKey = keyof typeof LEGACY_ALIASES;

export interface LegacyRow {
  line: number;
  orderCode: string | null;
  studentCode: string | null;
  classCode: string | null;
  orderTotal: number | null;
  amount: number;
  paidAt: string;
  method: string;
  legacyReceipt: string;
  payer: string | null;
  note: string | null;
}

/** Đọc + kiểm tra từng dòng file giao dịch cũ (chưa tra DB) */
export function parseLegacyCsv(text: string, today: string, maxRows = 2000): { rows: { line: number; row: LegacyRow | null; errors: string[] }[]; headerErrors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], headerErrors: ["File cần dòng tiêu đề và ít nhất 1 dòng dữ liệu"] };
  const { index } = mapHeaders(all[0]!, LEGACY_ALIASES as unknown as Record<LegacyKey, string[]>);
  const headerErrors: string[] = [];
  for (const k of ["amount", "paidAt", "method", "legacyReceipt"] as const) if (index[k] === undefined) headerErrors.push(`Thiếu cột ${LEGACY_ALIASES[k][0]}`);
  if (index.orderCode === undefined && (index.studentCode === undefined || index.classCode === undefined)) headerErrors.push("Cần cột ma_don hoặc cặp ma_hv + ma_lop");
  if (all.length - 1 > maxRows) headerErrors.push(`Tối đa ${maxRows} dòng mỗi lần`);
  if (headerErrors.length) return { rows: [], headerErrors };
  const get = (r: string[], k: LegacyKey) => (index[k] === undefined ? "" : (r[index[k]!] ?? "").trim());
  const seen = new Set<string>();
  const rows = all.slice(1).map((r, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const amount = parseVnAmount(get(r, "amount"));
    if (amount == null) errors.push("Số tiền không hợp lệ");
    const paidAt = parseVnDate(get(r, "paidAt"));
    if (!paidAt) errors.push("Ngày thu không hợp lệ (dd/mm/yyyy)");
    else if (paidAt > today) errors.push("Ngày thu ở tương lai");
    const orderCodeRaw = get(r, "orderCode").toUpperCase();
    const orderCode = orderCodeRaw ? (extractOrderRef(orderCodeRaw) ?? orderCodeRaw) : null;
    const studentCode = get(r, "studentCode") || null;
    const classCode = get(r, "classCode") || null;
    const totalRaw = get(r, "orderTotal");
    const orderTotal = totalRaw ? parseVnAmount(totalRaw) : null;
    if (!orderCode) {
      if (!studentCode || !classCode) errors.push("Cần mã đơn hoặc mã HV + mã lớp");
      if (totalRaw && orderTotal == null) errors.push("Tổng đơn không hợp lệ");
    }
    const method = get(r, "method");
    if (!method) errors.push("Thiếu phương thức");
    const legacyReceipt = get(r, "legacyReceipt");
    if (!legacyReceipt) errors.push("Thiếu số phiếu cũ (dùng để chống nhập trùng)");
    else if (seen.has(legacyReceipt.toUpperCase())) errors.push("Số phiếu bị lặp trong file");
    else seen.add(legacyReceipt.toUpperCase());
    const row: LegacyRow | null = errors.length
      ? null
      : { line, orderCode, studentCode, classCode, orderTotal, amount: amount!, paidAt: paidAt!, method, legacyReceipt: legacyReceipt.slice(0, 60), payer: get(r, "payer").slice(0, 120) || null, note: get(r, "note").slice(0, 300) || null };
    return { line, row, errors };
  });
  return { rows, headerErrors };
}

export const STATEMENT_ALIASES = {
  date: ["ngay", "ngay_gd", "ngay_giao_dich", "transaction_date", "date", "thoi_gian"],
  credit: ["so_tien_ghi_co", "ghi_co", "tien_vao", "credit", "so_tien", "amount"],
  debit: ["so_tien_ghi_no", "ghi_no", "tien_ra", "debit"],
  content: ["noi_dung", "mo_ta", "dien_giai", "description", "content", "noi_dung_giao_dich"],
  reference: ["ma_gd", "so_tham_chieu", "so_but_toan", "reference", "ma_giao_dich", "so_ct"],
} as const satisfies Record<string, string[]>;
export type StatementKey = keyof typeof STATEMENT_ALIASES;

/** Đọc sao kê ngân hàng dạng CSV → giao dịch tiền vào */
export function parseStatementCsv(text: string, accountNo: string, gateway: string, maxRows = 3000): { txs: BankTx[]; errors: { line: number; error: string }[]; skippedOut: number; headerErrors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { txs: [], errors: [], skippedOut: 0, headerErrors: ["File cần dòng tiêu đề và dữ liệu"] };
  const { index } = mapHeaders(all[0]!, STATEMENT_ALIASES as unknown as Record<StatementKey, string[]>);
  const headerErrors: string[] = [];
  if (index.date === undefined) headerErrors.push("Thiếu cột ngày");
  if (index.credit === undefined) headerErrors.push("Thiếu cột số tiền ghi có");
  if (index.content === undefined) headerErrors.push("Thiếu cột nội dung");
  if (all.length - 1 > maxRows) headerErrors.push(`Tối đa ${maxRows} dòng`);
  if (headerErrors.length) return { txs: [], errors: [], skippedOut: 0, headerErrors };
  const get = (r: string[], k: StatementKey) => (index[k] === undefined ? "" : (r[index[k]!] ?? "").trim());
  const txs: BankTx[] = [];
  const errors: { line: number; error: string }[] = [];
  let skippedOut = 0;
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    const credit = parseVnAmount(get(r, "credit"));
    if (credit == null) {
      if (parseVnAmount(get(r, "debit")) != null || /^[-\s0.,]*$/.test(get(r, "credit"))) skippedOut++;
      else errors.push({ line, error: "Số tiền ghi có không hợp lệ" });
      return;
    }
    const date = parseVnDate(get(r, "date"));
    if (!date) return void errors.push({ line, error: "Ngày không hợp lệ" });
    const content = get(r, "content").slice(0, 500);
    const ref = get(r, "reference").slice(0, 80) || null;
    const externalId = ref ? `${accountNo}:${ref}` : `${accountNo}:${date}:${credit}:${fold(content).slice(0, 80)}`;
    txs.push({ externalId, gateway, accountNo, occurredAt: `${date}T00:00:00+07:00`, amount: credit, direction: "in", content, referenceCode: ref, accumulated: null });
  });
  return { txs, errors, skippedOut, headerErrors };
}
