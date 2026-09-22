"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileText, HeartHandshake, Plus } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { TrialReportDrawer, TrialReportStatusChip, type TrialReportSource } from "./drawer";

const fmt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }) : null;

/**
 * Khối nhỏ "Phiếu đánh giá học thử" trên trang chi tiết lead: mã, trạng thái, lượt xem,
 * phản hồi phụ huynh — bấm để mở drawer. Có nút lập phiếu cho bé (buổi thử ngoài hệ thống).
 */
export function LeadTrialReportsBlock({
  leadId, kids, canCreate,
}: {
  leadId: string;
  /** Các con trong lead (để lập phiếu cho đúng bé) */
  kids: { id: string; fullName: string }[];
  canCreate: boolean;
}) {
  const trpc = useTRPC();
  const q = useQuery(trpc.admissions.trialReports.list.queryOptions({ leadId }));
  const [openId, setOpenId] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<TrialReportSource | null>(null);
  const [kid, setKid] = useState<string>(kids[0]?.id ?? "");

  // Không có quyền xem phiếu → ẩn cả khối, không làm rối trang lead
  if (q.error) return null;
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0 && !canCreate) return null;

  return (
    <section className="card space-y-2 p-4" aria-label="Phiếu đánh giá học thử">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-bold"><FileText className="h-4 w-4 text-primary" aria-hidden /> Phiếu đánh giá học thử</h2>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            {kids.length > 1 && (
              <select className="input !w-auto !py-1 text-xs" value={kid} onChange={(e) => setKid(e.target.value)} aria-label="Chọn bé">
                {kids.map((k) => <option key={k.id} value={k.id}>{k.fullName}</option>)}
              </select>
            )}
            <button type="button" className="btn-ghost min-h-10 !px-3 !py-1 text-xs" onClick={() => setNewSource({ leadId, childId: kid || null })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Lập phiếu
            </button>
          </div>
        )}
      </div>
      {q.isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có phiếu. Phiếu thường được lập ngay từ buổi học thử (nút &quot;Phiếu đánh giá&quot; ở Lớp Trial).</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(r.id)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:bg-muted/60">
                <span className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-primary">{r.code}</span>{" "}
                  <span className="font-medium">{r.childName}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {[r.courseCode, fmt(r.sessionAt), r.linkState === "expired" ? "link hết hạn" : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  <TrialReportStatusChip status={r.status} />
                  {r.status !== "draft" && <span className="chip bg-muted text-foreground"><Eye className="mr-1 h-3 w-3" aria-hidden />{r.viewCount}</span>}
                  {r.parentResponse && <span className="chip bg-accent-100 text-accent-700"><HeartHandshake className="mr-1 h-3 w-3" aria-hidden />PH đăng ký tư vấn</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openId && <TrialReportDrawer reportId={openId} onClose={() => setOpenId(null)} />}
      {newSource && <TrialReportDrawer source={newSource} onClose={() => setNewSource(null)} />}
    </section>
  );
}
