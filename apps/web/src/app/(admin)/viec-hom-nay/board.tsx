"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock, Award, BellRing, CheckCheck, ClipboardCheck, ClipboardList, CreditCard, ExternalLink, FlaskConical,
  HeartHandshake, MessageSquarePlus, NotebookPen, RefreshCw, ScrollText, Undo2, Users, type LucideIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ActionButton, EmptyState, RowSkeleton } from "@/components/action-button";
import { useListKeys } from "@/components/shortcuts";
import { useToast } from "@/components/toast";

type Inbox = RouterOutputs["inbox"]["today"];
type Group = Inbox["groups"][number];
type Item = Group["items"][number];
type GroupKey = Group["key"];

/** Icon theo đúng bộ lucide đã ánh xạ ở admin-shell (docs/GIAO-DIEN-GOC.md mục 5) */
const ICON: Record<string, LucideIcon> = {
  "alarm-clock": AlarmClock, users: Users, "clipboard-check": ClipboardCheck, "notebook-pen": NotebookPen,
  "scroll-text": ScrollText, "refresh-cw": RefreshCw, "check-check": CheckCheck, "credit-card": CreditCard,
  "undo-2": Undo2, "clipboard-list": ClipboardList, "message-square-plus": MessageSquarePlus,
  "heart-handshake": HeartHandshake, award: Award, "bell-ring": BellRing, "flask-conical": FlaskConical,
};

const FILTER_KEY = "sr-inbox-group";

function readFilter(): string {
  try { return localStorage.getItem(FILTER_KEY) ?? ""; } catch { return ""; }
}
function writeFilter(v: string) {
  try { localStorage.setItem(FILTER_KEY, v); } catch { /* trình duyệt chặn lưu trữ */ }
}

const rowKey = (g: GroupKey, id: string) => `${g}::${id}`;

