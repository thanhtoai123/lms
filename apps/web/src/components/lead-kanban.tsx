import Link from "next/link";
import { LEAD_STATUSES, LEAD_STATUS_VI, type LeadStatus } from "@satarobo/core";
import { LEAD_CHIP, SlaChip } from "@/components/lead-ui";

type Item = { id: string; status: LeadStatus; parentName: string; childName: string | null; childGrade: number | null; courseCode: string | null; assigneeName: string | null; sla: { level: "ok" | "warning" | "overdue"; overdueMinutes: number; dueAt: string | null } };

/** Kanban lead theo trạng thái mở (chế độ xem ?view=kanban của /leads) */
export function LeadKanban({ items }: { items: Item[] }) {
  const cols = LEAD_STATUSES.filter((s) => s !== "enrolled" && s !== "lost") as LeadStatus[];
  return (
      <div className="flex gap-3 overflow-x-auto pb-2">
      {cols.map((s) => {
        const list = items.filter((i) => i.status === s);
        return (
          <div key={s} className="min-w-[230px] w-[230px] shrink-0 rounded-2xl bg-black/[0.03] p-2">
            <div className="flex items-center justify-between px-1 pb-2"><span className={`chip ${LEAD_CHIP[s]}`}>{LEAD_STATUS_VI[s]}</span><span className="text-xs text-ink-400">{list.length}</span></div>
            <div className="space-y-2">
              {list.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className={`block rounded-xl bg-white p-2.5 shadow-sm border ${l.sla.level === "overdue" ? "border-red-300" : "border-black/5"} hover:border-brand-500/50`}>
                  <div className="text-sm font-medium truncate">{l.parentName}</div>
                  <div className="text-[11px] text-ink-400 truncate">{l.childName ?? "—"}{l.childGrade ? ` · L${l.childGrade}` : ""} · {l.courseCode ?? "?"}</div>
                  <div className="mt-1 flex items-center justify-between gap-1"><SlaChip sla={l.sla} /><span className="text-[10px] text-ink-400 truncate">{l.assigneeName ?? "chưa phân"}</span></div>
                </Link>
              ))}
              {list.length === 0 && <div className="text-[11px] text-ink-400 text-center py-3">Trống</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
