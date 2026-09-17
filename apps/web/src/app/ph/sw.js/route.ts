/** Service worker của cổng phụ huynh (phạm vi /ph/) — nhận thông báo đẩy, mở đúng trang khi bấm */
const SW = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
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
  return new Response(SW, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/ph/" } });
}