export function InboxBoard({ greeting }: { greeting: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const q = useQuery({ ...trpc.inbox.today.queryOptions(), refetchInterval: 120_000 });
  const act = useMutation(trpc.inbox.act.mutationOptions());
  const undo = useMutation(trpc.inbox.undo.mutationOptions());

  /** Dòng đã xử lý trong phiên — ẩn ngay (cập nhật lạc quan), hiện lại nếu lỗi */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("");
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => { setFilter(readFilter()); }, []);

  const allGroups = useMemo<Group[]>(() => {
    const groups = q.data?.groups ?? [];
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(rowKey(g.key, i.id))) }))
      .filter((g) => g.items.length > 0);
  }, [q.data, hidden]);

  const groups = useMemo(() => (filter ? allGroups.filter((g) => g.key === filter) : allGroups), [allGroups, filter]);

  /** Danh sách phẳng để đi bằng phím j/k qua mọi nhóm đang hiện */
  const rows = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ group: g, item: i }))), [groups]);

  const setFilterAndRemember = (v: string) => { setFilter(v); writeFilter(v); };

  const toggle = useCallback((key: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const run = useCallback(async (group: Group, ids: string[]) => {
    if (group.actionKind !== "mutate" || ids.length === 0) return;
    const keys = ids.map((id) => rowKey(group.key, id));
    setHidden((h) => new Set([...h, ...keys]));
    setSelected((s) => { const n = new Set(s); keys.forEach((k) => n.delete(k)); return n; });
    try {
      const res = await act.mutateAsync({ group: group.key, ids });
      setDoneCount((n) => n + res.done);
      if (res.failed.length > 0) {
        // Trả lại đúng những dòng lỗi để người dùng thử lại
        const failedKeys = new Set(res.failed.map((f) => rowKey(group.key, f.id)));
        setHidden((h) => new Set([...h].filter((k) => !failedKeys.has(k))));
        toast.error(`Xong ${res.done} việc, ${res.failed.length} việc không chạy được`, { detail: res.failed[0]?.message });
      } else if (group.undoable) {
        toast.ok(`Đã xử lý ${res.done} việc · ${group.title.toLowerCase()}`, {
          undoLabel: "Hoàn tác",
          onUndo: async () => {
            await undo.mutateAsync({ group: group.key, ids });
            setHidden((h) => new Set([...h].filter((k) => !keys.includes(k))));
            setDoneCount((n) => Math.max(0, n - res.done));
            await qc.invalidateQueries({ queryKey: trpc.inbox.today.queryKey() });
          },
        });
      } else {
        toast.ok(`Đã xử lý ${res.done} việc · ${group.title.toLowerCase()}`);
      }
      await qc.invalidateQueries({ queryKey: trpc.inbox.today.queryKey() });
    } catch (e) {
      setHidden((h) => new Set([...h].filter((k) => !keys.includes(k))));
      toast.error("Không thực hiện được", { detail: e instanceof Error ? e.message : undefined });
    }
  }, [act, undo, qc, trpc, toast]);

  const primaryOf = useCallback((group: Group, item: Item) => {
    if (group.actionKind === "open") { router.push(item.href); return; }
    void run(group, [item.id]);
  }, [router, run]);

  const { cursor, setCursor } = useListKeys({
    count: rows.length,
    onOpen: (i) => { const r = rows[i]; if (r) router.push(r.item.href); },
    onToggle: (i) => { const r = rows[i]; if (r && r.group.actionKind === "mutate") toggle(rowKey(r.group.key, r.item.id)); },
    onPrimary: (i) => { const r = rows[i]; if (r) primaryOf(r.group, r.item); },
  });

  const totalTasks = allGroups.reduce((a, g) => a + g.items.length, 0);
  const totalOverdue = allGroups.reduce((a, g) => a + g.items.filter((i) => i.overdue).length, 0);

  let flat = -1; // chỉ số phẳng dùng cho phím tắt

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Việc hôm nay</h1>
          <p className="text-sm text-muted-foreground">{greeting}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Bấm <kbd className="rounded border border-border bg-muted px-1">?</kbd> xem phím tắt · <kbd className="rounded border border-border bg-muted px-1">E</kbd> làm ngay dòng đang trỏ
        </p>
      </div>

      {/* Khối 1 — tối đa 4 thẻ số liệu */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Tóm tắt việc hôm nay">
        <Stat label="Việc cần làm" value={totalTasks} />
        <Stat label="Quá hạn" value={totalOverdue} tone={totalOverdue > 0 ? "warn" : undefined} />
        <Stat label="Nhóm việc" value={allGroups.length} />
        <Stat label="Đã xử lý (phiên này)" value={doneCount} tone={doneCount > 0 ? "ok" : undefined} />
      </section>

      {/* Khối 2 — bộ lọc nhóm, thay cho tab */}
      {allGroups.length > 0 && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Lọc theo nhóm việc">
          <FilterChip active={filter === ""} onClick={() => setFilterAndRemember("")} label="Tất cả" count={totalTasks} />
          {allGroups.map((g) => (
            <FilterChip key={g.key} active={filter === g.key} onClick={() => setFilterAndRemember(g.key)} label={g.title} count={g.items.length} />
          ))}
        </nav>
      )}

      {/* Khối 3 — danh sách việc, mỗi dòng đúng một nút hành động chính */}
      <section className="card overflow-hidden" aria-label="Danh sách việc">
        {q.isLoading && <RowSkeleton rows={5} />}
        {q.isError && (
          <EmptyState
            title="Không tải được danh sách việc"
            hint={q.error instanceof Error ? q.error.message : "Thử tải lại trang hoặc kiểm tra kết nối."}
            action={<button type="button" className="btn-ghost min-h-10" onClick={() => void q.refetch()}>Thử lại</button>}
          />
        )}
        {!q.isLoading && !q.isError && groups.length === 0 && (
          <EmptyState
            title={filter ? "Nhóm này đã sạch việc" : "Hôm nay bạn không còn việc nào tồn"}
            hint={filter ? "Bỏ lọc để xem các nhóm việc còn lại." : "Vào Dashboard xem số liệu, hoặc mở Leads để chăm khách đang mở."}
            action={filter
              ? <button type="button" className="btn-ghost min-h-10" onClick={() => setFilterAndRemember("")}>Xem tất cả nhóm</button>
              : <Link href="/dashboard" className="btn-ghost min-h-10">Mở Dashboard</Link>}
          />
        )}

        {groups.map((g) => {
          const Icon = ICON[g.icon];
          const groupKeys = g.items.map((i) => rowKey(g.key, i.id));
          const picked = groupKeys.filter((k) => selected.has(k));
          const allPicked = picked.length > 0 && picked.length === groupKeys.length;
          return (
            <div key={g.key} className="border-b border-border last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 bg-muted/60 px-4 py-2">
                {g.actionKind === "mutate" && (
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={allPicked}
                      aria-label={`Chọn tất cả ${g.title}`}
                      onChange={() => setSelected((s) => {
                        const n = new Set(s);
                        if (allPicked) groupKeys.forEach((k) => n.delete(k)); else groupKeys.forEach((k) => n.add(k));
                        return n;
                      })}
                    />
                    <span className="hidden sm:inline">Chọn</span>
                  </label>
                )}
                {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                <h2 className="text-sm font-bold text-foreground">{g.title}</h2>
                <span className="chip bg-primary-soft text-primary">{g.items.length}</span>
                {g.items.some((i) => i.overdue) && <span className="chip bg-red-100 text-red-700">{g.items.filter((i) => i.overdue).length} quá hạn</span>}
                <div className="ml-auto flex items-center gap-2">
                  {g.actionKind === "mutate" && picked.length > 0 && (
                    <ActionButton
                      variant="primary"
                      className="!px-3 !py-1.5 text-xs"
                      busyLabel="Đang chạy…"
                      onRun={() => run(g, picked.map((k) => k.split("::")[1]!))}
                    >
                      {g.actionLabel} {picked.length} việc
                    </ActionButton>
                  )}
                  <Link href={g.href} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">Mở trang đầy đủ</Link>
                </div>
              </div>

              <ul className="divide-y divide-border">
                {g.items.map((it) => {
                  flat += 1;
                  const idx = flat;
                  const key = rowKey(g.key, it.id);
                  const isCursor = idx === cursor;
                  return (
                    <li
                      key={key}
                      data-row-index={idx}
                      onMouseEnter={() => setCursor(idx)}
                      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors ${isCursor ? "bg-primary-soft" : ""}`}
                    >
                      {g.actionKind === "mutate" && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          aria-label={`Chọn việc ${it.title}`}
                        />
                      )}
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="flex items-center gap-2">
                          {it.overdue && <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="Quá hạn" />}
                          <span className="truncate text-sm font-semibold text-foreground">{it.title}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{it.sub}</div>
                      </div>
                      <span className={`shrink-0 text-xs ${it.overdue ? "font-semibold text-red-700" : "text-muted-foreground"}`}>{it.meta}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <ActionButton
                          variant="primary"
                          className="!px-3 !py-1.5 text-xs"
                          busyLabel="Đang chạy…"
                          onRun={() => primaryOf(g, it)}
                          ariaLabel={`${g.actionLabel}: ${it.title}`}
                        >
                          {g.actionLabel}
                        </ActionButton>
                        <Link
                          href={it.href}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          aria-label={`Mở chi tiết: ${it.title}`}
                          title="Mở chi tiết"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="card p-3.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${tone === "warn" ? "text-red-700" : tone === "ok" ? "text-green-700" : "text-foreground"}`}>
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-muted"}`}>{count}</span>
    </button>
  );
}
