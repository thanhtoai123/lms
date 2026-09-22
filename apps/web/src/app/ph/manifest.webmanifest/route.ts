/** Web App Manifest của cổng phụ huynh — tên, màu tím Sata Robo, lối tắt tới các việc hay làm */
export function GET() {
  const m = {
    id: "/ph",
    name: "Sata Robo — Phụ huynh",
    short_name: "Sata Robo",
    description: "Lịch học, phiếu nhận xét sau mỗi buổi, xin nghỉ, học phí và tin nhắn với trung tâm.",
    lang: "vi",
    dir: "ltr",
    start_url: "/ph",
    scope: "/ph",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf8",
    theme_color: "#610b8a",
    categories: ["education"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Lịch học của con", short_name: "Lịch học", url: "/ph/lich", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Yêu cầu của tôi", short_name: "Yêu cầu", url: "/ph/yeu-cau", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Học phí", short_name: "Học phí", url: "/ph/hoc-phi", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
  return Response.json(m, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
