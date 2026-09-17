import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { fmtD } from "@/components/finance-ui";
import { OpenDocButton } from "@/components/content-ui";
import { fmtSize } from "@/components/shared-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài liệu lớp tôi" };

type Doc = { id: string; title: string; kind: "file" | "link" | "scorm"; kindLabel: string; category: string; audience: string; fileName: string | null; sizeBytes: number | null };

function DocList({ docs }: { docs: Doc[] }) {
  if (!docs.length) return <p className="text-xs text-ink-400">Chưa có tài liệu.</p>;
  return (
    <ul className="space-y-1">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
          <span><Link href={d.kind === "scorm" ? `/scorm/${d.id}` : `/documents/${d.id}`} className="hover:underline">{d.title}</Link> <span className="text-xs text-ink-400">{d.category} · {d.kindLabel}{d.sizeBytes ? ` · ${fmtSize(d.sizeBytes)}` : ""}{d.audience === "student" ? " · gửi PH được" : ""}</span></span>
          <OpenDocButton id={d.id} kind={d.kind} />
        </li>
      ))}
    </ul>
  );
}

export default async function TeachingMaterialsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "class:read")) return <NoAccess title="Tài liệu lớp tôi" perm="class:read" />;
  const d = await caller.content.myMaterials({ classId: sp.class || undefined });
  const canPropose = hasPermission(actor, "curriculum:propose");
  return (
    <div className="space-y-4">
      <PageHeader title="Tài liệu lớp tôi" desc="Giáo án, slide, phiếu bài tập theo từng bài của lớp đang dạy; buổi sắp tới có tài liệu gì để chuẩn bị." actions={<div className="flex gap-2">{hasPermission(actor, "assignment:read") && <Link href={`/assignments${d.selected ? `?class=${d.selected.id}` : ""}`} className="btn-ghost">Bài tập của lớp</Link>}{canPropose && <Link href="/de-xuat-giao-an?new=1" className="btn-ghost">Đề xuất sửa giáo án</Link>}</div>} />
      {d.classes.length === 0 ? <Empty>Bạn chưa phụ trách lớp nào đang hoạt động.</Empty> : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {d.classes.map((c) => <Link key={c.id} href={`/teaching-materials?class=${c.id}`} className={`chip ${d.selected?.id === c.id ? "bg-brand-600 text-white" : "bg-black/5"}`}>{c.code}</Link>)}
          </div>
          {d.selected && (
            <>
              {d.upcoming.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-2 font-semibold">Buổi sắp tới</h2>
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {d.upcoming.map((u) => (
                      <li key={u.id} className="rounded-lg bg-brand-50 p-3 text-sm">
                        <div className="text-xs text-ink-600">{fmtD(u.date)} · {u.startTime.slice(0, 5)} · buổi {u.sequenceNo}</div>
                        <div className="font-medium">{u.lesson ?? "—"}</div>
                        <div className={`text-xs ${u.docCount ? "text-green-700" : "text-amber-700"}`}>{u.docCount ? `${u.docCount} tài liệu` : "Chưa có tài liệu cho bài này"}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="card p-4">
                <h2 className="mb-2 font-semibold">Tài liệu chung — {d.selected.courseCode}</h2>
                <DocList docs={d.general} />
              </section>
              {d.lessons.length === 0 ? <Empty>Lớp chưa gắn giáo trình.</Empty> : (
                <section className="card divide-y divide-black/5">
                  {d.lessons.map((l) => (
                    <div key={l.id} className={`p-4 ${l.next ? "bg-amber-50/50" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">Bài {l.sequenceNo}: {l.title}{l.next && <span className="chip ml-2 bg-amber-100 text-amber-800">buổi tới {fmtD(l.next.date)}</span>}</div>
                          {l.objectives && <p className="whitespace-pre-line text-xs text-ink-600">Mục tiêu: {l.objectives}</p>}
                          {l.materials && <p className="whitespace-pre-line text-xs text-ink-600">Chuẩn bị: {l.materials}</p>}
                        </div>
                        {canPropose && <Link href={`/de-xuat-giao-an?new=1&lesson=${l.id}&class=${d.selected!.id}`} className="text-xs text-brand-600">Đề xuất sửa</Link>}
                      </div>
                      <div className="mt-2"><DocList docs={l.docs} /></div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
