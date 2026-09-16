import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MyClasses() {
  const { caller } = await getServerCaller();
  const rows = await caller.teacher.myClasses().catch(() => []);
  if (rows.length === 0) return <Empty>Bạn chưa được phân công lớp nào.</Empty>;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Lớp của tôi</h1>
      {rows.map((c) => (
        <Link key={c.id} href={`/ops/classes/${c.id}`} className="card block p-4">
          <div className="flex justify-between gap-2">
            <div>
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-ink-400">{c.code} · {c.centerCode} · {c.schedule ?? "chưa có lịch"}</div>
            </div>
            {c.sessionsOverdue > 0 && <span className="chip bg-red-100 text-red-700 h-fit">{c.sessionsOverdue} quá hạn</span>}
          </div>
          <div className="mt-2 text-xs text-ink-600">{c.enrolled}/{c.capacity} HV · {c.sessionsDone}/{c.sessionsTotal} buổi</div>
          <div className="mt-1 h-1.5 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${c.sessionsTotal ? Math.round((c.sessionsDone / c.sessionsTotal) * 100) : 0}%` }} /></div>
        </Link>
      ))}
    </div>
  );
}
