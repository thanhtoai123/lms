"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { fmtDateTime } from "@/components/lead-ui";

export function NotificationBell({ canRunWorker }: { canRunWorker: boolean }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ ...trpc.engagement.myNotifications.queryOptions({ limit: 20 }), refetchInterval: 30_000 });
  const mark = useMutation(trpc.engagement.markRead.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.engagement.myNotifications.queryKey() }) }));
  const run = useMutation(trpc.engagement.runWorker.mutationOptions({ onSuccess: () => { qc.invalidateQueries(); } }));
  const unread = q.data?.unread ?? 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {canRunWorker && (
          <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => run.mutate()} disabled={run.isPending} title="Xử lý outbox + quét SLA (production chạy tự động mỗi phút)">
            {run.isPending ? "Đang chạy…" : run.data ? `Automation: ${run.data.processed} event, ${run.data.actions} hành động` : "▶ Chạy automation"}
          </button>
        )}
        <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted" onClick={() => setOpen(!open)} aria-label={`Thông báo, ${unread} chưa đọc`}>
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 && <span className={`absolute right-0.5 top-0.5 rounded-full px-1.5 text-[10px] font-bold text-white ${q.data?.hasPriority1 ? "bg-red-600" : "bg-primary"}`}>{unread > 9 ? "9+" : unread}</span>}
        </button>
      </div>
      {open && (
        <div className="card absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-bold uppercase text-ink-400">Thông báo</span>{unread > 0 && <button className="text-xs text-brand-600" onClick={() => mark.mutate({ all: true })}>Đọc tất cả</button>}</div>
          {(q.data?.items ?? []).length === 0 && <div className="p-3 text-sm text-ink-400">Không có thông báo.</div>}
          {(q.data?.items ?? []).map((n) => (
            <Link key={n.id} href={n.link ?? "#"} onClick={() => { if (!n.readAt) mark.mutate({ ids: [n.id] }); setOpen(false); }} className={`block rounded-lg px-2 py-2 hover:bg-brand-50 ${n.readAt ? "opacity-60" : ""}`}>
              <div className="text-sm font-medium flex items-center gap-2">{n.priority === 1 && <span className="h-2 w-2 rounded-full bg-red-600" />}{n.title}</div>
              {n.body && <div className="text-xs text-ink-600 line-clamp-2">{n.body}</div>}
              <div className="text-[10px] text-ink-400">{fmtDateTime(n.createdAt)}</div>
            </Link>
          ))}
          <Link href="/thong-bao" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-2 text-center text-xs font-medium text-brand-600 hover:bg-brand-50">
            Xem tất cả thông báo →
          </Link>
        </div>
      )}
    </div>
  );
}
