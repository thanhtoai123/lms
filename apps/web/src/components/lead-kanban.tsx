"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LEAD_STATUSES, LEAD_STATUS_VI, type LeadStatus } from "@satarobo/core";
import { LEAD_CHIP, SlaChip } from "@/components/lead-ui";
import { LeadStatusSelect } from "@/components/lead-status";

export type KanbanItem = {
  id: string;
  status: LeadStatus;
  parentName: string;
  phone: string;
  childName: string | null;
  childGrade: number | null;
  courseCode: string | null;
  source: string | null;
  assignedToId: string | null;
  assigneeName: string | null;
  createdAt: string;
  canAssign: boolean;
  sla: { level: "ok" | "warning" | "overdue"; overdueMinutes: number; dueAt: string | null };
};

const PER_COLUMN = [5, 10, 20, 50, 100];
const ddmm = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });

/** Kanban lead theo trạng thái mở (chế độ xem ?view=kanban của /leads): đổi trạng thái, phân công lead chưa có sale */
export function LeadKanban({ items }: { items: KanbanItem[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [perCol, setPerCol] = useState(20);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const assign = useMutation(trpc.admissions.leads.distributeOne.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã phân công lead cho ${r.assigneeName ?? "sale"}` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: `Không phân công được: ${e.message}` }),
  }));
  const cols = LEAD_STATUSES.filter((s) => s !== "enrolled" && s !== "lost");
  return (
    <div className="space-y-2">
      {msg && <div className={`rounded-xl border p-2 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((s) => {
          const list = items.filter((i) => i.status === s);
          return (
            <div key={s} className="min-w-[240px] w-[240px] shrink-0 rounded-2xl bg-black/[0.03] p-2">
              <div className="flex items-center justify-between px-1 pb-2"><span className={`chip ${LEAD_CHIP[s]}`}>{LEAD_STATUS_VI[s]}</span><span className="text-xs text-ink-400">{list.length}</span></div>
              <div className="space-y-2">
                {list.slice(0, perCol).map((l) => (
                  <div key={l.id} className={`rounded-xl bg-white p-2.5 shadow-sm border ${l.sla.level === "overdue" ? "border-red-300" : "border-black/5"}`}>
                    <Link href={`/leads/${l.id}`} className="block truncate text-sm font-medium hover:text-brand-700" title="Xem chi tiết lead">{l.parentName}</Link>
                    <div className="truncate text-[11px] text-ink-400">
                      {/x/i.test(l.phone) ? l.phone : <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a>}
                      {" · "}{l.childName ?? "—"}{l.childGrade ? ` · L${l.childGrade}` : ""} · {l.courseCode ?? "?"}
                    </div>
                    <div className="truncate text-[11px] text-ink-400">Nguồn: {l.source ?? "—"} · {ddmm(l.createdAt)}</div>
                    <div className="truncate text-[11px] text-ink-600">{l.assigneeName ? `Sale: ${l.assigneeName}` : "Chưa phân công"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <SlaChip sla={l.sla} />
                      <LeadStatusSelect compact leadId={l.id} status={l.status} onDone={() => router.refresh()} />
                      {!l.assignedToId && l.canAssign && (
                        <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" disabled={assign.isPending} onClick={() => { setMsg(null); assign.mutate({ leadId: l.id }); }}>Phân công</button>
                      )}
                    </div>
                  </div>
                ))}
                {list.length > perCol && <div className="px-1 text-[11px] text-ink-400">…{list.length - perCol} thẻ nữa — tăng &quot;Mỗi cột&quot; ở dưới để xem thêm</div>}
                {list.length === 0 && <div className="py-3 text-center text-[11px] text-ink-400">Trống</div>}
              </div>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-600">Mỗi cột
        <select className="input !w-auto !py-1 text-xs" value={perCol} onChange={(e) => setPerCol(Number(e.target.value))}>{PER_COLUMN.map((n) => <option key={n} value={n}>{n} thẻ</option>)}</select>
      </label>
    </div>
  );
}
