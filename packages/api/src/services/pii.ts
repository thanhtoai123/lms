/**
 * Mã hoá tầng ứng dụng cho PII phụ huynh (`parent_private`: CCCD, địa chỉ) và cho những
 * bí mật khác không được để trần trong CSDL (token Zalo OA, secret_key tích hợp).
 *
 * Thuật toán và định dạng nằm ở `core/security/hopKin` — **script nhập dữ liệu cũ dùng
 * chung đúng đoạn mã đó**. Tệp này chỉ còn việc gắn khoá của máy chủ vào.
 */
import { piiEncryptionSecret } from "../lib/secrets";
import { dongHop, moHop, hopHopLe, NHAN_PII } from "@satarobo/core";

export function sealWith(label: string, plain: string | null | undefined): string | null {
  return dongHop(label, piiEncryptionSecret(), plain);
}

export function openWith(label: string, sealed: string | null | undefined): string | null {
  return moHop(label, piiEncryptionSecret(), sealed);
}

export function sealPii(plain: string | null | undefined): string | null {
  return dongHop(NHAN_PII, piiEncryptionSecret(), plain);
}

export function openPii(sealed: string | null | undefined): string | null {
  return moHop(NHAN_PII, piiEncryptionSecret(), sealed);
}

/**
 * Ô này có dữ liệu nhưng mở không được (khoá sai, hoặc nhập từ hệ cũ bằng cách mã hoá khác).
 * Phân biệt với ô trống — `openPii` trả `null` cho cả hai trường hợp, nên chỗ nào cần báo
 * cho người dùng "có dữ liệu nhưng hệ thống không đọc được" thì hỏi hàm này.
 */
export function piiMoKhongDuoc(sealed: string | null | undefined): boolean {
  return hopHopLe(sealed) && openPii(sealed) === null;
}

/** Bí danh tương thích (dùng ở hồ sơ học viên) */
export const encryptPii = sealPii;
export const decryptPii = openPii;
