export const metadata = { title: "Sata Robo — Phụ huynh", robots: { index: false }, manifest: "/ph/manifest.webmanifest", appleWebApp: { capable: true, title: "Sata Robo" } };

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface">{children}</div>;
}

