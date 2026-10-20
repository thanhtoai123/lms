/**
 * ẢNH ĐẠI DIỆN HỌC VIÊN — quy tắc thuần (không I/O) dùng chung cho máy chủ và trình duyệt.
 *
 *  - Ai cập nhật: nhân sự có quyền sửa hồ sơ học viên, và phụ huynh của chính học viên (cổng /ph) — đổi là hiện ngay.
 *  - Trình duyệt cắt ảnh vuông, thu về tối đa `AVATAR_SIZE` px và mã hoá lại JPEG trước khi gửi (ảnh nhẹ, không còn
 *    dữ liệu EXIF như vị trí GPS). Máy chủ vẫn kiểm định dạng theo nội dung tệp và bóc khối siêu dữ liệu JPEG lần nữa.
 *  - Ảnh lưu riêng tư trong kho tệp, chỉ phát qua URL có chữ ký ngắn hạn (`signedMediaUrl`).
 *  - Chưa có ảnh: hiện chữ cái đầu của tên gọi (tên tiếng Việt là từ cuối) trên nền màu thương hiệu.
 */

/** Định dạng nhận (không nhận SVG: SVG chạy được mã) → đuôi tệp lưu */
export const STUDENT_AVATAR_MIME: Readonly<Record<string, "jpg" | "png" | "webp">> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Dung lượng tối đa máy chủ nhận (ảnh đã thu nhỏ ở trình duyệt thường < 150 KB) */
export const STUDENT_AVATAR_MAX = 2 * 1024 * 1024;
/** Cạnh ảnh vuông sau khi trình duyệt thu nhỏ */
export const AVATAR_SIZE = 512;
/** Hạn của URL ảnh đại diện có chữ ký (giây) — trang để mở lâu vẫn còn ảnh */
export const AVATAR_URL_TTL = 6 * 3600;

/** Kiểm định dạng theo NỘI DUNG tệp (không tin `type` do máy khách khai). Trả lý do lỗi, hoặc null khi hợp lệ */
export function avatarFormatError(mime: string, bytes: Uint8Array): string | null {
  if (!STUDENT_AVATAR_MIME[mime]) return "Chỉ nhận ảnh JPG, PNG hoặc WEBP";
  if (bytes.byteLength === 0) return "Tệp rỗng";
  if (bytes.byteLength > STUDENT_AVATAR_MAX) return "Ảnh tối đa 2MB";
  const b = bytes;
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? null : "Nội dung tệp không phải ảnh JPG";
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? null : "Nội dung tệp không phải ảnh PNG";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? null : "Nội dung tệp không phải ảnh WEBP";
}

/**
 * Bóc khối siêu dữ liệu của ảnh JPEG: APP1 (EXIF / XMP — có thể chứa toạ độ GPS, tên máy chụp), APP13 (IPTC) và
 * chú thích (COM). Giữ nguyên dữ liệu ảnh, bảng lượng tử, ICC (APP2) và JFIF (APP0). Tệp không phải JPEG hoặc hỏng
 * cấu trúc thì trả lại nguyên bản (trình duyệt đã mã hoá lại nên thường không còn gì để bóc).
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    const marker = bytes[i + 1]!;
    // SOS: phần còn lại là dữ liệu ảnh nén — chép nguyên tới hết tệp
    if (marker === 0xda) { out.push(bytes.subarray(i)); break; }
    // Đánh dấu không có độ dài (RSTn, TEM, đệm 0xFF)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { out.push(bytes.subarray(i, i + 2)); i += marker === 0xff ? 1 : 2; continue; }
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) return bytes;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) out.push(bytes.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of out) { res.set(p, o); o += p.length; }
  return res;
}

/** Chữ cái đầu cho ảnh giữ chỗ: ưu tiên tên gọi ở nhà, không thì tên (từ cuối của họ tên) */
export function avatarInitial(k: { fullName: string; nickname?: string | null }): string {
  const src = (k.nickname?.trim() || k.fullName.trim().split(/\s+/).pop() || "?").normalize("NFC");
  return (Array.from(src)[0] ?? "?").toLocaleUpperCase("vi-VN");
}

/** Màu nền ảnh giữ chỗ — chỉ dùng màu trong bảng nhận diện, cố định theo mã học viên để mỗi bé một màu quen */
const TONES = [
  { bg: "#1D4ED8", fg: "#FFFFFF" },
  { bg: "#10B981", fg: "#0F172A" },
  { bg: "#F59E0B", fg: "#0F172A" },
  { bg: "#0F172A", fg: "#FFFFFF" },
] as const;
export function avatarTone(seed: string): { bg: string; fg: string } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return TONES[(h >>> 0) % TONES.length]!;
}

/** Khoá lưu ảnh trong kho tệp: mỗi lần đổi một khoá mới (URL cũ tự hết tác dụng, không lẫn bộ đệm) */
export function avatarObjectKey(studentId: string, ext: string, nonce: string): string {
  return `avatars/students/${studentId}/${nonce}.${ext}`;
}
