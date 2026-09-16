import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/trpc/server";
import { NotificationBell } from "@/components/notification-bell";

const NAV = [
  { href: "/ops", label: "Việc cần xử lý" },
  { href: "/ops/leads", label: "Tuyển sinh" },
  { href: "/ops/care", label: "Chăm sóc HV" },
  { href: "/ops/classes", label: "Lớp học" },
  { href: "/ops/sessions", label: "Buổi học" },
  { href: "/teacher", label: "Teacher app" },
];

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const { caller } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me) redirect("/login");
  const roles = me.assignments.map((a) => a.role);
  const canRunWorker = roles.includes("SUPER_ADMIN") || roles.includes("CENTER_MANAGER");
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-black/5 bg-white p-4 md:sticky md:top-0 md:h-dvh">
        <div className="font-black text-brand-600 text-lg">Sata Robo · Ops</div>
        <div className="text-xs text-ink-600 mt-1">{me.user.fullName}</div>
        <div className="text-[11px] text-ink-400">{roles.join(", ")}</div>
        <nav className="mt-4 flex md:flex-col gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-brand-50 whitespace-nowrap">{n.label}</Link>
          ))}
          <Link href="/logout" className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-black/5">Đăng xuất</Link>
        </nav>
      </aside>
      <div>
        <div className="flex justify-end px-4 md:px-8 pt-3"><NotificationBell canRunWorker={canRunWorker} /></div>
        <main className="p-4 md:p-8 pt-2 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
