/**
 * ĐỊA CHỈ API CỦA CỔNG NỐI (vd máy chủ Zalo cá nhân) — chặn SSRF vào dịch vụ siêu dữ liệu đám mây.
 *
 * Cổng nối có thể chạy trên chính máy chủ hoặc trong mạng nội bộ, nên KHÔNG chặn localhost /
 * mạng riêng (đó là cấu hình hợp lệ). Thứ phải chặn là địa chỉ siêu dữ liệu của nhà cung cấp đám
 * mây (169.254.169.254 …): lọt vào đó là lộ khoá truy cập của cả máy chủ. Lời gọi còn phải tắt
 * tự theo chuyển hướng (`redirect: "error"`) để máy chủ ngoài không bẻ sang địa chỉ đó.
 */
export function loiUrlCongNoi(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Địa chỉ API không hợp lệ";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Địa chỉ API phải là http/https";
  if (u.username || u.password) return "Địa chỉ API không được chứa tài khoản / mật khẩu";
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^169\.254\./.test(host) || host === "0.0.0.0" || host.startsWith("fe80:") || host === "fd00:ec2::254") return "Không được trỏ tới địa chỉ nội bộ của hạ tầng đám mây";
  if (host === "metadata.google.internal" || host === "metadata" || host.endsWith(".metadata.internal")) return "Không được trỏ tới địa chỉ nội bộ của hạ tầng đám mây";
  // Dạng số nguyên / hex của IP (vd 2852039166 = 169.254.169.254) — trình phân tích URL đã chuẩn hoá,
  // nhưng chặn thêm cho chắc mọi hostname chỉ gồm chữ số / 0x
  if (/^(0x[0-9a-f]+|\d+)$/.test(host)) return "Địa chỉ API không hợp lệ";
  return null;
}
