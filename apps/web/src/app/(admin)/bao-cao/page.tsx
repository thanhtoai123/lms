import Link from "next/link";
import { BookOpen, ChartColumn, ChartLine, Coins, FlaskConical, GraduationCap, Users, type LucideIcon } from "lucide-react";
import { REPORTS, hasPermission, navAllowed, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo" };

const ICON: Record<string, LucideIcon> = {
  "chart-column": ChartColumn, "chart-line": ChartLine, "book-open": BookOpen, "flask-conical": FlaskConical,
  "graduation-cap": GraduationCap, users: Users, coins: Coins,
};

/**
 * Chỉ mục báo cáo — thay 10 mục menu /bao-cao/* bằng MỘT mục (docs/KIEN-TRUC-MENU.md).
 * Mỗi thẻ: tên, mô tả một dòng, ai nên xem. Hai báo cáo tạm thời của đợt chuyển hệ (Sau go-live,
 * Đo pilot chat) nằm ở Công cụ kỹ thuật › Go-live, không liệt kê ở đây.
 */
export default async function ReportsIndexPage() {
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo" perm="report:read" />;
  const actor = ctx.actor as Actor;
  const cards = REPORTS.filter((r) => navAllowed(r.perm, (p) => hasPermission(actor, p)));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo" desc="Chọn báo cáo cần xem. Số liệu theo phạm vi cơ sở của bạn; mỗi báo cáo có bộ lọc thời gian / cơ sở và xuất CSV." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((r) => {
          const Icon = ICON[r.icon] ?? ChartColumn;
          return (
            <Link key={r.href} href={r.href} prefetch={false} className="card group flex gap-3 p-4 transition-colors hover:border-primary/40">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-primary">{r.label}</span>
                <span className="block text-sm text-ink-600">{r.desc}</span>
                <span className="mt-1 block text-xs text-ink-400">Nên xem: {r.audience}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
