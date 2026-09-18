"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_GROUPS, NOTIFICATION_PRIORITIES, NOTIFICATION_PRIORITY_VI, type NotificationPriority } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { Empty } from "@/components/ui";
import { fmtDateTime } from "@/components/lead-ui";

type Item = {
  id: string; title: string; body: string | null; link: string | null; readAt: Date | string | null; createdAt: Date | string;
  type: string | null; typeLabel: string; groupKey: string | null; groupLabel: string;
  priority: NotificationPriority; priorityLabel: string; bucket: "today" | "yesterday" | "older"; actionRequired: boolean;
};

const BUCKET_VI = { today: "Hôm nay", yesterday: "Hôm qua", older: "Cũ hơn" } as const;
const PRIORITY_CHIP: Record<NotificationPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  normal: "bg-sky-100 text-sky-800",
  info: "bg-slate-100 text-slate-600",
};

export function NotificationCenter() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [groupKey, setGroupKey] = useState("");
  const [priority, setPriority] = useState<"" | NotificationPriority>("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [acc, setAcc] = useState<Item[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(
    () => ({ groupKey: groupKey || undefined, priority: priority || undefined, q: debounced || undefined, unreadOnly: unreadOnly || undefined }),
    [groupKey, priority, debounced, unreadOnly],
  );

  // đổi bộ lọc thì bắt đầu lại từ trang 1
  useEffect(() => { setPage(1); setAcc([]); }, [filters]);

  const listQuery = useQuery(trpc.engagement.notificationCenter.queryOptions({ ...filters, page }));
  useEffect(() => {
    if (!listQuery.data) return;
    const items = listQuery.data.items as unknown as Item[];
    setAcc((prev) => (listQuery.data.page === 1 ? items : [...prev.filter((p) => !items.some((i) => i.id === p.id)), ...items]));
  }, [listQuery.data]);

  const mark = useMutation(trpc.engagement.markRead.mutationOptions({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.engagement.notificationCenter.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.engagement.myNotifications.queryKey() });
    },
  }));

  const counts = listQuery.data?.counts ?? { total: 0, unread: 0, urgent: 0, actionRequired: 0 };
  const buckets: Item["bucket"][] = ["today", "yesterday", "older"];
  const markOne = (n: Item) => { if (!n.readAt) mark.mutate({ ids: [n.id] }); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-ink-400">Tổng số</div><b className="text-2xl">{counts.total}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Chưa đọc</div><b className="text-2xl text-brand-600">{counts.unread}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Khẩn chưa đọc</div><b className="text-2xl text-red-700">{counts.urgent}</b></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Cần thực hiện</div><b className="text-2xl text-amber-700">{counts.actionRequired}</b></div>
      </div>

      <div className="card flex flex-wrap items-end gap-2 p-3">
        <label className="text-xs text-ink-600">Nhóm
          <select className="input mt-1 !py-1.5" value={groupKey} onChange={(e) => setGroupKey(e.target.value)}>
            <option value="">Tất cả nhóm</option>
            {Object.entries(NOTIFICATION_GROUPS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Mức
          <select className="input mt-1 !py-1.5" value={priority} onChange={(e) => setPriority(e.target.value as NotificationPriority | "")}>
            <option value="">Mọi mức</option>
            {NOTIFICATION_PRIORITIES.map((p) => <option key={p} value={p}>{NOTIFICATION_PRIORITY_VI[p]}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs text-ink-600">Tìm trong tiêu đề / nội dung
          <input className="input mt-1 w-full !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: hoàn tiền, CS1, đối soát…" maxLength={100} />
        </label>
        <label className="flex items-center gap-1 pb-1.5 text-xs text-ink-600">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Chỉ chưa đọc
        </label>
        <button className="btn-ghost !py-1.5" disabled={mark.isPending || counts.unread === 0} onClick={() => mark.mutate({ all: true })}>Đánh dấu đã đọc tất cả</button>
      </div>

      {listQuery.error && <div className="card p-4 text-sm text-red-700">{listQuery.error.message}</div>}
      {acc.length === 0 && !listQuery.isLoading && <Empty>Không có thông báo phù hợp bộ lọc.</Empty>}

      {buckets.map((b) => {
        const rows = acc.filter((n) => n.bucket === b);
        if (!rows.length) return null;
        return (
          <section key={b} className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-400">{BUCKET_VI[b]} ({rows.length})</h2>
            <ul className="card divide-y divide-black/5">
              {rows.map((n) => (
                <li key={n.id} className={`flex flex-wrap items-start gap-3 p-3 ${n.readAt ? "opacity-60" : ""}`}>
                  <span className={`chip ${PRIORITY_CHIP[n.priority]}`}>{n.priorityLabel}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.actionRequired && <span className="chip bg-amber-100 text-amber-800">Cần thực hiện</span>}
                      {n.link
                        ? <Link href={n.link} className="font-medium hover:underline" onClick={() => markOne(n)}>{n.title}</Link>
                        : <span className="font-medium">{n.title}</span>}
                    </div>
                    {n.body && <p className="text-sm text-ink-600">{n.body}</p>}
                    <div className="text-xs text-ink-400">{n.groupLabel} · {n.typeLabel} · {fmtDateTime(n.createdAt)}</div>
                  </div>
                  {!n.readAt && <button className="btn-ghost !px-2 !py-0.5 text-xs" disabled={mark.isPending} onClick={() => mark.mutate({ ids: [n.id] })}>Đánh dấu đã đọc</button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="flex justify-center">
        {listQuery.isFetching
          ? <span className="text-sm text-ink-400">Đang tải…</span>
          : listQuery.data?.hasMore
            ? <button className="btn-ghost" onClick={() => setPage((p) => p + 1)}>Tải thêm</button>
            : acc.length > 0 && <span className="text-sm text-ink-400">Đã hiển thị hết.</span>}
      </div>
    </div>
  );
}
