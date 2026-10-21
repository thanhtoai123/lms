/**
 * MÃ VIETQR (chuẩn NAPAS 247 theo EMVCo Merchant-Presented QR) — TỰ SINH trên máy chủ, không gọi dịch vụ ngoài.
 *
 * Trước đây ảnh QR lấy từ `img.vietqr.io` (dịch vụ công cộng, không cam kết): dịch vụ đó chậm / chặn / đổi là
 * phụ huynh không quét được. Giờ chuỗi QR dựng theo chuẩn rồi vẽ thành SVG bằng bộ mã QR thuần TypeScript (qr/encode.ts).
 *
 * Cấu trúc (TLV: mã 2 ký tự + độ dài 2 chữ số + giá trị):
 *   00 "01"                        phiên bản định dạng
 *   01 "12" | "11"                 12 = mã động (có số tiền, dùng cho một đơn) · 11 = mã tĩnh
 *   38 { 00 "A000000727"           GUID NAPAS
 *        01 { 00 <BIN 6 số> 01 <số tài khoản> }
 *        02 "QRIBFTTA" }           chuyển nhanh tới TÀI KHOẢN (QRIBFTTC = tới thẻ)
 *   53 "704"                       VND
 *   54 <số tiền, chỉ chữ số>
 *   58 "VN"
 *   62 { 08 <nội dung chuyển khoản> }
 *   63 <CRC-16/CCITT-FALSE 4 hex in hoa, tính trên toàn chuỗi kể cả "6304">
 */
import { qrSvg } from "../qr/encode.js";

const tlv = (id: string, value: string): string => {
  if (value.length > 99) throw new Error(`VietQR: trường ${id} dài quá 99 ký tự`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
};

/** CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit — 4 ký tự hex in hoa */
export function crc16Ccitt(s: string): string {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(s)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nội dung an toàn cho ngân hàng: bỏ dấu, chỉ giữ A–Z a–z 0–9 và dấu cách, tối đa `max` ký tự */
export function vietQrSafeText(s: string, max = 50): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

export interface VietQrInput {
  /** Mã BIN ngân hàng 6 số (NAPAS), ví dụ 970422 = MB */
  bankBin: string;
  /** Số tài khoản nhận (chữ và số, tối đa 19 ký tự) */
  accountNo: string;
  /** Số tiền VND (số nguyên > 0); bỏ trống = mã tĩnh, người chuyển tự nhập tiền */
  amount?: number | null;
  /** Nội dung chuyển khoản (đã bỏ dấu sẽ an toàn hơn) */
  memo?: string | null;
}

export function validateVietQr(p: VietQrInput): string[] {
  const errs: string[] = [];
  if (!/^\d{6}$/.test(p.bankBin ?? "")) errs.push("Mã BIN ngân hàng phải gồm 6 chữ số");
  const acc = (p.accountNo ?? "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9]{1,19}$/.test(acc)) errs.push("Số tài khoản chỉ gồm chữ / số, tối đa 19 ký tự");
  if (p.amount != null && (!Number.isInteger(p.amount) || p.amount <= 0 || p.amount > 9_999_999_999_999)) errs.push("Số tiền phải là số nguyên dương");
  return errs;
}

/** Chuỗi VietQR hoàn chỉnh (kèm CRC). Ném lỗi nếu dữ liệu không hợp lệ. */
export function vietQrPayload(p: VietQrInput): string {
  const errs = validateVietQr(p);
  if (errs.length) throw new Error(`VietQR: ${errs.join("; ")}`);
  const acc = p.accountNo.replace(/\s/g, "");
  const dynamic = p.amount != null;
  const memo = p.memo ? vietQrSafeText(p.memo) : "";
  const body =
    tlv("00", "01") +
    tlv("01", dynamic ? "12" : "11") +
    tlv("38", tlv("00", "A000000727") + tlv("01", tlv("00", p.bankBin) + tlv("01", acc)) + tlv("02", "QRIBFTTA")) +
    tlv("53", "704") +
    (dynamic ? tlv("54", String(p.amount)) : "") +
    tlv("58", "VN") +
    (memo ? tlv("62", tlv("08", memo)) : "") +
    "6304";
  return body + crc16Ccitt(body);
}

/** Đọc ngược chuỗi VietQR (để kiểm tra / hiển thị) — null nếu sai CRC hoặc sai cấu trúc */
export function parseVietQr(s: string): { bankBin: string; accountNo: string; amount: number | null; memo: string | null } | null {
  if (!/^000201/.test(s) || s.length < 12) return null;
  if (crc16Ccitt(s.slice(0, -4)) !== s.slice(-4)) return null;
  const read = (str: string): Map<string, string> | null => {
    const m = new Map<string, string>();
    let i = 0;
    while (i < str.length) {
      const id = str.slice(i, i + 2);
      const len = Number(str.slice(i + 2, i + 4));
      if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > str.length) return null;
      m.set(id, str.slice(i + 4, i + 4 + len));
      i += 4 + len;
    }
    return m;
  };
  const top = read(s);
  const m38 = top?.get("38") ? read(top.get("38")!) : null;
  const ben = m38?.get("01") ? read(m38.get("01")!) : null;
  if (!top || m38?.get("00") !== "A000000727" || !ben?.get("00") || !ben.get("01")) return null;
  const m62 = top.get("62") ? read(top.get("62")!) : null;
  return {
    bankBin: ben.get("00")!, accountNo: ben.get("01")!,
    amount: top.get("54") ? Number(top.get("54")) : null,
    memo: m62?.get("08") ?? null,
  };
}

/** Ảnh QR dạng `data:image/svg+xml` — nhúng thẳng vào <img>, không phụ thuộc máy chủ ảnh bên ngoài */
export function vietQrDataUri(p: VietQrInput): string {
  const svg = qrSvg(vietQrPayload(p), { scale: 6, border: 4 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Ngân hàng phổ biến và mã BIN NAPAS (đối chiếu nhiều nguồn công khai). Ngân hàng khác: nhập BIN tay theo danh sách
 * mã BIN của Ngân hàng Nhà nước. Luôn thử chuyển 1 khoản nhỏ trước khi dùng thật.
 */
export const VN_BANKS: readonly { bin: string; name: string }[] = [
  { bin: "970422", name: "MB Bank (Quân đội)" },
  { bin: "970436", name: "Vietcombank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970405", name: "Agribank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970416", name: "ACB" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970437", name: "HDBank" },
  { bin: "970441", name: "VIB" },
];
