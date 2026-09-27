/**
 * THEO DÕI LỖI MÁY CHỦ — tự chứa, không gửi dữ liệu ra dịch vụ ngoài.
 *
 * Trước đây lỗi 500 chỉ nằm trong log của tiến trình: không ai biết lỗi nào đang lặp lại, từ
 * lúc nào, bao nhiêu lần. Nay mỗi lỗi không mong đợi được GOM theo "vân tay" (loại lỗi + mã +
 * câu đã chuẩn hoá + đường dẫn) vào một dòng có bộ đếm, hiện ở /van-hanh.
 *
 * Chỉ ghi phần AN TOÀN (xem `redactErrorForLog`): không SQL, không tham số, không PII, không
 * dữ liệu người dùng gửi lên.
 */
export interface LoiMayChu {
  ten: string;
  ma: string | null;
  thongDiep: string;
  duongDan: string;
  vanTay: string;
}

/** Bỏ phần thay đổi theo từng lần (số, mã định danh, chuỗi hex) để cùng một lỗi gom về một dòng */
export function chuanHoaThongDiep(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "«id»")
    .replace(/\b[0-9a-f]{16,}\b/gi, "«hex»")
    .replace(/\d+/g, "«số»")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Đường dẫn chuẩn hoá: bỏ truy vấn, thay đoạn id bằng «id» */
export function chuanHoaDuongDan(p: string): string {
  const s = (p || "?").split("?")[0]!.slice(0, 200);
  return s.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/«id»").replace(/\/\d+(?=\/|$)/g, "/«số»");
}

/** Băm djb2 (không cần thư viện mã hoá — chỉ để gom nhóm, không phải bảo mật) */
function bam(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function taoLoiMayChu(x: { name: string; code?: string | null; msg: string; path: string }): LoiMayChu {
  const thongDiep = chuanHoaThongDiep(x.msg || "(không có thông điệp)");
  const duongDan = chuanHoaDuongDan(x.path);
  const ten = (x.name || "Error").slice(0, 80);
  const ma = x.code ? String(x.code).slice(0, 40) : null;
  return { ten, ma, thongDiep, duongDan, vanTay: bam(`${ten}|${ma ?? ""}|${thongDiep}|${duongDan}`) };
}
