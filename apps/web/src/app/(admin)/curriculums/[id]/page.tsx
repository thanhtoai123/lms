import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, CLASS_STATUS_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { CurriculumEditor } from "../editor";
import { CUR_CHIP } from "../chips";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giáo trình" };

export default async function CurriculumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "curriculum:read")) return <NoAccess title="Giáo trình" perm="curriculum:read" />;
  const c = await caller.catalog.curriculum({ id }).catch(() => null);
  if (!c) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/curriculums?course=${c.courseId}`} className="text-sm text-ink-600">← Chương trình học</Link>
      <PageHeader
        title={c.name}
        desc={`${c.course?.code ?? ""} — ${c.course?.name ?? ""} · phiên bản ${c.version}${c.description ? ` · ${c.description}` : ""}`}
        actions={<span className={`chip ${CUR_CHIP[c.status] ?? "bg-black/5"}`}>{c.statusLabel}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CurriculumEditor c={{ id: c.id, courseId: c.courseId, name: c.name, description: c.description, status: c.status, canEdit: c.canEdit, readiness: c.readiness, lessons: c.lessons, courseSessions: c.course?.totalSessions ?? 0 }} />
        </div>
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Các phiên bản</h2>
            <ul className="space-y-1 text-sm">
              {c.versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  {v.id === c.id ? <b>v{v.version} · {v.name}</b> : <Link href={`/curriculums/${v.id}`} className="text-brand-600 hover:underline">v{v.version} · {v.name}</Link>}
                  <span className={`chip ${CUR_CHIP[v.status] ?? "bg-black/5"}`}>{v.status === "active" ? "Đang dùng" : v.status === "draft" ? "Nháp" : "Ngưng"}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Lớp gắn giáo trình này</h2>
            {c.usedBy.length === 0 ? <p className="text-sm text-ink-400">Chưa có lớp nào.</p> : (
              <ul className="space-y-1 text-sm">
                {c.usedBy.map((u) => <li key={u.id} className="flex justify-between"><Link href={`/classes/${u.id}`} className="font-mono text-xs text-brand-600">{u.code}</Link><span className="text-xs text-ink-400">{CLASS_STATUS_VI[u.status]}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
