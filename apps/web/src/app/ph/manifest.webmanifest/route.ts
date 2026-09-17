export function GET() {
  const m = {
    name: "Sata Robo — Phụ huynh", short_name: "Sata Robo", lang: "vi", start_url: "/ph", scope: "/ph", display: "standalone",
    background_color: "#ffffff", theme_color: "#ffffff", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
  return Response.json(m, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
