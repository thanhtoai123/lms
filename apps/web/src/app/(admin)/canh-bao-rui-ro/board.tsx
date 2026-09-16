"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Empty } from "@/components/ui";
import { fmtDateTime } from "@/components/lead-ui";

type Item = { id: string; code: string; title: string; severity: number; status: string; dueAt: Date; overdue: boolean; studentId: string; studentName: string; studentCode: string | null; classId: string | null; classCode: string | null; centerCode: string | null };
const CODE_VI: Record<string, string> = { CONSECUTIVE_ABSENCE: "Nghỉ liên tiếp", LOW_ATTENDANCE: "Chuyên cần thấp", PENDING_MAKEUP: "Chờ học bù" };

export function RiskBoard({ items }: { items: Item[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const scan = useMutation(trpc.schedule.rescanRisks.mutationOptions({ onSuccess: (r) => { setMsg(`Đã quét ${r.scanned} đăng ký, phát hiện ${r.signals} tín hiệu (việc trùng được bỏ qua).`); router.refresh(); } }));
  const resolve = useMutation(trpc.engagement.resolveCareTask.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" disabled={scan.isPending} onClick={() => scan.mutate({})}>{scan.isPending ? "Đang quét…" : "Quét lại rủi ro"}</button>
        {msg && <span className="text-sm text-ink-600">{msg}</span>}
      </div>
      {items.length === 0 ? <Empty>Không có cảnh báo nào đang mở.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Rủi ro</th><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Hạn xử lý</th><th className="p-3">Kết quả</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {items.map((t) => (
                <tr key={t.id} className={t.overdue ? "bg-red-50/40" : ""}>
                  <td className="p-3"><span className={`chip ${t.severity === 1 ? "bg-red-100 text-red-700" : t.severity === 2 ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>{CODE_VI[t.code] ?? t.code}</span><div className="mt-1 text-xs text-ink-600">{t.title.replace(/^Chăm sóc: /, "")}</div></td>
                  <td className="p-3"><Link href={`/students/${t.studentId}`} className="font-medium text-brand-600">{t.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{t.studentCode}</div></td>
                  <td className="p-3">{t.classId ? <Link href={`/attendance?class=${t.classId}`} className="hover:underline">{t.classCode}</Link> : "—"}<div className="text-xs text-ink-400">{t.centerCode ?? ""}</div></td>
                  <td className={`p-3 text-xs ${t.overdue ? "font-semibold text-red-700" : ""}`}>{fmtDateTime(t.dueAt)}{t.status === "in_progress" ? <div className="text-ink-400">đang xử lý</div> : null}</td>
                  <td className="p-3"><input className="input !py-1 text-xs" placeholder="Đã gọi PH…" value={outcome[t.id] ?? ""} onChange={(e) => setOutcome({ ...outcome, [t.id]: e.target.value })} /></td>
                  <td className="p-3 whitespace-nowrap">
                    {t.status === "open" && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => resolve.mutate({ id: t.id, status: "in_progress" })}>Nhận</button>}
                    <button className="btn-primary !px-2 !py-1 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: t.id, status: "done", outcome: outcome[t.id] })}>Xong</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
