import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { ALL_NAV_ITEMS } from "@/lib/admin-nav";

export const dynamic = "force-dynamic";

const PHASE_VI: Record<number, string> = { 3: "Giai đoạn 3 — Lớp/Buổi nâng cao", 4: "Giai đoạn 4 — Tài chính & Nhân sự", 5: "Giai đoạn 5 — LMS, App PH, Website, Báo cáo" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const item = ALL_NAV_ITEMS.find((i) => i.href === "/" + slug.join("/"));
  return { title: item?.label ?? "Không tìm thấy" };
}

/** Mọi mục menu của hệ cũ chưa xây trên hệ mới: giữ đúng đường dẫn, nêu phạm vi theo đặc tả */
export default async function PlannedScreen({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = "/" + slug.join("/");
  const item = ALL_NAV_ITEMS.find((i) => i.href === path);
  if (!item || item.ready) notFound();
  const { ctx } = await getServerCaller();
  if (item.perm && ctx.actor && !hasPermission(ctx.actor as Actor, item.perm)) {
    return <div className="card p-6 text-sm">Bạn không có quyền xem <b>{item.label}</b>.</div>;
  }
  const siblings = ALL_NAV_ITEMS.filter((i) => i.group === item.group && i.href !== item.href);
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="text-xs text-ink-400">{item.group}</div>
      <h1 className="text-2xl font-bold">{item.label}</h1>
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-amber-100 text-amber-800">Đang xây dựng</span>
          {item.phase && <span className="chip bg-brand-600/10 text-brand-600">{PHASE_VI[item.phase]}</span>}
        </div>
        {item.desc && <p className="text-sm text-ink-600">{item.desc}</p>}
        <p className="text-xs text-ink-400">Màn hình này giữ đúng đường dẫn <code className="font-mono">{item.href}</code> như admin.satarobo.vn. Phạm vi chi tiết xem docs/ADMIN-SPEC.md.</p>
      </div>
      {siblings.some((s) => s.ready) && (
        <div className="card p-5">
          <div className="label">Đã dùng được trong nhóm này</div>
          <div className="flex flex-wrap gap-2">
            {siblings.filter((s) => s.ready).map((s) => <Link key={s.href} href={s.href} className="btn-ghost text-xs">{s.label}</Link>)}
          </div>
        </div>
      )}
    </div>
  );
}
