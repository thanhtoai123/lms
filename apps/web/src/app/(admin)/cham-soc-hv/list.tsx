"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { fmtDateTime } from "@/components/lead-ui";
import { Empty } from "@/components/ui";

type Item = { id: string; code: string; title: string; severity: number; status: string; dueAt: Date; overdue: boolean; studentName: string; studentCode: string | null; className: string | null; classId: string | null; outcome: string | null };

const CODE_VI: Record<string, string> = { CONSECUTIVE_ABSENCE: "Nghỉ liên tiếp", LOW_ATTENDANCE: "Chuyên cần thấp", PENDING_MAKEUP: "Chờ học bù", MANUAL: "Thủ công" };

export function CareList({ initial }: { initial: Item[] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery({ ...trpc.engagement.careTasks.queryOptions({}), initialData: initial as never });
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const resolve = useMutation(trpc.engagement.resolveCareTask.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.engagement.careTasks.queryKey() }) }));
  const items = (q.data ?? []) as Item[];
  if (items.length === 0) return <Empty>Không có việc chăm sóc nào đang mở. 🎉</Empty>;
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <div key={t.id} className={`card p-4 flex flex-wrap items-center gap-3 ${t.overdue ? "border-red-200" : ""}`}>
          <span className={`chip ${t.severity === 1 ? "bg-red-100 text-red-700" : t.severity === 2 ? "bg-amber-100 text-amber-800" : "bg-black/5"}`}>{CODE_VI[t.code] ?? t.code}</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.studentName} <span className="text-xs text-ink-400">{t.studentCode}</span>{t.classId && <Link href={`/classes/${t.classId}`} className="text-xs text-brand-700 ml-2">{t.className}</Link>}</div>
            <div className="text-xs text-ink-600">{t.title} · hạn {fmtDateTime(t.dueAt)}{t.overdue && <span className="text-red-700"> · quá hạn</span>}{t.status === "in_progress" ? " · đang xử lý" : ""}</div>
          </div>
          <input className="input max-w-[260px]" placeholder="Kết quả: đã gọi PH, con ốm…" value={outcome[t.id] ?? ""} onChange={(e) => setOutcome({ ...outcome, [t.id]: e.target.value })} />
          <div className="flex gap-1">
            {t.status === "open" && <button className="btn-ghost text-xs" onClick={() => resolve.mutate({ id: t.id, status: "in_progress" })}>Nhận</button>}
            <button className="btn-primary text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: t.id, status: "done", outcome: outcome[t.id] })}>Xong</button>
            <button className="btn-ghost text-xs" onClick={() => resolve.mutate({ id: t.id, status: "escalated", outcome: outcome[t.id] })}>Chuyển cấp</button>
          </div>
        </div>
      ))}
    </div>
  );
}
