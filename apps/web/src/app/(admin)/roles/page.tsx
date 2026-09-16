import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vai trò & quyền" };

const LEVEL: Record<string, { label: string; cls: string }> = {
  full: { label: "Toàn quyền", cls: "bg-brand-500 text-white" },
  write: { label: "Ghi", cls: "bg-green-100 text-green-800" },
  read: { label: "Xem", cls: "bg-sky-100 text-sky-800" },
  own: { label: "Của mình", cls: "bg-amber-100 text-amber-800" },
  none: { label: "", cls: "" },
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Vai trò & quyền" perm="system:read" />;
  const d = await caller.system.roles();
  const focus = d.roles.find((r) => r.role === sp.role) ?? null;
  const groups = [...new Set(d.resources.map((r) => r.group))];
  return (
    <div className="space-y-4">
      <PageHeader title="Vai trò & quyền" desc="Ma trận đọc trực tiếp từ bộ phân quyền của hệ thống (nguồn sự thật ở máy chủ, không sửa tay). Vai trò cơ sở chỉ có hiệu lực trong cơ sở được gán; “Của mình” = chỉ dữ liệu mình phụ trách." />
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(LEVEL).filter(([k]) => k !== "none").map(([k, v]) => <span key={k} className={`chip ${v.cls}`}>{v.label}</span>)}
      </div>
      <div className="card overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr className="border-b border-black/5">
              <th className="sticky left-0 z-10 bg-white p-2 text-left">Vai trò</th>
              {groups.map((g) => <th key={g} colSpan={d.resources.filter((r) => r.group === g).length} className="border-l border-black/5 p-2 text-center font-semibold text-ink-600">{g}</th>)}
            </tr>
            <tr className="border-b border-black/10">
              <th className="sticky left-0 z-10 bg-white p-2"></th>
              {d.resources.map((r, i) => <th key={r.key} className={`p-1 align-bottom font-medium text-ink-600 ${i === 0 || d.resources[i - 1]!.group !== r.group ? "border-l border-black/5" : ""}`}><div className="w-16 break-words leading-tight">{r.label}</div></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {d.roles.map((r) => (
              <tr key={r.role} className={focus?.role === r.role ? "bg-brand-50" : "hover:bg-black/[0.02]"}>
                <td className="sticky left-0 z-10 bg-white p-2 whitespace-nowrap">
                  <Link href={`/roles?role=${r.role}`} className="font-semibold text-brand-600">{r.label}</Link>
                  <div className="text-[11px] text-ink-400">{r.scope} · <Link href={`/users?role=${r.role}`} className="hover:underline">{r.users} người</Link></div>
                </td>
                {d.resources.map((res, i) => {
                  const c = r.cells[res.key]!;
                  const lv = LEVEL[c.level]!;
                  return (
                    <td key={res.key} className={`p-1 text-center ${i === 0 || d.resources[i - 1]!.group !== res.group ? "border-l border-black/5" : ""}`} title={c.actions.join(", ")}>
                      {c.level !== "none" && <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${lv.cls}`}>{lv.label}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {focus && (
        <section className="card p-4">
          <h2 className="font-semibold">{focus.label} <span className="font-mono text-xs text-ink-400">{focus.role}</span></h2>
          <p className="text-xs text-ink-600">{focus.scope} · {focus.users} người đang giữ vai trò</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {focus.permissions.map((p) => <code key={p} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">{p}</code>)}
          </div>
        </section>
      )}
    </div>
  );
}
