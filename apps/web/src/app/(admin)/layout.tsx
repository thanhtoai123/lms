import { redirect } from "next/navigation";
import { hasPermission, hasRole, ROLE_LABEL_VI, STAFF_ROLES, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { AdminShell } from "@/components/admin-shell";

export const dynamic = "force-dynamic";

/** Vai trò chính để hiển thị: ưu tiên vai trò cao nhất theo thứ tự khai báo */
const PRIORITY = ["SUPER_ADMIN", "AUDITOR", "HO_ACCOUNTANT", "HO_HR", "HO_MARKETING", "HO_SALE", "TRAINING", "CENTER_MANAGER", "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { caller, ctx } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me || !ctx.actor) redirect("/login?next=/dashboard");
  const actor = ctx.actor as Actor;
  const roles = me.assignments.map((a) => a.role);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) redirect("/login?error=forbidden");

  const nav = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || hasPermission(actor, i.perm)) })).filter((g) => g.items.length > 0);
  const main = PRIORITY.find((r) => roles.includes(r)) ?? roles[0]!;
  const initials = me.user.fullName.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join("") || "U";

  return (
    <AdminShell
      nav={nav}
      me={{ fullName: me.user.fullName, email: me.user.email, roleLabel: ROLE_LABEL_VI[main], initials }}
      canRunWorker={hasRole(actor, "SUPER_ADMIN", "CENTER_MANAGER")}
    >
      {children}
    </AdminShell>
  );
}
