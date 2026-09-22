/**
 * Service worker của cổng phụ huynh (phạm vi /ph — điều khiển cả trang /ph lẫn /ph/…):
 *  - nhận thông báo đẩy, bấm vào mở đúng trang /ph…;
 *  - mất mạng khi mở một trang /ph → hiện màn "mất kết nối" đã lưu sẵn (/ph/offline).
 * KHÔNG lưu đệm trang có dữ liệu của con (mọi trang khác luôn lấy từ mạng) — máy dùng chung không lộ dữ liệu cũ.
 */
const CACHE = "sr-ph-offline-v1";
const SW = `
const CACHE = "${CACHE}";
const OFFLINE = "/ph/offline";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icon.svg"])).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf("sr-ph-") === 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin || u.pathname.indexOf("/ph") !== 0) return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE).then((m) => m || new Response("Mất kết nối mạng", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const url = typeof d.url === "string" && d.url.indexOf("/ph") === 0 ? d.url : "/ph/thong-bao";
  e.waitUntil(self.registration.showNotification(d.title || "Sata Robo", { body: d.body || "", tag: d.tag, icon: "/icon.svg", badge: "/icon.svg", data: { url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/ph";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (new URL(c.url).pathname.indexOf("/ph") === 0 && "focus" in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
`;

export function GET() {
  return new Response(SW, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/ph" } });
}
