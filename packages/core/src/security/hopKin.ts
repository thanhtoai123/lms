/**
 * HỘP KÍN — mã hoá tầng ứng dụng cho dữ liệu không được để trần trong CSDL:
 * PII phụ huynh (CCCD, địa chỉ), token Zalo OA, khoá bí mật của tích hợp.
 *
 * Vì sao nằm ở `core` chứ không ở `api`: **script nhập dữ liệu cũ cũng phải mã hoá đúng
 * cách này**. Trước đây script tự viết một phiên bản riêng — khác tên biến môi trường,
 * khác cách dẫn xuất khoá, khác cả dấu phân tách — nên ứng dụng đọc lại thì `moHop()`
 * trả `null` lặng lẽ và CCCD phụ huynh nhập từ hệ cũ thành rác **không ai biết**.
 * Một đoạn mã dùng chung là cách duy nhất để hai bên không thể lệch nhau lần nữa.
 *
 * Định dạng: `v1:<iv>:<tag>:<ciphertext>`, mỗi phần base64url. AES-256-GCM.
 * Khoá dẫn xuất `sha256("<nhãn>|<bí mật>")` — nhãn khác nhau cho khoá khác nhau, nên lộ
 * một nhãn không kéo theo nhãn còn lại.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Nhãn mặc định cho PII phụ huynh — đổi nhãn là làm hỏng mọi bản ghi cũ, đừng đổi */
export const NHAN_PII = "pii";
/** Tiền tố phiên bản; đổi thuật toán thì tăng số và đọc được cả bản cũ */
const V = "v1";

function khoa(nhan: string, biMat: string): Buffer {
  return createHash("sha256").update(`${nhan}|${biMat}`).digest();
}

/** Đóng hộp một chuỗi. Chuỗi rỗng / null → `null` (không lưu hộp rỗng vào CSDL). */
export function dongHop(nhan: string, biMat: string, plain: string | null | undefined): string | null {
  const t = (plain ?? "").trim();
  if (!t) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", khoa(nhan, biMat), iv);
  const ct = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return `${V}:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

/**
 * Mở hộp. Trả `null` khi: không có gì, sai định dạng, sai khoá, hoặc nội dung bị sửa
 * (GCM phát hiện được). Nơi gọi cần phân biệt "không có" với "mở không được" thì dùng
 * `hopHopLe()` để hỏi trước.
 */
export function moHop(nhan: string, biMat: string, sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== V || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", khoa(nhan, biMat), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Chuỗi này có đúng hình dạng một hộp không (chưa cần khoá để biết).
 * Dùng để phân biệt "ô trống" với "có dữ liệu nhưng mở không được" — đúng tình huống
 * nhập dữ liệu cũ bằng khoá khác: ô có nội dung, `moHop` trả `null`, và nếu không hỏi
 * câu này thì không ai phát hiện ra.
 */
export function hopHopLe(sealed: string | null | undefined): boolean {
  if (!sealed) return false;
  const p = sealed.split(":");
  return p.length === 4 && p[0] === V && !!p[1] && !!p[2] && p[3] !== undefined;
}
