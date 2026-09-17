"use client";

import { SlotEditor, toSlotInput, type SlotRow, type Opt } from "./slot-editor";

export type PhaseRow = { from: string; to: string; note: string; slots: SlotRow[] };

export const emptySlot = (): SlotRow => ({ weekday: 6, startTime: "15:45", endTime: "17:15", roomId: "", teacherId: "" });
export const emptyPhase = (from: string): PhaseRow => ({ from, to: "", note: "", slots: [emptySlot()] });

const addDay = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Giai đoạn cuối luôn để trống "đến ngày" (kéo dài tới khi học đủ số buổi) */
export function toPhaseInput(rows: PhaseRow[]) {
  return rows.map((p, i) => ({
    from: p.from,
    to: i === rows.length - 1 ? null : p.to || null,
    note: p.note.trim() || null,
    slots: toSlotInput(p.slots),
  }));
}

/**
 * Trình nhập kế hoạch lịch nhiều giai đoạn: mỗi giai đoạn = khoảng ngày + các ca trong tuần + ghi chú.
 * Một lớp có thể đổi nhịp học giữa khoá (vd tháng 7 học 2 buổi/tuần, tháng 8 còn 1 buổi/tuần).
 */
export function PhaseEditor({ rows, onChange, rooms, teachers, startDate }: {
  rows: PhaseRow[]; onChange: (rows: PhaseRow[]) => void; rooms: Opt[]; teachers: Opt[]; startDate: string;
}) {
  const upd = (i: number, patch: Partial<PhaseRow>) => onChange(rows.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const last = rows.length - 1;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-600">
        Một lớp có thể đổi nhịp học giữa khoá. Mỗi giai đoạn khai khoảng ngày + các thứ trong tuần + giờ. Giai đoạn cuối bỏ trống ô “đến ngày” để kéo dài tới khi học đủ số buổi.
      </p>
      {rows.map((p, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-black/10 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-ink-600">Từ ngày *
              <input type="date" className="input mt-1" value={p.from} disabled={i === 0} onChange={(e) => upd(i, { from: e.target.value })} />
              {i === 0 && <span className="text-[11px] text-ink-400">= ngày khai giảng {startDate ? startDate.split("-").reverse().join("/") : ""}</span>}
            </label>
            <label className="text-xs text-ink-600">Đến ngày
              <input type="date" className="input mt-1" value={i === last ? "" : p.to} disabled={i === last} min={p.from} onChange={(e) => upd(i, { to: e.target.value })} />
              {i === last && <span className="text-[11px] text-ink-400">trống = đến hết khoá</span>}
            </label>
            <label className="text-xs text-ink-600">Ghi chú
              <input className="input mt-1" maxLength={200} value={p.note} onChange={(e) => upd(i, { note: e.target.value })} placeholder="VD: nghỉ hè học 1 buổi/tuần" />
            </label>
          </div>
          <SlotEditor rows={p.slots} onChange={(slots) => upd(i, { slots })} rooms={rooms} teachers={teachers} />
          {rows.length > 1 && (
            <button type="button" className="text-xs font-semibold text-red-700" onClick={() => onChange(rows.filter((_, j) => j !== i).map((x, j, arr) => (j === arr.length - 1 ? { ...x, to: "" } : x)))}>
              Xoá giai đoạn {i + 1}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-semibold text-brand-600"
        onClick={() => {
          const prev = rows[last]!;
          const prevTo = prev.to || addDay(prev.from, 30);
          onChange([...rows.slice(0, last), { ...prev, to: prevTo }, emptyPhase(addDay(prevTo, 1))]);
        }}
      >
        + Thêm giai đoạn lịch
      </button>
    </div>
  );
}
