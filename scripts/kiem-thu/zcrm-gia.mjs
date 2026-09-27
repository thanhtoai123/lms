/**
 * ZCRM GIẢ — máy chủ nhỏ đóng vai ZCRM v3.4 để kiểm thử đầu-cuối phần tích hợp, KHÔNG cần chạy ZCRM thật.
 * Chỉ mô phỏng đúng hình dạng API công khai (đọc từ mã nguồn ZCRM v3.4), không chứa mã của ZCRM.
 *
 *   node scripts/kiem-thu/zcrm-gia.mjs      (cổng 3099, khoá API "khoa-thu-zcrm")
 *
 * Dữ liệu giả lấy từ biến ZCRM_RND để mỗi lượt kiểm thử có tên / mã riêng. Tên khách là tên giả.
 */
import http from "node:http";

const PORT = Number(process.env.ZCRM_PORT || 3099);
const KEY = process.env.ZCRM_KEY || "khoa-thu-zcrm";
const RND = process.env.ZCRM_RND || "0";
const daGui = [];

const ngayMai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
const hoiThoai = [
  { id: `conv-${RND}`, threadType: "user", externalThreadId: `77${RND}0001`, lastMessageAt: new Date().toISOString(), unreadCount: 1, isReplied: false,
    contact: { id: `ct-${RND}`, fullName: `Khach ZCRM ${RND}`, phone: `0900${RND.slice(-6).padStart(6, "0")}`, avatarUrl: null } },
  { id: `nhom-${RND}`, threadType: "group", externalThreadId: `nhom${RND}`, lastMessageAt: new Date().toISOString(), unreadCount: 3, isReplied: true,
    contact: null, groupName: `Nhom lop thu ${RND}` },
];
const lichHen = [
  { id: `hen-${RND}`, appointmentDate: ngayMai, appointmentTime: "19:30", type: "call", status: "scheduled", notes: "Goi lai tu van",
    contact: { id: `ct-la-${RND}`, fullName: "Khach chua co ho so", phone: "0911000000" } },
];

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__sent") return json(res, 200, { sent: daGui });
  // Trang giao diện: y như ZCRM v3.4 mặc định — cấm mọi trang nhúng (X-Frame-Options: DENY)
  if (url.pathname === "/") {
    const h = { "Content-Type": "text/html; charset=utf-8" };
    if (process.env.ZCRM_CHO_NHUNG) h["Content-Security-Policy"] = `frame-ancestors ${process.env.ZCRM_CHO_NHUNG}`;
    else { h["X-Frame-Options"] = "DENY"; h["Content-Security-Policy-Report-Only"] = "frame-ancestors 'none'"; }
    res.writeHead(200, h);
    return res.end("<!doctype html><title>ZCRM gia</title><h1>ZCRM gia</h1>");
  }
  if (!url.pathname.startsWith("/api/public/")) return json(res, 404, { error: "not found" });
  if (req.headers["x-api-key"] !== KEY) return json(res, 401, { error: "Invalid API key" });
  if (req.method === "GET" && url.pathname === "/api/public/conversations") return json(res, 200, { conversations: hoiThoai });
  if (req.method === "GET" && url.pathname === "/api/public/appointments") return json(res, 200, { appointments: lichHen });
  const mm = /^\/api\/public\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
  if (req.method === "GET" && mm) {
    // Tin mới nhất đứng đầu (như ZCRM): một tin khách gửi khi webhook không tới được
    if (decodeURIComponent(mm[1]) !== `conv-${RND}`) return json(res, 200, { messages: [] });
    return json(res, 200, { messages: [
      { id: `p1-${RND}`, senderType: "contact", senderName: `Khach ZCRM ${RND}`, content: `Tin keo ve ${RND}`, contentType: "text", sentAt: new Date().toISOString(), attachments: null },
    ] });
  }
  if (req.method === "POST" && url.pathname === "/api/public/messages/send") {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let b = {};
      try { b = JSON.parse(raw); } catch { /* bỏ */ }
      if (!b.zaloAccountId || !b.threadId || !b.content) return json(res, 400, { error: "zaloAccountId, threadId, and content are required" });
      daGui.push(b);
      json(res, 200, { success: true });
    });
    return;
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`ZCRM gia dang nghe cong ${PORT}`));
