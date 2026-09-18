"use client";

import { useState } from "react";
import { ChartColumn } from "lucide-react";
import { Drawer } from "@/components/drawer";

/**
 * Biểu đồ phụ của Dashboard nằm trong panel trượt phải: màn hình chính chỉ giữ
 * ba khối (thẻ số liệu · phễu lead · lead mới nhất), số liệu tham khảo mở khi cần.
 */
export function MoreCharts({
  series, byStatus, statusLabel, statusChip,
}: {
  series: { day: string; n: number }[];
  byStatus: { status: string; n: number }[];
  statusLabel: Record<string, string>;
  statusChip: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const maxDay = Math.max(1, ...series.map((s) => s.n));
  const total = byStatus.reduce((a, b) => a + b.n, 0);
  const sorted = [...byStatus].sort((a, b) => b.n - a.n);

  return (
    <>
      <button type="button" className="btn-ghost min-h-10 text-xs" onClick={() => setOpen(true)}>
        <ChartColumn className="h-4 w-4" aria-hidden />
        Biểu đồ chi tiết
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Biểu đồ chi tiết" desc="Lead 14 ngày qua và phân bố theo trạng thái" width="md">
        <div className="space-y-6">
          <section>
            <h3 className="font-bold text-foreground">Leads 14 ngày qua</h3>
            <p className="mb-3 text-xs text-muted-foreground">Số lead mới mỗi ngày</p>
            <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Biểu đồ lead 14 ngày: ${series.map((s) => `${s.day} có ${s.n}`).join(", ")}`}>
              {series.map((s) => (
                <div key={s.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="text-[10px] text-muted-foreground">{s.n || ""}</div>
                  <div className="w-full rounded-t bg-primary/80" style={{ height: `${(s.n / maxDay) * 80}%`, minHeight: s.n ? 4 : 1 }} title={`${s.day}: ${s.n}`} />
                  <div className="text-[9px] text-muted-foreground">{s.day.slice(8)}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-foreground">Phân bố theo trạng thái</h3>
            <p className="mb-3 text-xs text-muted-foreground">Tất cả leads</p>
            <div className="space-y-2">
              {sorted.map((s) => (
                <div key={s.status} className="flex items-center gap-3 text-sm">
                  <span className={`chip w-28 shrink-0 justify-center ${statusChip[s.status] ?? "bg-muted"}`}>{statusLabel[s.status] ?? s.status}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${total ? (s.n / total) * 100 : 0}%` }} /></div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs">{s.n}</span>
                </div>
              ))}
              {sorted.length === 0 && <p className="text-sm text-muted-foreground">Chưa có lead nào để thống kê.</p>}
            </div>
          </section>
        </div>
      </Drawer>
    </>
  );
}
