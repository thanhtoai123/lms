"use client";

import Link from "next/link";
import { REPORT_CARD_STATUS_VI, type ReportCardStatus } from "@satarobo/core";

type Q = { id: string; status: ReportCardStatus; seq: number; submittedAt: string | null; averageScore: string | null; enrollmentId: string; studentName: string; classCode: string; authorName: string | null };

export function ReviewQueue({ items }: { items: Q[] }) {
  const submitted = items.filter((i) => i.status === "submitted");
  const approved = items.filter((i) => i.status === "approved");
  return (
    <aside className="card h-fit space-y-3 p-4">
      <h2 className="font-bold">Hàng đợi duyệt</h2>
      {[{ title: "Chờ duyệt", list: submitted }, { title: "Đã duyệt — chờ gửi PH", list: approved }].map((g) => (
        <div key={g.title}>
          <div className="label">{g.title} ({g.list.length})</div>
          <div className="space-y-1">
            {g.list.slice(0, 15).map((i) => (
              <Link key={i.id} href={`/report-cards/${i.enrollmentId}/${i.seq}`} className="block rounded-lg border border-black/5 p-2 text-sm hover:border-brand-600/40">
                <div className="font-medium">{i.studentName}</div>
                <div className="text-[11px] text-ink-400">{i.classCode} · buổi {i.seq}{i.averageScore ? ` · TB ${i.averageScore}` : ""} · {i.authorName ?? "?"} · {REPORT_CARD_STATUS_VI[i.status]}</div>
              </Link>
            ))}
            {g.list.length === 0 && <div className="text-xs text-ink-400">Trống</div>}
          </div>
        </div>
      ))}
    </aside>
  );
}
