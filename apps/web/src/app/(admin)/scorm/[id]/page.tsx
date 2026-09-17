import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { ScormPlayer } from "./player";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài giảng tương tác" };

export default async function ScormPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const d = await caller.content.document({ id });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/scorm" className="text-sm text-ink-600">← Bài giảng tương tác</Link>
          <h1 className="text-xl font-bold">{d.title}</h1>
          <p className="text-xs text-ink-400">{d.courseCode}{d.lessonSeq ? ` · Bài ${d.lessonSeq}: ${d.lessonTitle}` : ""}</p>
        </div>
        <Link href={`/documents/${d.id}`} className="btn-ghost">Chi tiết & tiến độ</Link>
      </div>
      {d.kind !== "scorm" || !d.currentVersion ? <p className="card p-4">Tài liệu chưa có gói SCORM.</p> : <ScormPlayer id={d.id} />}
    </div>
  );
}
