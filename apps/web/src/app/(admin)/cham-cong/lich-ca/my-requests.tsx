"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { RequestChip } from "@/components/hr-ui";
import type { RequestStatus } from "@satarobo/core";
import { CancelMine } from "./self";

export interface MyRequestRow {
  id: string; kind: string; kindLabel: string; status: RequestStatus; when: string; reason: string;
  late: boolean; effect: string | null; note: string | null; applyError: string | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const selectCls = "min-h-11 rounded-xl border border-border bg-card px-3 text-[14px]";

/** Đơn của tôi: tìm theo lý do / loại đơn, lọc loại + trạng thái; mặc định ẩn đơn đã huỷ khi có nhiều đơn */
export function MyRequests({ rows, kinds }: { rows: MyRequestRow[]; kinds: { key: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [st, setSt] = useState<"" | RequestStatus>("");
  const list = useMemo(() => {
    const k = fold(q.trim());
    return rows.filter((r) => (!kind || r.kind === kind) && (!st || r.status === st) && (!k || fold(`${r.kindLabel} ${r.reason} ${r.when}`).includes(k)));
  }, [rows, q, kind, st]);
  const pending = rows.filter((r) => r.status === "pending").length;

  if (rows.length === 0) return <div className="text-sm text-ink-400">Chưa có đơn nào. Bấm "Tạo đơn" ở trên để gửi đơn đầu tiên.</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
        <span>{rows.length} đơn</span>{pending > 0 && <button type="button" onClick={() => setSt("pending")} className="chip bg-amber-100 text-amber-800">{pending} đang chờ duyệt</button>}
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo lý do, loại đơn…" aria-label="Tìm đơn" className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[15px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Lọc theo loại đơn" value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>
          <option value="">Mọi loại đơn</option>
          {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <select aria-label="Lọc theo trạng thái" value={st} onChange={(e) => setSt(e.target.value as typeof st)} className={selectCls}>
          <option value="">Mọi trạng thái</option>
          <option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="cancelled">Đã huỷ</option>
        </select>
        {(q || kind || st) && <button type="button" className="min-h-11 px-2 text-[14px] font-semibold text-brand-600" onClick={() => { setQ(""); setKind(""); setSt(""); }}>Xoá lọc</button>}
      </div>
      {list.length === 0 ? <div className="rounded-xl bg-black/[0.03] p-4 text-center text-sm text-ink-400">Không có đơn khớp bộ lọc.</div> : (
        <ul className="divide-y divide-black/5" aria-live="polite">
          {list.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{r.kindLabel}</div>
                <div className="text-[13px] text-ink-600">{r.when}</div>
                <div className="text-[13px]">{r.reason}{r.late && <span className="ml-1 chip bg-amber-100 text-amber-800">Nộp muộn</span>}</div>
                {r.effect && <div className="text-[13px] text-ink-500">Thay đổi: {r.effect}</div>}
                {r.note && <div className="text-[13px] text-amber-800">↳ {r.note}</div>}
                {r.applyError && <div className="text-[13px] text-red-700">Lần duyệt gần nhất không áp được: {r.applyError}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1"><RequestChip status={r.status} />{r.status === "pending" && <CancelMine id={r.id} />}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
