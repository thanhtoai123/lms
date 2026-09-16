import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sata Robo — Giáo viên",
    short_name: "Sata Robo",
    start_url: "/teacher",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#f97316",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
