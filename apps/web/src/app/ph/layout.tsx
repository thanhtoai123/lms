export const metadata = { title: "Sata Robo — Phụ huynh", robots: { index: false } };

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface">{children}</div>;
}

