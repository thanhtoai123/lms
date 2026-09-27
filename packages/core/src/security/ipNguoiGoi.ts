/**
 * ĐỊA CHỈ IP CỦA NGƯỜI GỌI — nguồn duy nhất cho mọi giới hạn tần suất theo IP.
 *
 * Bản cũ lấy phần tử ĐẦU của `X-Forwarded-For`. Phần đó do MÁY KHÁCH tự khai: mỗi lượt gửi một
 * IP bịa là mỗi lượt có một hạn mức mới — giới hạn tần suất theo IP coi như không có.
 *
 * Mỗi proxy tin cậy (nginx, Vercel, Cloudflare…) NỐI địa chỉ nó thấy vào CUỐI danh sách, nên
 * phần tử đáng tin là phần tử thứ `hops` tính từ PHẢI (`TRUSTED_PROXY_HOPS`, mặc định 1 — một lớp
 * proxy trước ứng dụng). Không có `X-Forwarded-For` thì dùng `X-Real-IP` (proxy đặt đè).
 */
export function ipNguoiGoi(
  xff: string | null | undefined,
  xRealIp: string | null | undefined,
  hops: number = 1,
): string {
  const ds = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const n = Number.isInteger(hops) && hops >= 1 ? hops : 1;
  if (ds.length) {
    // Ít phần tử hơn số lớp proxy → lấy phần tử đầu (proxy ngoài cùng chính là người gọi)
    const ip = ds[Math.max(0, ds.length - n)]!;
    if (hopLe(ip)) return ip;
  }
  const r = (xRealIp ?? "").trim();
  return r && hopLe(r) ? r : "unknown";
}

/** Chỉ nhận chuỗi trông giống IPv4 / IPv6 — không để chuỗi tuỳ ý thành khoá đếm */
function hopLe(ip: string): boolean {
  return ip.length <= 45 && (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^[0-9a-fA-F:.]+$/.test(ip));
}

/** Đọc số lớp proxy tin cậy từ biến môi trường */
export function soLopProxy(env: Record<string, string | undefined>): number {
  const n = Number(env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

/** Tiện cho route handler: đọc thẳng từ header của yêu cầu */
export function ipTuHeader(h: { get(name: string): string | null }, env: Record<string, string | undefined>): string {
  return ipNguoiGoi(h.get("x-forwarded-for"), h.get("x-real-ip"), soLopProxy(env));
}
