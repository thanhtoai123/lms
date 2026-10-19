import type { MetadataRoute } from "next";
import { loadBrand } from "@/lib/brand";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await loadBrand();
  return {
    name: `${b.name} — Giáo viên`,
    short_name: b.name,
    start_url: "/teacher",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: b.primary,
    icons: b.hasLogo
      ? [{ src: b.logoUrl, sizes: "any", purpose: "any" }]
      : [{ src: "/thsteam/app-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
