/**
 * ĐƯỜNG DẪN NỘI BỘ AN TOÀN — chống chuyển hướng mở (open redirect).
 *
 * Kiểm "bắt đầu bằng `/` và không bằng `//`" là CHƯA ĐỦ: trình duyệt coi `\` như `/` và bỏ qua
 * tab / xuống dòng trong URL, nên `/\evil.com` hay `/<TAB>/evil.com` đều thành `//evil.com` — sau
 * khi đăng nhập người dùng bị đưa sang trang giả mạo. Luật ở đây: chỉ nhận đường dẫn tuyệt đối
 * nội bộ, không có `\`, không có ký tự điều khiển, và phân tích lại vẫn nằm trên cùng máy chủ.
 */
export function duongNoiBo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  if (s.length > 2000) return null;
  try {
    const u = new URL(s, "http://noi-bo.invalid");
    if (u.host !== "noi-bo.invalid") return null;
  } catch {
    return null;
  }
  return s;
}
