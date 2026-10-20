import { loadBrand } from "@/lib/brand";

/** Web App Manifest của cổng phụ huynh — tên + màu theo nhận diện thương hiệu, lối tắt tới các việc hay làm */
export async function GET() {
  const b = await loadBrand();
  const icon = b.hasLogo ? { src: b.logoUrl, sizes: "any" } : { src: "/thsteam/icon-192.png", sizes: "192x192", type: "image/png" };
  const icons = b.hasLogo ? [{ ...icon, purpose: "any" }] : [{ ...icon, purpose: "any" }, { src: "/thsteam/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }];
  const m = {
    id: "/ph",
    name: `${b.name} — Phụ huynh`,
    short_name: b.name,
    description: "Lịch học, phiếu nhận xét sau mỗi buổi, xin nghỉ, học phí và tin nhắn với trung tâm.",
    lang: "vi",
    dir: "ltr",
    start_url: "/ph",
    scope: "/ph",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf8",
    theme_color: b.primary,
    categories: ["education"],
    icons,
    shortcuts: [
      { name: "Lịch học của con", short_name: "Lịch học", url: "/ph/lich", icons: [icon] },
      { name: "Yêu cầu của tôi", short_name: "Yêu cầu", url: "/ph/yeu-cau", icons: [icon] },
      { name: "Học phí", short_name: "Học phí", url: "/ph/hoc-phi", icons: [icon] },
    ],
  };
  return Response.json(m, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
